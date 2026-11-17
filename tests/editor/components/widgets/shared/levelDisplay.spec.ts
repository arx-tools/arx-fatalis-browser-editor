import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  isLightsVisible,
  isMeshVisible,
  isPortalsVisible,
  isRoomColorsVisible,
  isWireframeVisible,
  startLevelDisplay,
  toggleLights,
  togglePortals,
  toggleRoomColors,
} from '../../../../../src/editor/components/widgets/shared/levelDisplay.ts'
import {
  clearPressedKeys,
  handleKeyDown,
  type KeyboardDownEvent,
} from '../../../../../src/editor/modules/keyboard/keyboard.ts'

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
  isRoomColorsVisible.value = false
  isPortalsVisible.value = false
  isLightsVisible.value = false
  isMeshVisible.value = true
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

void describe('isLightsVisible', () => {
  void it('starts hidden', () => {
    assert.equal(isLightsVisible.value, false)
  })

  void it('is a preference with a key of its own', () => {
    assert.equal(isLightsVisible.key, 'lightsVisible')
  })
})

void describe('toggleLights', () => {
  void it('flips the switch with the L key', () => {
    startLevelDisplay()

    handleKeyDown(press('KeyL'))
    assert.equal(isLightsVisible.value, true)

    clearPressedKeys()
    handleKeyDown(press('KeyL'))
    assert.equal(isLightsVisible.value, false)
  })

  void it('works while the mesh is turned off: a light is a point of the level, not a surface', () => {
    isMeshVisible.value = false

    toggleLights()
    assert.equal(isLightsVisible.value, true)
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

void describe('toggleRoomColors', () => {
  void it('flips the same switch with the R key', () => {
    startLevelDisplay()

    handleKeyDown(press('KeyR'))
    assert.equal(isRoomColorsVisible.value, true)

    clearPressedKeys()
    handleKeyDown(press('KeyR'))
    assert.equal(isRoomColorsVisible.value, false)
  })

  void it('is the switch the title of the room inspector flips', () => {
    toggleRoomColors()
    assert.equal(isRoomColorsVisible.value, true)

    toggleRoomColors()
    assert.equal(isRoomColorsVisible.value, false)
  })

  void it('does nothing while the mesh is turned off', () => {
    // the map sits under the mesh: it is not drawn without it, so the switch does not get ahead of the view
    isMeshVisible.value = false

    toggleRoomColors()
    assert.equal(isRoomColorsVisible.value, false)
  })
})

void describe('togglePortals', () => {
  void it('flips the switch with the P key', () => {
    startLevelDisplay()

    handleKeyDown(press('KeyP'))
    assert.equal(isPortalsVisible.value, true)

    clearPressedKeys()
    handleKeyDown(press('KeyP'))
    assert.equal(isPortalsVisible.value, false)
  })

  void it('is the switch the eye of the key help flips', () => {
    togglePortals()
    assert.equal(isPortalsVisible.value, true)

    togglePortals()
    assert.equal(isPortalsVisible.value, false)
  })

  void it('does nothing while the mesh is turned off', () => {
    // the outline sits over the mesh: it is not drawn without it, so the switch does not get ahead of the view
    isMeshVisible.value = false

    togglePortals()
    assert.equal(isPortalsVisible.value, false)
  })
})
