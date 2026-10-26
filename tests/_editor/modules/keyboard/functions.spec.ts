import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCombo,
  formatModifier,
  getComboId,
  getKeyLabel,
  getModifierOfKey,
  isEditableTarget,
  isMacPlatform,
  matchesCombo,
  pressedModifiers,
  resolveKeys,
  resolveModifiers,
  type KeyboardEventLike,
} from '../../../../src/_editor/modules/keyboard/functions.ts'

/**
 * Builds the part of an event the matcher reads.
 *
 * @param code The key code.
 * @param mods The modifiers which are down.
 * @returns The fake event.
 */
function createEvent(code: string, mods: Array<'alt' | 'ctrl' | 'meta' | 'shift'> = []): KeyboardEventLike {
  return {
    code,
    ctrlKey: mods.includes('ctrl'),
    altKey: mods.includes('alt'),
    shiftKey: mods.includes('shift'),
    metaKey: mods.includes('meta'),
  }
}

void describe('isMacPlatform', () => {
  void it('knows the apple platforms', () => {
    assert.equal(isMacPlatform('MacIntel'), true)
    assert.equal(isMacPlatform('iPhone'), true)
    assert.equal(isMacPlatform('iPad'), true)
  })

  void it('rejects the others', () => {
    assert.equal(isMacPlatform('Win32'), false)
    assert.equal(isMacPlatform('Linux x86_64'), false)
    assert.equal(isMacPlatform(''), false)
  })
})

void describe('getModifierOfKey', () => {
  void it('names the modifier a modifier key stands for', () => {
    assert.equal(getModifierOfKey('ShiftLeft'), 'shift')
    assert.equal(getModifierOfKey('ShiftRight'), 'shift')
    assert.equal(getModifierOfKey('ControlLeft'), 'ctrl')
    assert.equal(getModifierOfKey('AltRight'), 'alt')
    assert.equal(getModifierOfKey('MetaLeft'), 'meta')
  })

  void it('gives back nothing for a normal key', () => {
    assert.equal(getModifierOfKey('KeyM'), undefined)
    assert.equal(getModifierOfKey('F2'), undefined)
  })
})

void describe('resolveModifiers', () => {
  void it('keeps the concrete modifiers in a canonical order', () => {
    assert.deepEqual(resolveModifiers(undefined, false), [])
    assert.deepEqual(resolveModifiers(['shift', 'ctrl'], false), ['ctrl', 'shift'])
    assert.deepEqual(resolveModifiers(['meta', 'alt'], false), ['alt', 'meta'])
  })

  void it('resolves primary to the modifier of the platform', () => {
    assert.deepEqual(resolveModifiers(['primary'], false), ['ctrl'])
    assert.deepEqual(resolveModifiers(['primary'], true), ['meta'])
  })

  void it('drops a duplicate', () => {
    assert.deepEqual(resolveModifiers(['ctrl', 'ctrl'], false), ['ctrl'])
    assert.deepEqual(resolveModifiers(['primary', 'ctrl'], false), ['ctrl'])
  })
})

void describe('resolveKeys', () => {
  void it('resolves every combo of an action', () => {
    assert.deepEqual(resolveKeys([{ code: 'KeyM', mods: ['primary'] }, { code: 'F2' }], true), [
      { code: 'KeyM', mods: ['meta'] },
      { code: 'F2', mods: [] },
    ])
  })
})

void describe('pressedModifiers', () => {
  void it('lists the modifiers which are down', () => {
    assert.deepEqual(pressedModifiers(createEvent('KeyM')), [])
    assert.deepEqual(pressedModifiers(createEvent('KeyM', ['ctrl', 'shift'])), ['ctrl', 'shift'])
    assert.deepEqual(pressedModifiers(createEvent('KeyM', ['shift', 'alt', 'meta'])), ['alt', 'shift', 'meta'])
  })
})

