/**
 * The modifiers a hotkey can ask for.
 *
 * @remarks
 * - `primary` is only allowed in the table: it is resolved to the platform modifier on load
 */
export type KeyboardModifier = 'alt' | 'ctrl' | 'meta' | 'shift'

/**
 * A modifier name as the action table may write it: `primary` means "Ctrl on Windows and Linux,
 * Cmd on macOS".
 */
export type KeyboardModifierInput = KeyboardModifier | 'primary'

/**
 * A key with the modifiers which have to be held with it.
 *
 * @remarks
 * - `mods` is the exact set: a combo without `mods` does not fire while Shift is held, so
 * `Shift+F2` and `F2` are two different combos
 * - `code` is the physical key (`KeyboardEvent.code`), so the layout of the keyboard does not matter
 */
export type KeyCombo = {
  code: string
  mods?: KeyboardModifier[]
}

/**
 * A combo as the action table writes it, `primary` included.
 */
export type KeyComboInput = {
  code: string
  mods?: KeyboardModifierInput[]
}

/**
 * The part of a keyboard event the matching needs.
 */
export type KeyboardEventLike = {
  altKey: boolean
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/**
 * The modes a hotkey can be limited to.
 *
 * @remarks
 * - `editor` is always on
 * - `pointerLocked` while the mouse is captured by the scene
 * - `typing` while the event comes from a text field, so a hotkey does not disturb the input
 * - `dialog` while a dialog of the editor is open
 */
export type KeyboardMode = 'dialog' | 'editor' | 'pointerLocked' | 'typing'

/**
 * The canonical order of the modifiers, used by the formatting and the comparison.
 */
const modifierOrder: KeyboardModifier[] = ['ctrl', 'alt', 'shift', 'meta']

/**
 * The modifier a modifier key stands for.
 */
const modifierCodes: Record<string, KeyboardModifier> = {
  AltLeft: 'alt',
  AltRight: 'alt',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  MetaLeft: 'meta',
  MetaRight: 'meta',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
}

/**
 * The keys whose `code` is a readable name on its own.
 */
const keyLabels: Record<string, string> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Delete: 'Del',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Esc',
  Home: 'Home',
  Minus: '-',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
}

/**
 * Tells whether the platform of the browser is macOS, where `Cmd` is the primary modifier.
 *
 * @param platform The platform string of the navigator.
 * @returns True for macOS, iOS and iPadOS.
 */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad/i.test(platform)
}

/**
 * Tells whether a key code is a modifier key.
 *
 * @param code The key code to check.
 * @returns The modifier it stands for, or undefined when it is a normal key.
 */
export function getModifierOfKey(code: string): KeyboardModifier | undefined {
  return modifierCodes[code]
}

/**
 * Resolves the modifiers of a combo: `primary` becomes the platform modifier, the list is unique and
 * in a canonical order so two equal sets look the same.
 *
 * @param mods The modifiers as the table wrote them.
 * @param isMac Whether the platform is macOS.
 * @returns The concrete modifiers.
 */
export function resolveModifiers(mods: KeyboardModifierInput[] | undefined, isMac: boolean): KeyboardModifier[] {
  const resolved = new Set<KeyboardModifier>()

  for (const mod of mods ?? []) {
    if (mod === 'primary') {
      if (isMac) {
        resolved.add('meta')
      } else {
        resolved.add('ctrl')
      }

      continue
    }

    resolved.add(mod)
  }

  return [...resolved].toSorted((left, right) => {
    return modifierOrder.indexOf(left) - modifierOrder.indexOf(right)
  })
}

/**
 * Resolves the combos of an action for the running platform: `primary` becomes a concrete modifier.
 *
 * @param keys The combos as the table wrote them.
 * @param isMac Whether the platform is macOS.
 * @returns The combos the runtime matches with.
 */
export function resolveKeys(keys: KeyComboInput[], isMac: boolean): KeyCombo[] {
  return keys.map((key) => {
    return { code: key.code, mods: resolveModifiers(key.mods, isMac) }
  })
}

/**
 * Collects the modifiers which are down during an event, in the canonical order.
 *
 * @param event The event to read.
 * @returns The ones which are down.
 */
