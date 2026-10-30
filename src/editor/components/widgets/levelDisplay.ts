import { computed, type ComputedRef, type ShallowRef } from 'vue'
import { onKeyboardToggle, startKeyboard } from '../../modules/keyboard/keyboard.ts'
import { persistedRef } from '../../modules/persistedRef/persistedRef.ts'

/**
 * Whether the wireframe of the level is drawn over the mesh.
 *
 * @remarks
 * It is a **view preference**: a `persistedRef` in the `localStorage`, so the editor comes back the way it
 * was left, and not in the url (a shared link shows the level the way the reader wants it). The widgets read
 * it, so the walkable view and the six fixed views draw the same wireframe at the same time. The default is
 * off: the wireframe is a debug aid, not the look of the level.
 */
export const isWireframeVisible = persistedRef<boolean>({
  key: 'wireframeVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * Whether the mesh of the level is drawn.
 *
 * @remarks
 * The same kind of switch as the wireframe: a view preference in a `persistedRef`, without the url and the
 * localStorage. Turning it off leaves the wireframe (and the selection's overlays) on the scene, which is the
 * way to read the shape of a level without the surfaces in the way.
 */
export const isMeshVisible = persistedRef<boolean>({
  key: 'meshVisible',
  defaultValue: true,
  persistInLocalStorage: true,
})

/**
 * The switches of the View section of the key help, with the value each one starts from.
 *
 * @remarks
 * The list is the single place a view switch is added: the key help draws its rows from it, and
 * {@link resetViewSwitches} puts every one of them back, so a switch added here is resettable without
 * touching the widget.
 */
export const viewSwitches = {
  mesh: { ref: isMeshVisible, defaultValue: true },
  wireframe: { ref: isWireframeVisible, defaultValue: false },
} as const satisfies Record<string, { readonly ref: ShallowRef<boolean>; readonly defaultValue: boolean }>

/**
 * The name of a switch of the View section.
 */
export type ViewSwitch = keyof typeof viewSwitches

/**
 * Whether every view switch is on the value it starts from.
 *
 * @remarks
 * The reset button of the key help is disabled while it is: there is nothing to put back, and a button that
 * does nothing is worse than a button that says it can not.
 */
export const isViewAtDefault: ComputedRef<boolean> = computed(() => {
  return Object.values(viewSwitches).every(({ ref, defaultValue }) => {
    return ref.value === defaultValue
  })
})

/**
 * Puts every view switch back to the value it starts from.
 *
 * @remarks
 * The default of the view is the plain level: the mesh is on, and every overlay is off. This is what the
 * reset button of the key help calls, and what a reader wants after a round of debugging.
 */
export function resetViewSwitches(): void {
  for (const { ref, defaultValue } of Object.values(viewSwitches)) {
    ref.value = defaultValue
  }
}

/**
 * Starts the parts of the editor that belong to no widget.
 *
 * @remarks
 * The keyboard is started here and not in the walkable view: the wireframe switch works in the fixed
 * views too, and a layout may not hold a walkable one. Registering a toggle twice would only replace the
 * handler, so a second start is harmless.
 */
export function startLevelDisplay(): void {
  startKeyboard()
  onKeyboardToggle('toggleWireframe', isWireframeVisible)
  onKeyboardToggle('toggleMesh', isMeshVisible)
}
