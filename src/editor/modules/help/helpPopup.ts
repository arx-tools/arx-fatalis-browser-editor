import { shallowRef, type ShallowRef } from 'vue'
import { onKeyboardAction } from '../keyboard/keyboard.ts'

/**
 * Whether the keys of the editor are on the screen as a popup.
 *
 * @remarks
 * The key help is a **widget of the dock**, and a layout may not hold it: the popup is the second door to the same list,
 * opened with `H` wherever the author is (TODO 187, the owner: *„a keyboard shortcuts widget-et elő lehessen hozni
 * popup-ként is, ha valaki megnyomja a H gombot"*).
 *
 * It is the state of the session and not a preference: the popup is not written to the storage, so a reload starts with
 * the keys away. The widget inside it is the one of the dock, and its rows read the switches of the modules, so the two
 * doors show the same state and flip the same things.
 */
export const helpPopupOpen: ShallowRef<boolean> = shallowRef(false)

/**
 * Shows the popup, or puts it away.
 *
 * @remarks
 * The popup is a dialog, and a dialog needs the pointer: while the camera holds it (a click in the walkable view), the
 * cursor is the camera's and no button of the dialog can be reached — so the lock is released with the popup, the way
 * `Escape` does it.
 */
export function toggleHelpPopup(): void {
  helpPopupOpen.value = !helpPopupOpen.value

  if (helpPopupOpen.value && document.pointerLockElement !== null) {
    document.exitPointerLock()
  }
}

/**
 * Starts the key of the popup.
 *
 * @remarks
 * It is an **action** and not a toggle of the keyboard module: the state of the popup is not a value the keys flip (the
 * `H` of the keyboard is a switch of the module), and the opening does more than the flip (the pointer is let go). The
 * `X` of the dialog, the `Escape` and a click on the cover close it, which is the way of every dialog of the editor.
 */
export function startHelpPopup(): void {
  onKeyboardAction('toggleHelp', toggleHelpPopup)
}
