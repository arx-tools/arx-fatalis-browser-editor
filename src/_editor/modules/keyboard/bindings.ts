import { persistedRef, type PersistedRef } from '../persistedRef/persistedRef.ts'
import { keyboardActions, type KeyboardActionId } from './actions.ts'
import { resolveKeys, type KeyCombo } from './functions.ts'

/**
 * The combos of every action, keyed by the action id.
 *
 * @remarks
 * - the actions without a key have an empty list, so the shape is always complete
 */
export type KeyboardBindings = Record<KeyboardActionId, KeyCombo[]>

/**
 * The key of the `localStorage` entry the user's bindings live in.
 */
const BINDINGS_KEY = 'hotkeyBindings'

/**
 * Builds the default bindings from the action table: the `primary` modifier becomes the platform's.
 *
 * @param isMac Whether the platform is macOS.
 * @returns The default combos of every action.
 */
export function createDefaultBindings(isMac: boolean): KeyboardBindings {
  const entries = keyboardActions.map((action) => {
    return [action.id, resolveKeys(action.keys, isMac)] as const
  })

  return Object.fromEntries(entries) as KeyboardBindings
}

/**
 * Creates (or hands back) the persisted bindings ref, so a rebind survives a reload.
 *
 * @remarks
 * - the call is lazy on purpose: importing the keyboard module must not touch the storage
 * - the same key gives back the same ref, so a second call is harmless
 *
 * @param isMac Whether the platform is macOS.
 * @returns The ref of the bindings.
 */
export function createHotkeyBindings(isMac: boolean): PersistedRef<KeyboardBindings> {
  return persistedRef<KeyboardBindings>({
    key: BINDINGS_KEY,
    defaultValue: createDefaultBindings(isMac),
    persistInLocalStorage: true,
  })
}