export function pressedModifiers(event: KeyboardEventLike): KeyboardModifier[] {
  const state: Array<[KeyboardModifier, boolean]> = [
    ['ctrl', event.ctrlKey],
    ['alt', event.altKey],
    ['shift', event.shiftKey],
    ['meta', event.metaKey],
  ]

  return state
    .filter(([, isDown]) => {
      return isDown
    })
    .map(([mod]) => {
      return mod
    })
}

/**
 * Tells whether an event fires a combo.
 *
 * @remarks
 * - the modifier set has to match exactly, so `Shift+F2` does not fire the plain `F2`
 * - when the combo is a modifier key itself (`ShiftLeft`), the modifier it stands for is left out of
 * the comparison: holding Shift sets `shiftKey` on the same event
 *
 * @param event The event to check.
 * @param combo The combo to match.
 * @returns True when the event is that combo.
 */
export function matchesCombo(event: KeyboardEventLike, combo: KeyCombo): boolean {
  if (event.code !== combo.code) {
    return false
  }

  const ownModifier = getModifierOfKey(combo.code)
  const wanted = (combo.mods ?? []).filter((mod) => {
    return mod !== ownModifier
  })
  const pressed = pressedModifiers(event).filter((mod) => {
    return mod !== ownModifier
  })

  if (wanted.length !== pressed.length) {
    return false
  }

  return wanted.every((mod, index) => {
    return pressed[index] === mod
  })
}

/**
 * The symbols macOS shows on the modifier keys.
 */
const macModifierSymbols: Record<KeyboardModifier, string> = {
  alt: '⌥',
  ctrl: '⌃',
  meta: '⌘',
  shift: '⇧',
}

/**
 * The names the other platforms show.
 */
const plainModifierNames: Record<KeyboardModifier, string> = {
  alt: 'Alt',
  ctrl: 'Ctrl',
  meta: 'Meta',
  shift: 'Shift',
}

/**
 * Formats one modifier.
 *
 * @param mod The modifier to format.
 * @param isMac Whether the platform is macOS, where a symbol is used.
 * @returns The readable form.
 */
export function formatModifier(mod: KeyboardModifier, isMac: boolean): string {
  let names = plainModifierNames

  if (isMac) {
    names = macModifierSymbols
  }

  return names[mod]
}

/**
 * Reads the readable label of a key code.
 *
 * @param code The key code, for example `KeyM`, `Digit1` or `F2`.
 * @returns The label, for example `M`, `1` or `F2`.
 */
export function getKeyLabel(code: string): string {
  const named = keyLabels[code]

  if (named !== undefined) {
    return named
  }

  if (code.startsWith('Key')) {
    return code.slice(3)
  }

  if (code.startsWith('Digit')) {
    return code.slice(5)
  }

  return code
}

/**
 * Formats a combo the way the help and a settings panel show it.
 *
 * @param combo The combo to format.
 * @param isMac Whether the platform is macOS, where the symbols are used.
 * @returns The readable form, for example `Ctrl+Shift+F2`, `⌘M` or `Shift+F2`.
 */
export function formatCombo(combo: KeyCombo, isMac: boolean): string {
  const label = getKeyLabel(combo.code)
  const mods = combo.mods ?? []

  if (isMac) {
    const symbols = mods
      .map((mod) => {
        return formatModifier(mod, isMac)
      })
      .join('')

    return `${symbols}${label}`
  }

  const names = mods.map((mod) => {
    return formatModifier(mod, isMac)
  })

  return [...names, label].join('+')
}

/**
 * Builds the canonical identity of a combo, so two combos can be compared and duplicates found.
 *
 * @param combo The combo to identify.
 * @returns A string like `ctrl+shift+keym`.
 */
export function getComboId(combo: KeyCombo): string {
  const mods = resolveModifiers(combo.mods, false)

  return [...mods, combo.code.toLowerCase()].join('+')
}

/**
 * Tells whether an event target is a place where the user types.
 *
 * @param target The target of the event, usually an `HTMLElement` or the `document`.
 * @returns True for a text field, a select box and a contenteditable element.
 */
export function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') {
    return false
  }

  const element = target as { isContentEditable?: unknown; tagName?: unknown }

  if (element.isContentEditable === true) {
    return true
  }

  if (typeof element.tagName !== 'string') {
    return false
  }

  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
}
