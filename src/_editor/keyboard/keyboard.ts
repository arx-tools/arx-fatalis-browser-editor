import { createHotkeyBindings, type KeyboardBindings } from './bindings.ts'
import { keyboardActions, type KeyboardAction, type KeyboardActionId } from './actions.ts'
import {
  isEditableTarget,
  isMacPlatform,
  matchesCombo,
  type KeyboardEventLike,
  type KeyboardMode,
} from './functions.ts'

/**
 * The platform of the browser: macOS needs the Cmd modifier as the primary one.
 */
const navigatorPlatform =
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform

const isMac = isMacPlatform(navigatorPlatform)

/**
 * The part of a keydown the dispatcher reads.
 */
export type KeyboardDownEvent = KeyboardEventLike & {
  repeat?: boolean
  target?: unknown
  defaultPrevented?: boolean
  preventDefault?: () => void
  getModifierState?: (key: string) => boolean
}

/**
 * A source of the keyboard events: the browser's `window`, or a fake in the tests.
 */
export type KeyboardEventSource = {
  addEventListener: (type: string, listener: (event: KeyboardDownEvent) => void) => void
}

/**
 * The pressed key codes, so a `hold` action (the movement) can be read on every frame.
 */
const pressedCodes = new Set<string>()

/**
 * The listeners which want to know about any key change (the cursor colour reads the modifiers).
 */
const activityListeners = new Set<() => void>()

/**
 * The registered implementations, by action id.
 */
const handlers = new Map<KeyboardActionId, () => void>()

/**
 * The names of the open dialogs, the `dialog` mode is on while this is not empty.
 */
const openDialogs = new Set<string>()

let pointerLocked = false
let bindings: KeyboardBindings | undefined
let source: KeyboardEventSource | undefined

/**
 * Tells whether the primary modifier of the platform is Cmd.
 *
 * @returns True on macOS and iOS.
 */
export function isMacKeyboard(): boolean {
  return isMac
}

/**
 * Hands back the bindings, creating them on first use.
 *
 * @returns The combos of every action.
 */
export function getKeyboardBindings(): KeyboardBindings {
  const existing = bindings

  if (existing !== undefined) {
    return existing
  }

  const created = createHotkeyBindings(isMac).value
  bindings = created

  return created
}

/**
 * Replaces the bindings in memory (a settings panel writes through the ref, the tests use this).
 *
 * @param next The new bindings.
 */
export function setKeyboardBindings(next: KeyboardBindings): void {
  bindings = next
}

/**
 * Tells the dispatcher whether the scene holds the pointer.
 *
 * @param value True while the pointer is locked.
 */
export function setPointerLocked(value: boolean): void {
  pointerLocked = value

  if (!value) {
    // a key released outside of the window (alt-tab) would stay pressed forever
    pressedCodes.clear()
  }
}

/**
 * Tells the dispatcher whether a dialog is open, which turns the `dialog` mode on.
 *
 * @param name The name of the dialog, for example `camera`.
 * @param open Whether it is open.
 */
export function setDialogOpen(name: string, open: boolean): void {
  if (open) {
    openDialogs.add(name)

    return
  }

  openDialogs.delete(name)
}

/**
 * Registers the implementation of an action.
 *
 * @param id The action to register.
 * @param handler What the action does.
 */
export function onKeyboardAction(id: KeyboardActionId, handler: () => void): void {
  handlers.set(id, handler)
}

/**
 * A ref with a boolean value, which is all a toggle action needs.
 */
export type BooleanRef = {
  value: boolean
}

/**
 * Registers an action which flips the value of a boolean ref.
 *
 * @param id The action to register.
 * @param ref The ref to flip, for example one of the visibility switches of the state.
 */
export function onKeyboardToggle(id: KeyboardActionId, ref: BooleanRef): void {
  handlers.set(id, () => {
    ref.value = !ref.value
  })
}

/**
 * Tells whether a raw key code is held down.
 *
 * @remarks
 * - this is for the input handling (the selection reads the modifiers), the actions go through
 * `isKeyboardActionActive`
 *
 * @param code The key code to check.
 * @returns True while the key is pressed.
 */
export function isKeyDown(code: string): boolean {
  return pressedCodes.has(code)
}

/**
 * Tells whether any combo of an action is held down, which is what a `hold` action means.
 *
 * @param id The action to check.
 * @returns True while one of its keys is pressed.
 */
export function isKeyboardActionActive(id: KeyboardActionId): boolean {
  const combos = getKeyboardBindings()[id] ?? []

  return combos.some((combo) => {
    return pressedCodes.has(combo.code)
  })
}

