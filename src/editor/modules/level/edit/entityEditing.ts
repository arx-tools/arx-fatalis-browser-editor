import { shallowRef, type ShallowRef } from 'vue'

/**
 * The revision of the entities of the level.
 *
 * @remarks
 * The entities live in the DLF of the loaded map, beside the polygons and the lights: an edit of an entity (its place
 * today, its turn later) does not change the mesh. The views still have to follow it: the markers of the walkable view
 * are built once, and the entity list reads the places for its jumps. The entity editor bumps this counter the way the
 * light editor bumps `lightsRevision`, and the views read it.
 */
export const entitiesRevision: ShallowRef<number> = shallowRef(0)

/**
 * Marks the entities of the level as changed.
 *
 * @remarks
 * The entity editor and the history steps of an entity call this after they write the DLF; the walkable view moves its
 * markers from the new state, and the entity list reads the places again.
 */
export function touchEntities(): void {
  entitiesRevision.value = entitiesRevision.value + 1
}
