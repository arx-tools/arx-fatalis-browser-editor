import { onKeyboardToggle, startKeyboard } from '../../modules/keyboard/keyboard.ts'
import { persistedRef } from '../../modules/persistedRef/persistedRef.ts'

/**
 * Whether the wireframe of the level is drawn over the mesh.
 *
 * @remarks
 * It is a **view preference, not a link value**: a `persistedRef`, but neither the url nor the localStorage
 * carries it (a shared link shows the level the way the reader wants it, and the switch is back off after a
 * reload). The widgets read it, so the walkable view and the six fixed views draw the same wireframe at the
 * same time. The default is off: the wireframe is a debug aid, not the look of the level.
 */
export const isWireframeVisible = persistedRef<boolean>({
  key: 'wireframeVisible',
  defaultValue: false,
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
})

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
