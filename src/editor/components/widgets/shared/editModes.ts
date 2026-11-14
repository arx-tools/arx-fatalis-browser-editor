import type { ShallowRef } from 'vue'
import { onKeyboardToggle } from '../../../modules/keyboard/keyboard.ts'
import { persistedRef } from '../../../modules/persistedRef/persistedRef.ts'

/**
 * Whether the transform gizmo of the selection is drawn.
 *
 * @remarks
 * The gizmo is a tool of an edit, and it stands in the middle of the selection, where the author wants to look: the `E`
 * key (and the row of the key help) puts it away without taking the selection with it (2026-11-14, the owner).
 *
 * It is a **preference of the editor**: a `persistedRef` in the `localStorage`, so the next visit comes back the way it
 * was left, and not a value of the level or of the layout — switching a preset does not move it. The name follows the
 * visibility switches of the view (`meshVisible`, `wireframeVisible`): the `is` prefix is not used.
 */
export const transformVisible = persistedRef<boolean>({
  key: 'transformVisible',
  defaultValue: true,
  persistInLocalStorage: true,
})

/**
 * The switches of the `Edit modes` section of the key help, with the value each one starts from.
 *
 * @remarks
 * The list is the single place an edit mode is added, the way `viewSwitches` is for the view: the key help draws the
 * eye of a row from it. The two lists are apart on purpose — the reset of the view (`resetViewSwitches`) must not move
 * the modes of an edit, and the modes have a section and a reset of their own when they grow one.
 */
export const editModeSwitches = {
  transform: { ref: transformVisible, defaultValue: true },
} as const satisfies Record<string, { readonly ref: ShallowRef<boolean>; readonly defaultValue: boolean }>

/**
 * The name of a switch of the `Edit modes` section.
 */
export type EditModeSwitch = keyof typeof editModeSwitches

/**
 * Starts the edit modes that belong to no widget: the keys that flip them.
 *
 * @remarks
 * The `E` of the keyboard is registered here and not in the walkable view, the way the switches of the view are
 * (`startLevelDisplay`): a layout may not hold a walkable view, and the key help flips the same switch.
 */
export function startEditModes(): void {
  onKeyboardToggle('toggleTransform', transformVisible)
}
