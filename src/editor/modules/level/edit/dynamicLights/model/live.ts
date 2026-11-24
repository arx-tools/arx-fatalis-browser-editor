import { Box3, MathUtils, Sphere, Vector3 } from 'three'
import { arxVector3toVector3 } from '../../../../../../generator/meshes.ts'
import { SRGB_TO_LINEAR, writeBaseColor } from './color.ts'
import { DYNAMIC_LIGHT_FACTOR, GLOBAL_LIGHT_FACTOR } from './factors.ts'
import type { DynamicLightModel, LiveLayer } from './types.ts'

/**
 * The layer of the lights that moved, made on the first one that moves.
 *
 * @remarks
 * The map of the corners is a walk of the table of the build, and a level where no light moves never needs it: the
 * layer is made when the first drag asks for it, not at the build.
 *
 * @param model The model that takes the layer.
 *
 * @returns The layer of the model.
 */
function liveLayerOf(model: DynamicLightModel): LiveLayer {
  if (model.live !== undefined) {
    return model.live
  }

  const segmentOf = new Int32Array(model.vertexCount).fill(-1)

  for (let index = 0; index < model.vertices.length; index = index + 1) {
    segmentOf[model.vertices[index]] = index
  }

  const layer: LiveLayer = {
    lights: [],
    actives: [],
    isOverridden: new Uint8Array(model.lights.length),
    segmentOf,
    cursors: new Int32Array(0),
    scratch: new Float32Array(3),
    bounds: new Sphere(),
  }

  model.live = layer

  return layer
}

/**
 * Takes the pairs the build made for a light out of the frame.
 *
 * @remarks
 * A light that goes live is drawn by its own list, so the pairs of the build would count it twice. The walk is one run
 * of the pair list, and it happens once per light and drag: the frames after it only rewrite the list.
 *
 * @param model The model to write.
 * @param lightIndex Which light of the model.
 */
function zeroBakedPairsOf(model: DynamicLightModel, lightIndex: number): void {
  for (let pair = 0; pair < model.pairLights.length; pair = pair + 1) {
    if (model.pairLights[pair] === lightIndex) {
      model.pairWeights[pair] = 0
    }
  }
}

/**
 * Reads the corners a light reaches now, with the weight of the light on every one of them.
 *
 * @remarks
 * The walk is the one of the build for a single light: the corners the layer may light, the cosine of the corner and
 * the light, the falloff between the two radii and the factors of the game. A light without an intensity or a falloff
 * reaches nothing, so its list empties and the frames draw it nowhere.
 *
 * The list of a light grows with the corners it reaches; the buffers are kept between the frames of a drag.
 *
 * @param model The model to read.
 * @param layer The layer that takes the list.
 * @param lightIndex Which light of the model.
 */
function refreshLiveLightOf(model: DynamicLightModel, layer: LiveLayer, lightIndex: number): void {
  const light = model.lights[lightIndex]

  if (light === undefined) {
    return
  }

  let live = layer.lights[lightIndex]

  if (live === undefined) {
    live = { lightIndex, vertices: new Int32Array(1024), weights: new Float32Array(1024), count: 0 }
    layer.lights[lightIndex] = live
    layer.actives.push(live)
  }

  const positions = model.positionAttribute.array as Float32Array
  const normals = model.normalAttribute.array as Float32Array
  const fallRange = light.fallEnd - light.fallStart
  const position = arxVector3toVector3(light.position)
  let count = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  if (light.intensity > 0 && light.fallEnd > 0 && fallRange > 0) {
    const squaredFallEnd = light.fallEnd * light.fallEnd

    for (let vertex = 0; vertex < model.vertexCount; vertex = vertex + 1) {
      if (model.lightMask[vertex] === 0) {
        continue
      }

      const corner = vertex * 3
      const dx = position.x - positions[corner]
      const dy = position.y - positions[corner + 1]
      const dz = position.z - positions[corner + 2]
      const squaredX = dx * dx
      const squaredY = dy * dy
      const squaredZ = dz * dz
      const squaredDistance = squaredX + squaredY + squaredZ

      if (squaredDistance > squaredFallEnd) {
        continue
      }

      const distance = Math.sqrt(squaredDistance)

      if (distance === 0) {
        continue
      }

      const alongX = normals[corner] * dx
      const alongY = normals[corner + 1] * dy
      const alongZ = normals[corner + 2] * dz
      let cosine = (alongX + alongY + alongZ) / distance

      if (cosine <= 0) {
        continue
      }

      if (distance > light.fallStart) {
        cosine = cosine * ((light.fallEnd - distance) / fallRange)
      }

      if (count === live.vertices.length) {
        const grownVertices = new Int32Array(count * 2)
        const grownWeights = new Float32Array(count * 2)

        grownVertices.set(live.vertices)
        grownWeights.set(live.weights)
        live.vertices = grownVertices
        live.weights = grownWeights
      }

      live.vertices[count] = vertex
      live.weights[count] = cosine * light.intensity * GLOBAL_LIGHT_FACTOR * DYNAMIC_LIGHT_FACTOR
      count = count + 1

      const x = positions[corner]
      const y = positions[corner + 1]
      const z = positions[corner + 2]

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
    }
  }

  live.count = count

  if (count > 0) {
    const sphere = new Sphere()

    new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ)).getBoundingSphere(sphere)
    layer.bounds.union(sphere)
  }
}

