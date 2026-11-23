import type { ArxLight } from 'arx-convert/types'
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
 * Gives the light with vectors of its own.
 *
 * @remarks
 * The lights of the level are the mutable objects of the LLF: a snapshot of a light for the history or for the start of
 * a drag has to copy the vectors, or the write of the live edit would move the snapshot too.
 *
 * @param light The light to copy.
 *
 * @returns The light, with vectors of its own.
 */
export function cloneLightOf(light: ArxLight): ArxLight {
  return {
    ...light,
    position: { ...light.position },
    color: { ...light.color },
    exFlicker: { ...light.exFlicker },
  }
}

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
