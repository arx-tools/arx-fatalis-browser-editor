import assert from 'node:assert/strict'
import { beforeEach, describe, it, type TestContext } from 'node:test'
import { keyboardActions, type KeyboardAction } from '../../../src/_editor/keyboard/actions.ts'
import { createDefaultBindings, type KeyboardBindings } from '../../../src/_editor/keyboard/bindings.ts'
import { isMacPlatform } from '../../../src/_editor/keyboard/functions.ts'
import {
  clearPressedKeys,
  handleKeyDown,
  handleKeyUp,
  getKeyboardBindings,
  isKeyboardActionActive,
  isKeyDown,
  isMacKeyboard,
  onKeyboardActivity,
  setDialogOpen,
  startKeyboard,
  stopKeyboard,
  pickKeyboardAction,
  onKeyboardAction,
  onKeyboardToggle,
  resolveKeyboardMode,
  setKeyboardBindings,
  setPointerLocked,
  type KeyboardDownEvent,
} from '../../../src/_editor/keyboard/keyboard.ts'

/**
 * The flags a test can set on the fake event.
 */
type EventOptions = {
  /**
   * The modifiers which are down.
   */
  mods?: Array<'alt' | 'ctrl' | 'meta' | 'shift'>
  /**
   * Whether the browser reports a held key.
   */
  repeat?: boolean
  /**
   * The element the event comes from.
   */
  target?: unknown
  /**
   * Whether a component already handled the event.
   */
  defaultPrevented?: boolean
  /**
   * Whether `AltGr` is down, which makes the key a composed character.
   */
  altGraph?: boolean
}

/**
 * Builds the part of a keydown the dispatcher reads.
 *
 * @param code The key code.
 * @param options The modifiers and the flags of the event.
 * @returns The fake event, and the log of the `preventDefault` calls.
 */
function createEvent(
  code: string,
  options: EventOptions = {},
): { event: KeyboardDownEvent; preventDefaultCalls: () => number } {
  let expectedPreventDefaultCalls = 0
  const mods = options.mods ?? []

  return {
    event: {
      code,
      ctrlKey: mods.includes('ctrl'),
      altKey: mods.includes('alt'),
      shiftKey: mods.includes('shift'),
      metaKey: mods.includes('meta'),
      repeat: options.repeat ?? false,
      target: options.target,
      defaultPrevented: options.defaultPrevented ?? false,
      preventDefault: (): void => {
        expectedPreventDefaultCalls = expectedPreventDefaultCalls + 1
      },
      getModifierState: (key: string): boolean => {
        return key === 'AltGraph' && options.altGraph === true
      },
    },
    preventDefaultCalls: (): number => {
      return expectedPreventDefaultCalls
    },
  }
}

beforeEach(() => {
  clearPressedKeys()
  setPointerLocked(false)
  setDialogOpen('camera', false)
})

void describe('getKeyboardBindings', () => {
  void it('builds the defaults on the first use', (t: TestContext) => {
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })

    const bindings = getKeyboardBindings()

    t.assert.deepStrictEqual(bindings.toggleMesh, [{ code: 'KeyM', mods: [] }])
    t.assert.deepStrictEqual(bindings.toggleCameraInfo, [])
    // node has no localStorage, so the module reports it once: the bindings still work in memory
    t.assert.ok(warnings.length > 0)
  })
})

void describe('isMacKeyboard', () => {
  void it('follows the platform of the navigator', () => {
    assert.equal(isMacKeyboard(), isMacPlatform(navigator.platform))
  })
})

void describe('setDialogOpen', () => {
  void it('blocks the toggles while a dialog is open', () => {
    let calls = 0
    onKeyboardAction('toggleMesh', () => {
      calls = calls + 1
    })

    setDialogOpen('camera', true)
    assert.equal(handleKeyDown(createEvent('KeyM').event), undefined)
    assert.equal(calls, 0)

    setDialogOpen('camera', false)
    assert.equal(handleKeyDown(createEvent('KeyM').event), 'toggleMesh')
    assert.equal(calls, 1)
  })
})

void describe('onKeyboardActivity', () => {
  void it('calls the listener on every key change and stops when removed', () => {
    let calls = 0
    const remove = onKeyboardActivity(() => {
      calls = calls + 1
    })

    handleKeyDown(createEvent('KeyM').event)
    handleKeyUp(createEvent('KeyM').event)
    assert.equal(calls, 2)

    remove()
    handleKeyDown(createEvent('KeyM').event)
    assert.equal(calls, 2)
  })
})

