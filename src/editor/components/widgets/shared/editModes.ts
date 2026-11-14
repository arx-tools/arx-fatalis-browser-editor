import { watch, type ShallowRef } from 'vue'
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
 * Whether the rotate gizmo of the selection is drawn.
 *
 * @remarks
 * The other half of the edit modes: the turn of the selected faces around their middle (TODO 184). The two gizmos are
 * **exclusive** — the transform and the rotate do not stand on the same face at the same time — so the one that comes on
 * takes the other one off (see {@link startEditModes}).
 */
export const rotateVisible = persistedRef<boolean>({
  key: 'rotateVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * Whether the scale gizmo of the selection is drawn.
 *
 * @remarks
 * The third half of the edit modes: the scale of the selected faces around their middle (the `TransformControls` scale
 * mode). The three gizmos are exclusive, and the one that comes on takes the others off (see {@link startEditModes}).
 */
export const scaleVisible = persistedRef<boolean>({
  key: 'scaleVisible',
  defaultValue: false,
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
  rotate: { ref: rotateVisible, defaultValue: false },
  scale: { ref: scaleVisible, defaultValue: false },
} as const satisfies Record<string, { readonly ref: ShallowRef<boolean>; readonly defaultValue: boolean }>

/**
 * The name of a switch of the `Edit modes` section.
 */
export type EditModeSwitch = keyof typeof editModeSwitches

/**
 * Starts the edit modes that belong to no widget: the keys that flip them, and the rule that keeps them apart.
 *
 * @remarks
 * The `E` and the `Q` of the keyboard are registered here and not in the walkable view, the way the switches of the view
 * are (`startLevelDisplay`): a layout may not hold a walkable view, and the key help flips the same switches.
 *
 * **The modes are exclusive** (TODO 182, the owner): either the transform gizmo, or the rotate gizmo, or the scale one,
 * or none of them. A watch per switch is what makes a flip of it put the others away, whoever flipped it — the key, the
 * eye of the key help, or a later panel. Turning a mode **off** leaves the others as they were, so `Q` on then `Q` off
 * gives no gizmo at all.
 *
 * The keys are `1`, `2` and `3` (the owner's request of 2026-11-14): the letters of the editor are taken by the walk
 * (`W`, `A`, `S`, `D`) and the switches of the view, and a digit reaches the modes from the walkable view too.
 */
export function startEditModes(): void {
  onKeyboardToggle('toggleTransform', transformVisible)
  onKeyboardToggle('toggleRotate', rotateVisible)
  onKeyboardToggle('toggleScale', scaleVisible)

  watch(transformVisible, (visible) => {
    if (visible) {
      rotateVisible.value = false
      scaleVisible.value = false
    }
  })

  watch(rotateVisible, (visible) => {
    if (visible) {
      transformVisible.value = false
      scaleVisible.value = false
    }
  })

  watch(scaleVisible, (visible) => {
    if (visible) {
      transformVisible.value = false
      rotateVisible.value = false
    }
  })
}
