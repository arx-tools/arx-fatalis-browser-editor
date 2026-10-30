import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { isWireframeVisible, startLevelDisplay } from '../../../../src/editor/components/widgets/levelDisplay.ts'
import {
  clearPressedKeys,
  handleKeyDown,
  type KeyboardDownEvent,
} from '../../../../src/editor/modules/keyboard/keyboard.ts'

/**
 * Builds the part of a keydown the dispatcher reads.
 *
 * @param code The key code.
 *
 * @returns The fake event.
 */
function press(code: string): KeyboardDownEvent {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    target: undefined,
    defaultPrevented: false,
    // the dispatcher may call it on an action; the test has nothing to prevent
    preventDefault: (): void => {
      // nothing to prevent in the test
    },
    getModifierState: (): boolean => {
      return false
    },
  }
}

beforeEach(() => {
  clearPressedKeys()
  isWireframeVisible.value = false
})

void describe('isWireframeVisible', () => {
  void it('starts hidden', () => {
    assert.equal(isWireframeVisible.value, false)
  })

  void it('is a preference, not a link value', () => {
    // it has a key like every persisted ref, but no url and no storage: a switch of the view
    assert.equal(isWireframeVisible.key, 'wireframeVisible')
  })
})

void describe('startLevelDisplay', () => {
  void it('flips the switch with the X key', () => {
    startLevelDisplay()

    handleKeyDown(press('KeyX'))
    assert.equal(isWireframeVisible.value, true)

    clearPressedKeys()
    handleKeyDown(press('KeyX'))
    assert.equal(isWireframeVisible.value, false)
  })

  void it('answers the same key after a second start', () => {
    startLevelDisplay()
    startLevelDisplay()

    handleKeyDown(press('KeyX'))
    assert.equal(isWireframeVisible.value, true)
  })
})