void describe('startKeyboard', () => {
  void it('attaches one listener and reads the events through it', () => {
    const listeners = new Map<string, (event: KeyboardDownEvent) => void>()
    const fakeWindow = {
      addEventListener: (type: string, listener: (event: KeyboardDownEvent) => void): void => {
        listeners.set(type, listener)
      },
    }

    startKeyboard(fakeWindow)
    assert.equal(listeners.size, 3)

    const keydown = listeners.get('keydown')
    const keyup = listeners.get('keyup')
    const blur = listeners.get('blur')

    if (keydown === undefined || keyup === undefined || blur === undefined) {
      throw new Error('the three listeners were not attached')
    }

    keydown(createEvent('KeyM').event)
    assert.equal(isKeyDown('KeyM'), true)

    keyup(createEvent('KeyM').event)
    assert.equal(isKeyDown('KeyM'), false)

    keydown(createEvent('KeyM').event)
    blur(createEvent('KeyM').event)
    assert.equal(isKeyDown('KeyM'), false)

    stopKeyboard()
  })

  void it('takes the bindings a settings panel wrote', () => {
    const bindings = createDefaultBindings(false)
    bindings.toggleMesh = [{ code: 'KeyN', mods: [] }]

    setKeyboardBindings(bindings)
    assert.equal(handleKeyDown(createEvent('KeyN').event), 'toggleMesh')

    // the module keeps the bindings: put the defaults back for the other tests
    setKeyboardBindings(createDefaultBindings(false))
  })

  void it('ignores a second start and has nothing to do without a window', () => {
    let attachCount = 0
    const fakeWindow = {
      addEventListener: (): void => {
        attachCount = attachCount + 1
      },
    }

    startKeyboard(fakeWindow)
    const afterFirstStart = attachCount
    startKeyboard(fakeWindow)
    assert.equal(attachCount, afterFirstStart)

    stopKeyboard()
    // node has no window: there is nothing to attach the listeners to
    startKeyboard()
    assert.equal(attachCount, afterFirstStart)
  })
})

void describe('resolveKeyboardMode', () => {
  void it('is typing while a text field has the focus', () => {
    assert.equal(resolveKeyboardMode({ tagName: 'INPUT' }, false, false), 'typing')
    assert.equal(resolveKeyboardMode({ tagName: 'TEXTAREA' }, true, true), 'typing')
  })

  void it('is pointerLocked while the scene holds the mouse', () => {
    assert.equal(resolveKeyboardMode(undefined, true, false), 'pointerLocked')
    assert.equal(resolveKeyboardMode({ tagName: 'DIV' }, true, false), 'pointerLocked')
  })

  void it('is dialog while a dialog is open', () => {
    assert.equal(resolveKeyboardMode({ tagName: 'DIV' }, false, true), 'dialog')
  })

  void it('is editor otherwise', () => {
    assert.equal(resolveKeyboardMode({ tagName: 'DIV' }, false, false), 'editor')
    assert.equal(resolveKeyboardMode(undefined, false, false), 'editor')
  })
})

void describe('pickKeyboardAction', () => {
  void it('finds the toggle in the editor mode', () => {
    const { event } = createEvent('KeyM')
    const action = pickKeyboardAction(event, keyboardActions, createDefaultBindings(false), 'editor')

    assert.equal(action?.id, 'toggleMesh')
  })

  void it('does not fire a toggle while typing', () => {
    const { event } = createEvent('KeyM')
    const action = pickKeyboardAction(event, keyboardActions, createDefaultBindings(false), 'typing')

    assert.equal(action, undefined)
  })

  void it('does not fire a toggle while a dialog is open', () => {
    const { event } = createEvent('KeyM')
    const action = pickKeyboardAction(event, keyboardActions, createDefaultBindings(false), 'dialog')

    assert.equal(action, undefined)
  })

  void it('fires the movement only in the pointerLocked mode', () => {
    const { event } = createEvent('KeyW')
    const bindings = createDefaultBindings(false)

    assert.equal(pickKeyboardAction(event, keyboardActions, bindings, 'editor'), undefined)
    assert.equal(pickKeyboardAction(event, keyboardActions, bindings, 'pointerLocked')?.id, 'moveForward')
  })

  void it('fires Escape in the pointerLocked mode and in the dialog', () => {
    const { event } = createEvent('Escape')
    const bindings = createDefaultBindings(false)

    assert.equal(pickKeyboardAction(event, keyboardActions, bindings, 'pointerLocked')?.id, 'unlockPointer')
    assert.equal(pickKeyboardAction(event, keyboardActions, bindings, 'dialog')?.id, 'closeDialog')
  })

  void it('takes the first matching action of the table', () => {
    const table: KeyboardAction[] = [
      { id: 'toggleMesh', label: 'first', group: 'view', keys: [{ code: 'KeyM' }] },
      { id: 'toggleWireframe', label: 'second', group: 'view', keys: [{ code: 'KeyM' }] },
    ]
    const { event } = createEvent('KeyM')

    assert.equal(pickKeyboardAction(event, table, createDefaultBindings(false), 'editor')?.label, 'first')
  })

  void it('gives back nothing for a key which is not bound', () => {
    const { event } = createEvent('KeyZ')
    const action = pickKeyboardAction(event, keyboardActions, createDefaultBindings(false), 'editor')

    assert.equal(action, undefined)
  })

  void it('ignores an action which has no binding at all', () => {
    const { event } = createEvent('KeyM')
    const bindings: KeyboardBindings = createDefaultBindings(false)

    bindings.toggleMesh = []

    assert.equal(pickKeyboardAction(event, keyboardActions, bindings, 'editor'), undefined)
  })
})