/**
 * Puts the lights that moved on the layer of the frame, without building the pairs of the level again.
 *
 * @remarks
 * The gizmo of the lights writes their place on every frame of a drag, and a build of the pairs would cost a good part
 * of a second on a big level. The moved lights keep their own list of corners instead, and the pairs they had in the
 * build are zeroed once: the frame draws them where the pointer holds them, and the rebuild that follows the gesture
 * takes them in again (2026-11-24, the owner).
 *
 * @param model The model that takes the lights.
 * @param lightIndexes Which lights of the model changed their weights.
 */
export function setDynamicLightWeightsLive(model: DynamicLightModel, lightIndexes: readonly number[]): void {
  if (lightIndexes.length === 0) {
    return
  }

  const layer = liveLayerOf(model)

  for (const lightIndex of lightIndexes) {
    if (layer.isOverridden[lightIndex] === 0) {
      zeroBakedPairsOf(model, lightIndex)
      layer.isOverridden[lightIndex] = 1
    }

    refreshLiveLightOf(model, layer, lightIndex)
  }
}

/**
 * Draws the lights that moved over the colors of the build.
 *
 * @remarks
 * The lists of the layer hold the corners of a light in the order of the geometry, so the frame walks them beside the
 * corners of the build and writes a corner the build did not light as well (a light that moved into a room it did not
 * reach before). A corner is written once: the base of it comes from the build, or from the palette when the build did
 * not have it.
 *
 * @param model The model to draw.
 * @param colors The color attribute of the geometry.
 * @param withStaticLights Whether the baked color of the level is under the layer.
 */
export function applyLiveLights(model: DynamicLightModel, colors: Float32Array, withStaticLights: boolean): void {
  const layer = model.live

  if (layer === undefined || layer.actives.length === 0) {
    return
  }

  const { actives } = layer

  if (layer.cursors.length < actives.length) {
    layer.cursors = new Int32Array(actives.length)
  }

  const { cursors, scratch } = layer

  cursors.fill(0)

  for (;;) {
    let corner = Number.POSITIVE_INFINITY

    for (let index = 0; index < actives.length; index = index + 1) {
      const live = actives[index]

      if (cursors[index] < live.count && live.vertices[cursors[index]] < corner) {
        corner = live.vertices[cursors[index]]
      }
    }

    if (!Number.isFinite(corner)) {
      return
    }

    const segment = layer.segmentOf[corner]
    let red = 0
    let green = 0
    let blue = 0

    if (withStaticLights) {
      if (segment >= 0) {
        const base = segment * 3

        red = model.baseColors[base]
        green = model.baseColors[base + 1]
        blue = model.baseColors[base + 2]
      } else {
        writeBaseColor(model.vertexPalette[corner], model.lightBase, scratch, 0)
        red = scratch[0]
        green = scratch[1]
        blue = scratch[2]
      }
    }

    if (segment >= 0) {
      for (let pair = model.starts[segment]; pair < model.starts[segment + 1]; pair = pair + 1) {
        const light = model.pairLights[pair] * 3
        const weight = model.pairWeights[pair]

        const redPart = weight * model.lightColors[light]
        const greenPart = weight * model.lightColors[light + 1]
        const bluePart = weight * model.lightColors[light + 2]

        red = red + redPart
        green = green + greenPart
        blue = blue + bluePart
      }
    }

    for (let index = 0; index < actives.length; index = index + 1) {
      const live = actives[index]

      while (cursors[index] < live.count && live.vertices[cursors[index]] === corner) {
        const light = live.lightIndex * 3
        const weight = live.weights[cursors[index]]

        const redPart = weight * model.lightColors[light]
        const greenPart = weight * model.lightColors[light + 1]
        const bluePart = weight * model.lightColors[light + 2]

        red = red + redPart
        green = green + greenPart
        blue = blue + bluePart
        cursors[index] = cursors[index] + 1
      }
    }

    const at = corner * 3

    colors[at] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(red), 0, 255)]
    colors[at + 1] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(green), 0, 255)]
    colors[at + 2] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(blue), 0, 255)]
  }
}