/**
 * Resolves the mode of the moment from the event target and the state of the page.
 *
 * @remarks
 * - the modes are exclusive, in this order: `typing` (a field is focused), `pointerLocked`, `dialog`,
 * `editor`
 * - typing wins over everything: a hotkey must not disturb the input of a field
 * - the pointer lock wins over a dialog, because the scene has the mouse and the camera dialog is a
 * floating panel; there is no case where an action has to work in two modes at once (an action
 * which should work in a dialog and while typing lists both, like `closeDialog`)
 * - Escape is the browser's key while the pointer is locked (Firefox does not even deliver the
 * keydown), so the dialog is closed with the *next* Escape, after the lock is gone
 *
 * @param target The target of the event.
 * @param isLocked Whether the scene holds the pointer.
 * @param hasOpenDialog Whether a dialog is open.
 * @returns The mode the dispatch runs in.
 */
export function resolveKeyboardMode(target: unknown, isLocked: boolean, hasOpenDialog: boolean): KeyboardMode {
  if (isEditableTarget(target)) {
    return 'typing'
  }

  if (isLocked) {
    return 'pointerLocked'
  }

  if (hasOpenDialog) {
    return 'dialog'
  }

  return 'editor'
}

/**
 * Picks the action an event fires, if any.
 *
 * @remarks
 * - the first action of the table whose combos match wins
 * - an action without `modes` is allowed everywhere
 * - a modifier key is not a combo of its own: a `ShiftLeft` combo is matched while Shift is held
 *
 * @param event The event to dispatch.
 * @param actions The action table to search.
 * @param combos The combos of every action.
 * @param mode The mode of the moment.
 * @returns The action the event fires, or undefined.
 */
export function pickKeyboardAction(
  event: KeyboardEventLike,
  actions: readonly KeyboardAction[],
  combos: KeyboardBindings,
  mode: KeyboardMode,
): KeyboardAction | undefined {
  for (const action of actions) {
    if (action.modes !== undefined && !action.modes.includes(mode)) {
      continue
    }

    const actionCombos = combos[action.id] ?? []

    const matched = actionCombos.some((combo) => {
      return matchesCombo(event, combo)
    })

    if (matched) {
      return action
    }
  }

  return undefined
}

/**
 * Tells the listeners that a key changed.
 */
function notifyActivity(): void {
  for (const listener of activityListeners) {
    listener()
  }
}

/**
 * Handles one keydown: keeps the pressed set, finds the action and runs its handler.
 *
 * @param event The event to handle.
 * @returns The action which fired, or undefined.
 */
export function handleKeyDown(event: KeyboardDownEvent): KeyboardActionId | undefined {
  pressedCodes.add(event.code)
  notifyActivity()

  if (event.defaultPrevented === true) {
    return undefined
  }

  // a composed character (for example `AltGr+E`) is not a hotkey
  if (event.getModifierState?.('AltGraph') === true) {
    return undefined
  }

  const mode = resolveKeyboardMode(event.target, pointerLocked, openDialogs.size > 0)
  const action = pickKeyboardAction(event, keyboardActions, getKeyboardBindings(), mode)

  if (action === undefined) {
    return undefined
  }

  event.preventDefault?.()

  // a held key fires once; the hold actions are read through `isKeyboardActionActive` on every frame
  if (action.hold === true || event.repeat === true) {
    return action.id
  }

  handlers.get(action.id)?.()

  return action.id
}

/**
 * Handles one keyup: clears the key from the pressed set.
 *
 * @param event The event to handle.
 */
export function handleKeyUp(event: KeyboardEventLike): void {
  pressedCodes.delete(event.code)
  notifyActivity()
}

/**
 * Forgets every pressed key, so a key released outside of the window does not stay down.
 */
export function clearPressedKeys(): void {
  pressedCodes.clear()
}

/**
 * Subscribes to every key change, for the parts of the ui which react to a modifier (the cursor
 * colour).
 *
 * @param listener What to call after a key went down or up.
 * @returns A function which removes the listener.
 */
export function onKeyboardActivity(listener: () => void): () => void {
  activityListeners.add(listener)

  return () => {
    activityListeners.delete(listener)
  }
}

/**
 * Attaches the one `keydown` and the one `keyup` listener.
 *
 * @remarks
 * - the listeners live on the `window`, not on the canvas: the keys have to work while a button of
 * the page has the focus too, and an event which a component already handled (`defaultPrevented`)
 * is skipped
 *
 * @param eventSource The source of the events, the browser's window by default.
 */
export function startKeyboard(eventSource?: KeyboardEventSource): void {
  const target = eventSource ?? (globalThis as { window?: KeyboardEventSource }).window

  if (target === undefined || source !== undefined) {
    return
  }

  source = target

  target.addEventListener('keydown', (event) => {
    handleKeyDown(event)
  })

  target.addEventListener('keyup', (event) => {
    handleKeyUp(event)
  })

  target.addEventListener('blur', () => {
    clearPressedKeys()
  })
}

/**
 * Detaches the listeners, the tests and a teardown use it.
 */
export function stopKeyboard(): void {
  source = undefined
  clearPressedKeys()
}
