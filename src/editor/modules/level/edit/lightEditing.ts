import { shallowRef, type ShallowRef } from 'vue'

/**
 * The revision of the lights of the level.
 *
 * @remarks
 * The lights live in the LLF of the loaded map, beside the polygons of the level: an edit of a light (its flags, its
 * color, its falloff or its place) does not change the mesh. The view still has to follow it, so the light editor
 * bumps this counter the way the mesh work bumps `levelRevision`, and the views read it.
 */
export const lightsRevision: ShallowRef<number> = shallowRef(0)

/**
 * Marks the lights of the level as changed.
 *
 * @remarks
 * The light editor and the history steps of a light call this after they write the LLF; the walkable view redraws its
 * markers from the new state.
 */
export function touchLights(): void {
  lightsRevision.value = lightsRevision.value + 1
}
