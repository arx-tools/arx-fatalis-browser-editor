import { persistedRef } from '../../persistedRef/persistedRef.ts'

/**
 * Whether the fall start sphere of the edited light is on the walkable view.
 *
 * @remarks
 * The game's debug view (`DebugView_Lights`, `drawDebugLights`) draws two spheres around a light: the one of the fall
 * start in green and the one of the fall end in red. The editor shows them for the light the editor edits, on a switch
 * of its own, so the spheres do not come and go with the hover, and a marker stays readable while they are on
 * (2026-11-23, the owner, TODO 249).
 *
 * The switch is a view preference of the browser, like the profile: it is kept in the local storage, and it is off on a
 * fresh browser.
 */
export const fallStartSphereVisible = persistedRef<boolean>({
  key: 'fallStartSphereVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * Whether the fall end sphere of the edited light is on the walkable view.
 *
 * @remarks
 * The other half of the debug view of the game: the sphere of the fall end, in red. It is off on a fresh browser, and
 * the local storage keeps it, like the switch of the fall start (2026-11-23, the owner, TODO 249).
 */
export const fallEndSphereVisible = persistedRef<boolean>({
  key: 'fallEndSphereVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})
