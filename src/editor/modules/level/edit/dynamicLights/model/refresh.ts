import type { ArxLight } from 'arx-convert/types'
import type { BufferGeometry } from 'three'
import type { ArxMap } from '../../../../../../generator/ArxMap.ts'
import { flatLightOf } from '../../lightingFlat.ts'
import { isBurningLight } from './build.ts'
import { writeBaseColor } from './color.ts'
import { setDynamicLightWeightsLive } from './live.ts'
import type { BaseLight, DynamicLightModel, LightWeightSnapshot } from './types.ts'

/**
 * Tells whether the geometry of the level changed under the model.
 *
 * @remarks
 * The level keeps its geometry and refills its buffers in place, so a `BufferAttribute` can stay the same object while
 * its content changes: the version of the attribute tells a moved face (a translate, a turn, a scale) and the version
 * of the normals follows it. A new geometry (a delete, a fill) is a new attribute, and the count says it too.
 *
 * @param model The model to check.
 * @param geometry The geometry the model was built from.
 *
 * @returns True when the weights of the model no longer belong to the geometry.
 */
export function isDynamicLightModelStale(model: DynamicLightModel, geometry: BufferGeometry): boolean {
  const positionAttribute = geometry.getAttribute('position')
  const normalAttribute = geometry.getAttribute('normal')

  if (positionAttribute !== model.positionAttribute || normalAttribute !== model.normalAttribute) {
    return true
  }

  if (positionAttribute.version !== model.positionVersion || normalAttribute.version !== model.normalVersion) {
    return true
  }

  return positionAttribute.count !== model.vertexCount
}

/**
 * Reads the baked color of the corners of the layer again.
 *
 * @remarks
 * A change of the lighting profile rewrites the palette (and the flat light), but the weights of the layer are the same:
 * the geometry and the lights did not move. The base colors are the palette by the corner, so this is a walk of the
 * affected corners instead of a build of the whole pair list.
 *
 * @param model The model whose base colors are rewritten.
 * @param map The level the model belongs to.
 */
export function refreshDynamicLightBaseColors(model: DynamicLightModel, map: ArxMap): void {
  const source: BaseLight = { flat: flatLightOf(map), palette: map.llf.colors }

  for (let index = 0; index < model.paletteIndexes.length; index = index + 1) {
    writeBaseColor(model.paletteIndexes[index], source, model.baseColors, index * 3)
  }

  model.lightBase = source
}

/**
 * Tells whether two states of a light throw the same light on a corner.
 *
 * @remarks
 * The weights of the layer are the cosine, the falloff, the intensity and the factors of the game, multiplied once: the
 * place, the two radii, the intensity and the flags of a light are what they were built from. The color and the flicker
 * are read on every frame, so a build is not needed when only those changed.
 *
 * @param snapshot The state the weights were built from.
 * @param light The light of the level now.
 *
 * @returns True when the two give the same weights.
 */
function sameWeightsOf(snapshot: LightWeightSnapshot | undefined, light: ArxLight): boolean {
  if (snapshot === undefined) {
    return false
  }

  return (
    snapshot.position.x === light.position.x &&
    snapshot.position.y === light.position.y &&
    snapshot.position.z === light.position.z &&
    snapshot.fallStart === light.fallStart &&
    snapshot.fallEnd === light.fallEnd &&
    snapshot.intensity === light.intensity &&
    snapshot.flags === light.flags
  )
}

/**
 * Takes the lights of the level into a built model, and tells which of them changed their weights.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the gizmo of the lights writes their place on every
 * frame of a drag: a color keeps the weights of the model, and a place, a reach, an intensity or a flag is a new weight
 * of that light only. The changed lights are the ones a frame can draw over the table of the build (see
 * {@link setDynamicLightWeightsLive}); a light that appears, goes out or comes back needs a build of the whole layer.
 *
 * @param model The model that takes the lights.
 * @param map The level the model belongs to.
 *
 * @returns The lights whose weights changed, or `undefined` when the layer needs a build.
 */
export function changedWeightLightsOf(model: DynamicLightModel, map: ArxMap): readonly number[] | undefined {
  const burning = map.lights.filter((light) => {
    return isBurningLight(light)
  })

  if (burning.length !== model.lights.length) {
    return undefined
  }

  const changed: number[] = []

  for (const [index, light] of burning.entries()) {
    if (!sameWeightsOf(model.weightSnapshot[index], light)) {
      changed.push(index)
    }
  }

  model.lights.splice(0, model.lights.length, ...burning)
  refreshDynamicLightBaseColors(model, map)

  return changed
}

/**
 * Takes the new color of the lights into a built model, without building it again.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the layer draws the light of the model: the build of
 * the pairs is the expensive half of the layer (a good part of a frame on a big level), so a color that changed only
 * swaps the light the model reads and moves the base colors with the palette. A light that moved, changed its reach,
 * its intensity or its flags gives the same answer as a rebuild: the weights are stale (a drag draws those over the
 * table of the build, see {@link setDynamicLightWeightsLive}).
 *
 * @param model The model that takes the lights.
 * @param map The level the model belongs to.
 *
 * @returns True when the model took the lights, false when the layer needs a build.
 */
export function refreshDynamicLightLights(model: DynamicLightModel, map: ArxMap): boolean {
  const changed = changedWeightLightsOf(model, map)

  return changed?.length === 0
}
