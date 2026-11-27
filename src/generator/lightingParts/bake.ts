import {
  type ArxColor,
  type ArxFTS,
  type ArxLLF,
  type ArxLight,
  type ArxPolygon,
  type ArxVector3,
  ArxPolygonFlags,
} from 'arx-convert/types'
import { DoubleSide, MathUtils, Ray as ThreeRay, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import type { LightingCalculatorMode } from '../types.ts'
import { accelerateRaycast } from '../meshes/bvh.ts'
import {
  GLOBAL_LIGHT_FACTOR,
  ambientOf,
  bakeTextureRainbow,
  collectLights,
  colorCountOf,
  falloffOf,
  normalOfCorner,
} from './colors.ts'
import { cellHashOfPosition, lightGridOf } from './grid.ts'
import type { BakeContext, Blocker, CornerBake, LightGrid, LightingOptions } from './types.ts'

/**
 * Tells whether the level blocks the way of the light of a corner.
 *
 * @param options What the bake of the corner reads.
 * @param from The position of the light.
 * @param distance How far the corner is from it.
 *
 * @returns True when a blocker stands between the two.
 */
function isBlocked(options: CornerBake, from: Vector3, distance: number): boolean {
  const { blockers, ray, toLight } = options

  if (blockers.length === 0) {
    return false
  }

  for (const blocker of blockers) {
    ray.origin.copy(from)
    ray.direction.copy(toLight).negate()
    // the tree reads the space of the mesh: the ray goes through the matrix of the mesh, and the tree answers the first
    // triangle it meets; a face nearer than the corner is the one that casts the shadow
    ray.applyMatrix4(blocker.inverse)

    if (blocker.tree.raycastFirst(ray, DoubleSide, 0, distance * 0.99) !== null) {
      return true
    }
  }

  return false
}

/**
 * Fills the lights of the corner from the grid.
 *
 * @remarks
 * The cell of the corner and the lights that reach everywhere are two ascending lists: this merges them, so a corner
 * sums its lights in the order of the level. Two cells may share a hash, and the same light may be in both of them: the
 * merge drops the repeats, or the light would be counted twice. A corner whose cell holds no light and whose level has
 * no light that reaches everywhere reads nothing, and the bake gives it the floor of the profile.
 *
 * @param context The bake of the walk.
 * @param grid The grid of the lights of the level.
 */
export function fillCandidatesOf(context: BakeContext, grid: LightGrid): void {
  const { corner } = context
  const { candidates } = corner
  const cell = grid.cells.get(cellHashOfPosition(corner.position))
  const { everywhere } = grid
  // one past the last light: the merge reads the end of a list as a light that never comes
  const none = corner.lights.length
  let one = 0
  let other = 0
  let at = 0

  while (one < (cell?.length ?? 0) || other < everywhere.length) {
    let fromCell = none

    if (cell !== undefined) {
      fromCell = cell[one] ?? none
    }

    const fromEverywhere = everywhere[other] ?? none

    if (fromCell <= fromEverywhere) {
      candidates[at] = fromCell
      one = one + 1
    } else {
      candidates[at] = fromEverywhere
      other = other + 1
    }

    at = at + 1
  }

  context.corner.candidateCount = at
}

/**
 * Bakes the color of one corner from the lights.
 *
 * @param options What the bake of the corner reads, with the corner in {@link CornerBake.position} and its normal in
 * {@link CornerBake.normal}.
 * @param doubleSided Whether the face is drawn from both sides, so the normal turned away still takes the light.
 *
 * @returns The color, with the ambient floor of the profile.
 */
export function bakeCornerOf(options: CornerBake, doubleSided: boolean): ArxColor {
  let red = 0
  let green = 0
  let blue = 0

  for (let slot = 0; slot < options.candidateCount; slot = slot + 1) {
    const entry = options.lights[options.candidates[slot] ?? 0]

    if (entry === undefined) {
      continue
    }

    const { light, position } = entry
    // the squared distance rejects the light before the square root and the divisions: a corner of a big level is out
    // of the reach of most of its lights, and the full bake is half a second of this loop
    const alongX = position.x - options.position.x
    const alongY = position.y - options.position.y
    const alongZ = position.z - options.position.z
    const squaredX = alongX * alongX
    const squaredY = alongY * alongY
    const squaredZ = alongZ * alongZ
    const distanceSquared = squaredX + squaredY + squaredZ
    const reach = light.fallEnd * light.fallEnd

    if (distanceSquared === 0 || distanceSquared > reach) {
      continue
    }

    const distance = Math.sqrt(distanceSquared)

    options.toLight.set(alongX, alongY, alongZ).divideScalar(distance)

    let cosine = options.normal.dot(options.toLight)

    if (doubleSided) {
      cosine = Math.abs(cosine)
    }

    if (cosine <= 0) {
      continue
    }

    if (isBlocked(options, position, distance)) {
      continue
    }

    const falloff = falloffOf(light, distance)

    if (falloff === undefined) {
      continue
    }

    const contribution = cosine * falloff * light.intensity * options.factor
    const redPart = light.color.r * contribution
    const greenPart = light.color.g * contribution
    const bluePart = light.color.b * contribution

    red = red + redPart
    green = green + greenPart
    blue = blue + bluePart
  }

  return {
    r: MathUtils.clamp(Math.round(red), options.ambient, 255),
    g: MathUtils.clamp(Math.round(green), options.ambient, 255),
    b: MathUtils.clamp(Math.round(blue), options.ambient, 255),
    a: 255,
  }
}

/**
 * How many corners a chunk of the asynchronous bake computes before it lets the page paint.
 *
 * @remarks
 * The bake of a big level is about half a second of work; a chunk of five thousand corners is a few tens of milliseconds
 * of it, so the spinner of the editor moves between the chunks.
 */
export const CHUNK_CORNERS = 5000

/**
 * Lets the page paint before the next chunk of the bake.
 *
 * @returns A promise that resolves on the next turn of the event loop.
 */
export async function letThePagePaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * Reads what a bake of the lights needs, once.
 *
 * @remarks
 * The full bake and the bake of the corners a light reaches share this: the lights, the blockers, the factor and the
 * floor of the profile. The modes that do not read the lights (`MaxBrightness`, `CompleteDarkness`, `TextureRainbow`,
 * `Flat`) have no context: their palette is not the light of the level.
 *
 * @param lights The lights of the bake, with their position in the frame of the scene.
 * @param options The profile of the bake and what it reads.
 * @param grid The grid of the lights, when the bake reads only the ones a corner needs.
 *
 * @returns What the bake of a corner reads, or `undefined` when the mode does not read the lights.
 */
export function bakeContextOf(
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
  options: LightingOptions,
  grid?: LightGrid,
): BakeContext | undefined {
  const modesWithoutLights: readonly LightingCalculatorMode[] = [
    'MaxBrightness',
    'CompleteDarkness',
    'TextureRainbow',
    'Flat',
  ]

  if (modesWithoutLights.includes(options.mode)) {
    return undefined
  }

  const shadows = options.shadows ?? true
  const blockers: Blocker[] = []
  let factor = GLOBAL_LIGHT_FACTOR

  if (shadows && options.occluders !== undefined && options.mode === 'Realistic') {
    for (const mesh of options.occluders) {
      // the level builds the tree when it makes its mesh, and a mesh without one (a wall of a test) gets it here: the
      // tree is what the bake of a big level can afford to walk per corner
      if (mesh.geometry.boundsTree === undefined) {
        accelerateRaycast(mesh)
      }

      const tree = mesh.geometry.boundsTree as MeshBVH | undefined

      if (tree === undefined) {
        continue
      }

      // the tree answers in the space of the mesh, and the bake keeps the way into it: the meshes of a level do not move
      // while the bake of its palette runs
      mesh.updateWorldMatrix(true, false)
      blockers.push({ tree, inverse: mesh.matrixWorld.clone().invert() })
    }
  }

  if (options.mode === 'Realistic') {
    factor = 1
  }

  const candidates = lights.keys().toArray()

  return {
    grid,
    corner: {
      position: new Vector3(),
      normal: new Vector3(),
      lights,
      candidates,
      candidateCount: candidates.length,
      blockers,
      ray: new ThreeRay(),
      factor,
      ambient: ambientOf(options.mode, options.ambientFloor ?? 0),
      toLight: new Vector3(),
    },
  }
}

/**
 * Moves the corner of a bake to one corner of a face.
 *
 * @remarks
 * The frame is the editor's: the FTS vertices are absolute and the scene position shifts them into the frame of the
 * lights, and both the position and the normal are mirrored the way the mesh is.
 *
 * @param context The corner of the walk.
 * @param scenePosition The position of the scene of the level, which the corners are shifted by.
 * @param polygon The face the corner belongs to.
 * @param index The position of the corner in the face, from zero.
 */
function moveCornerOf(context: BakeContext, scenePosition: ArxVector3, polygon: ArxPolygon, index: number): void {
  const vertex = polygon.vertices[index]
  const { corner } = context

  corner.position.set(-vertex.x + scenePosition.x, -vertex.y + scenePosition.y, vertex.z - scenePosition.z)

  const normal = normalOfCorner(polygon, index)

  corner.normal.set(-normal.x, -normal.y, normal.z).normalize()
}

/**
 * The steps of the bake, one corner at a time.
 *
 * @remarks
 * The synchronous bake consumes it in one go, and the asynchronous one lets the page paint between chunks of it: the
 * two compute the same palette. A corner is one `yield`; the flat (`MaxBrightness`, `CompleteDarkness`) and the
 * rainbow modes return the palette before the first step.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The steps, and at the end the colors of the palette.
 */
export function* bakeLlfColorsSteps(
  fts: ArxFTS,
  llf: ArxLLF,
  options: LightingOptions,
): Generator<void, ArxColor[], void> {
  if (options.mode === 'MaxBrightness') {
    return llf.colors.map(() => {
      return { r: 255, g: 255, b: 255, a: 255 }
    })
  }

  if (options.mode === 'CompleteDarkness') {
    return llf.colors.map(() => {
      return { r: 0, g: 0, b: 0, a: 255 }
    })
  }

  if (options.mode === 'TextureRainbow') {
    return bakeTextureRainbow(fts, llf, MathUtils.clamp(options.rainbowLuminosity ?? 1, 0, 1))
  }

  if (options.mode === 'Flat') {
    const level = MathUtils.clamp(options.flatLuminosity ?? 1, 0, 1)
    const value = Math.round(level * 255)

    return llf.colors.map(() => {
      return { r: value, g: value, b: value, a: 255 }
    })
  }

  const lights = collectLights(llf)
  const grid = lightGridOf(llf, lights)
  const context = bakeContextOf(lights, options, grid)
  const scenePosition = fts.header.mScenePosition
  const colors: ArxColor[] = llf.colors.map(() => {
    return { r: 0, g: 0, b: 0, a: 255 }
  })

  if (context === undefined) {
    return colors
  }

  for (const polygon of fts.polygons) {
    const doubleSided = (polygon.flags & ArxPolygonFlags.DoubleSided) !== 0

    for (let index = 0; index < colorCountOf(polygon); index = index + 1) {
      const colorIndex = polygon.vertices[index].llfColorIdx

      if (colorIndex !== undefined) {
        moveCornerOf(context, scenePosition, polygon, index)

        if (grid !== undefined) {
          fillCandidatesOf(context, grid)
        }

        colors[colorIndex] = bakeCornerOf(context.corner, doubleSided)
      }

      yield
    }
  }

  return colors
}
