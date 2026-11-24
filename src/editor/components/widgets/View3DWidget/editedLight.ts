import type { ArxLight } from 'arx-convert/types'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'

/**
 * The light the editor edits, when it edits one: the walkable view draws the debug spheres of that light.
 *
 * @param lights The lights of the level, in the order of the LLF.
 *
 * @returns The light, or `undefined` when the selection is empty or holds more than one.
 */
export function editedLightOf(lights: readonly ArxLight[]): ArxLight | undefined {
  if (lightSelectionStore.lights.value.size !== 1) {
    return undefined
  }

  const [index] = lightSelectionStore.lights.value

  return lights[index]
}