void describe('matchesCombo', () => {
  void it('matches the key with the exact modifier set', () => {
    assert.equal(matchesCombo(createEvent('F2'), { code: 'F2' }), true)
    assert.equal(matchesCombo(createEvent('F2'), { code: 'F2', mods: ['shift'] }), false)
  })

  void it('keeps Shift+F2 apart from F2', () => {
    assert.equal(matchesCombo(createEvent('F2', ['shift']), { code: 'F2' }), false)
    assert.equal(matchesCombo(createEvent('F2', ['shift']), { code: 'F2', mods: ['shift'] }), true)
  })

  void it('does not accept another key', () => {
    assert.equal(matchesCombo(createEvent('KeyM'), { code: 'F2' }), false)
  })

  void it('does not accept a missing or an extra modifier', () => {
    assert.equal(matchesCombo(createEvent('KeyM', ['ctrl', 'shift']), { code: 'KeyM', mods: ['ctrl'] }), false)
    assert.equal(matchesCombo(createEvent('KeyM'), { code: 'KeyM', mods: ['ctrl'] }), false)
  })

  void it('ignores the modifier the combo key stands for', () => {
    // holding Shift sets `shiftKey` on the same event, that must not stop the combo
    assert.equal(matchesCombo(createEvent('ShiftLeft', ['shift']), { code: 'ShiftLeft' }), true)
    assert.equal(matchesCombo(createEvent('ShiftRight', ['shift']), { code: 'ShiftLeft' }), false)
    // … but another modifier still has to match
    assert.equal(matchesCombo(createEvent('ShiftLeft', ['shift', 'ctrl']), { code: 'ShiftLeft' }), false)
  })
})

void describe('getKeyLabel', () => {
  void it('strips the prefix of a letter and a digit', () => {
    assert.equal(getKeyLabel('KeyM'), 'M')
    assert.equal(getKeyLabel('Digit1'), '1')
  })

  void it('names the special keys', () => {
    assert.equal(getKeyLabel('F2'), 'F2')
    assert.equal(getKeyLabel('Escape'), 'Esc')
    assert.equal(getKeyLabel('Delete'), 'Del')
    assert.equal(getKeyLabel('ArrowUp'), '↑')
    assert.equal(getKeyLabel('Space'), 'Space')
  })

  void it('keeps an unknown code as it is', () => {
    assert.equal(getKeyLabel('IntlBackslash'), 'IntlBackslash')
  })
})

void describe('formatModifier', () => {
  void it('spells the name on the desktop platforms', () => {
    assert.equal(formatModifier('ctrl', false), 'Ctrl')
    assert.equal(formatModifier('alt', false), 'Alt')
    assert.equal(formatModifier('shift', false), 'Shift')
    assert.equal(formatModifier('meta', false), 'Meta')
  })

  void it('uses the symbols on macOS', () => {
    assert.equal(formatModifier('ctrl', true), '⌃')
    assert.equal(formatModifier('alt', true), '⌥')
    assert.equal(formatModifier('shift', true), '⇧')
    assert.equal(formatModifier('meta', true), '⌘')
  })
})

void describe('formatCombo', () => {
  void it('formats a single key', () => {
    assert.equal(formatCombo({ code: 'KeyM' }, false), 'M')
    assert.equal(formatCombo({ code: 'F2' }, false), 'F2')
  })

  void it('chains the modifiers with a plus on the desktop', () => {
    assert.equal(formatCombo({ code: 'KeyM', mods: ['ctrl', 'shift'] }, false), 'Ctrl+Shift+M')
    assert.equal(formatCombo({ code: 'F2', mods: ['shift'] }, false), 'Shift+F2')
  })

  void it('uses the symbols on macOS', () => {
    assert.equal(formatCombo({ code: 'KeyM', mods: ['meta'] }, true), '⌘M')
    assert.equal(formatCombo({ code: 'F2', mods: ['shift'] }, true), '⇧F2')
  })
})

void describe('getComboId', () => {
  void it('is the same for two equal combos', () => {
    assert.equal(getComboId({ code: 'KeyM' }), getComboId({ code: 'KeyM', mods: [] }))
    assert.equal(
      getComboId({ code: 'KeyM', mods: ['ctrl', 'shift'] }),
      getComboId({ code: 'KeyM', mods: ['shift', 'ctrl'] }),
    )
  })

  void it('separates the modifiers', () => {
    assert.notEqual(getComboId({ code: 'KeyM' }), getComboId({ code: 'KeyM', mods: ['ctrl'] }))
    assert.notEqual(getComboId({ code: 'KeyM', mods: ['shift'] }), getComboId({ code: 'KeyM', mods: ['ctrl'] }))
  })
})

void describe('isEditableTarget', () => {
  void it('accepts the text fields', () => {
    assert.equal(isEditableTarget({ tagName: 'INPUT' }), true)
    assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true)
    assert.equal(isEditableTarget({ tagName: 'SELECT' }), true)
    assert.equal(isEditableTarget({ isContentEditable: true }), true)
  })

  void it('rejects everything else', () => {
    assert.equal(isEditableTarget(null), false)
    assert.equal(isEditableTarget(undefined), false)
    assert.equal(isEditableTarget('string'), false)
    assert.equal(isEditableTarget({}), false)
    assert.equal(isEditableTarget({ isContentEditable: false, tagName: 'DIV' }), false)
    assert.equal(isEditableTarget({ tagName: 'INPUT', isContentEditable: false }), true)
  })
})