void describe('handleKeyDown', () => {
  void it('runs the handler and stops the browser default', () => {
    let calls = 0
    onKeyboardAction('toggleMesh', () => {
      calls = calls + 1
    })
    const { event, preventDefaultCalls } = createEvent('KeyM')

    const fired = handleKeyDown(event)

    assert.equal(fired, 'toggleMesh')
    assert.equal(calls, 1)
    assert.equal(preventDefaultCalls(), 1)
  })

  void it('runs a held key only once', () => {
    let calls = 0
    onKeyboardAction('toggleMesh', () => {
      calls = calls + 1
    })
    const first = createEvent('KeyM')
    const repeated = createEvent('KeyM', { repeat: true })

    handleKeyDown(first.event)
    handleKeyDown(repeated.event)

    assert.equal(calls, 1)
  })

  void it('keeps the pressed key even when nothing fires', () => {
    const { event } = createEvent('KeyZ')

    handleKeyDown(event)

    assert.equal(isKeyDown('KeyZ'), true)
    handleKeyUp(event)
    assert.equal(isKeyDown('KeyZ'), false)
  })

  void it('leaves an event alone which a component already handled', () => {
    let calls = 0
    onKeyboardAction('toggleMesh', () => {
      calls = calls + 1
    })
    const { event, preventDefaultCalls } = createEvent('KeyM', { defaultPrevented: true })

    assert.equal(handleKeyDown(event), undefined)
    assert.equal(calls, 0)
    assert.equal(preventDefaultCalls(), 0)
  })

  void it('ignores a composed character', () => {
    const { event } = createEvent('KeyM', { altGraph: true })

    assert.equal(handleKeyDown(event), undefined)
  })

  void it('does not fire while a text field has the focus', () => {
    let calls = 0
    onKeyboardAction('toggleMesh', () => {
      calls = calls + 1
    })
    const { event } = createEvent('KeyM', { target: { tagName: 'INPUT' } })

    assert.equal(handleKeyDown(event), undefined)
    assert.equal(calls, 0)
  })

  void it('fires the dialog action while a text field has the focus', () => {
    let calls = 0
    onKeyboardAction('closeDialog', () => {
      calls = calls + 1
    })
    const { event } = createEvent('Escape', { target: { tagName: 'INPUT' } })

    assert.equal(handleKeyDown(event), 'closeDialog')
    assert.equal(calls, 1)
  })
})

void describe('isKeyboardActionActive', () => {
  void it('is on while the key of the action is down', () => {
    setPointerLocked(true)
    const { event } = createEvent('KeyW')

    handleKeyDown(event)
    assert.equal(isKeyboardActionActive('moveForward'), true)

    handleKeyUp(event)
    assert.equal(isKeyboardActionActive('moveForward'), false)
  })

  void it('reads the second combo of an action too', () => {
    const { event } = createEvent('ArrowUp')

    handleKeyDown(event)

    assert.equal(isKeyboardActionActive('moveForward'), true)
  })

  void it('stops when the pointer lock ends', () => {
    setPointerLocked(true)
    handleKeyDown(createEvent('KeyW').event)

    setPointerLocked(false)

    assert.equal(isKeyboardActionActive('moveForward'), false)
  })
})

void describe('onKeyboardToggle', () => {
  void it('flips the ref of the action', () => {
    const ref = { value: false }
    onKeyboardToggle('toggleMesh', ref)

    handleKeyDown(createEvent('KeyM').event)
    assert.equal(ref.value, true)

    handleKeyDown(createEvent('KeyM').event)
    assert.equal(ref.value, false)
  })
})
