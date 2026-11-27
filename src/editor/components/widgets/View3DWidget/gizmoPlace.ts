import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { Vector3, type Camera } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'

/**
 * How many points of the surface the place of the handle is read from.
 *
 * @remarks
 * A camera that moves reads the place of the handle again, and a big selection has tens of thousands of faces: the
 * points are sampled down to this many when the selection is read, and a frame projects them (a projection is a
 * multiplication of two matrices, so a few hundred of them cost nothing). A still camera reads nothing: the handle is a
 * point of the selection, and it goes with the mesh (2026-11-27, the owner).
 */
export const SURFACE_SAMPLE = 400

/**
 * How many points a face may give to the buffer: its corners.
 *
 * @remarks
 * The corners are the points that stay on the view the longest (the middle of a big face leaves the canvas while the
 * face itself is still there), and they are points of the mesh whatever shape it has: the middle of a curved quad is
 * not on either of the triangles the game draws (measured on level 8: a camera turned 40 degrees took the middle of a
 * wall off the view, and the wall was still half of the canvas). The middle of the face under the crosshair is a point
 * of the surface anyway, and the ray of the pick reads it.
 */
const POINTS_PER_FACE = 4

/**
 * How much a point of the selection above or below the line of the crosshair costs against a point beside it.
 *
 * @remarks
 * The point nearest to the middle of the view jumps up and down the mesh: on a tree a slight turn of the camera takes it
 * from one tip to another, and the handle flies between them without leaving the surface (2026-11-27, the owner). The
 * height of the handle is what the author reads against the crosshair, so a point off the line of it costs this many
 * times its distance: the handle stays at the height of the crosshair, and it walks along the line instead. Eight is
 * nearly ten steps of the width for one of the height, so on a view of the walkable widget a point twenty pixels above
 * or below the line costs as much as a point a hundred and ninety pixels beside it.
 */
const HEIGHT_COST = 8

/**
 * Where a point of the surface of the selection stands: a face, and the share of each corner of it.
 *
 * @remarks
 * The handle of a drag is a point of the mesh, not a place in the world: a step of the history (a move, a turn, a scale,
 * an undo) moves the corners of the face, and the point of it goes with them (2026-11-27, the owner: the handle jumped
 * to an other point of the selection when the drag was let go). The face is the index of it in the level, and the
 * weights are in the order of its corners.
 */
export type SurfaceAnchor = {
  /**
   * The face, by its index in the level.
   */
  readonly face: number
  /**
   * The share of each corner of the face; they add up to one.
   */
  readonly weights: readonly number[]
}

/**
 * The points of the surface of a selection the handle may stand on.
 */
export type Surface = {
  /**
   * The points, in the world, three numbers each.
   */
  readonly points: Float32Array
  /**
   * The anchor of each point, in the order of the buffer.
   */
  readonly anchors: readonly SurfaceAnchor[]
}

/**
 * A point of a face the handle may stand on, with the anchor of it.
 */
type FacePoint = {
  /**
   * The point, in the world.
   */
  readonly point: Vector3
  /**
   * The share of each corner of the face.
   */
  readonly weights: number[]
}

/**
 * Reads how many corners a face has.
 *
 * @param polygon The face.
 *
 * @returns The corners this build reads: four for a quad, three for a triangle.
 */
function cornersOf(polygon: ArxPolygon): number {
  if (isQuad(polygon)) {
    return 4
  }

  return 3
}

/**
 * Reads the weights of the corners of a face, all on zero.
 *
 * @param count The corners of the face.
 *
 * @returns The weights, in the order of the corners.
 */
function zeroWeightsOf(count: number): number[] {
  const weights: number[] = []

  for (let index = 0; index < count; index++) {
    weights.push(0)
  }

  return weights
}

/**
 * Reads the dot product of two vectors of the level.
 *
 * @param a One vector.
 * @param b The other vector.
 *
 * @returns The dot product of them.
 */
function dotOf(a: ArxVector3, b: ArxVector3): number {
  const x = a.x * b.x
  const y = a.y * b.y
  const z = a.z * b.z

  return x + (y + z)
}

/**
 * Reads the difference of two products.
 *
 * @param a The first factor of the product that is taken away from.
 * @param b The second factor of it.
 * @param c The first factor of the product that is taken away.
 * @param d The second factor of it.
 *
 * @returns `a * b - c * d`.
 */
function differenceOfProducts(a: number, b: number, c: number, d: number): number {
  const first = a * b
  const second = c * d

  return first - second
}

/**
 * Tells whether a point of a triangle may stand inside it.
 *
 * @param weights The share of each corner.
 *
 * @returns True when no corner has a negative share but the slack of the arithmetic.
 */
function isInside(weights: readonly number[]): boolean {
  return weights.every((weight) => {
    return weight >= -1e-6
  })
}

/**
 * Reads the share of each corner of a triangle in a point of it.
 *
 * @param point The point, in the coordinates of the level.
 * @param corners The three corners of the triangle.
 *
 * @returns The weights, in the order of the corners, or `undefined` when the triangle has no area.
 */
function triangleWeightsOf(point: ArxVector3, corners: readonly ArxVector3[]): number[] | undefined {
  const a = corners[0]
  const b = corners[1]
  const c = corners[2]

  if (a === undefined || b === undefined || c === undefined) {
    return undefined
  }

  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
  const ap = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z }

  const bb = dotOf(ab, ab)
  const bc = dotOf(ab, ac)
  const cc = dotOf(ac, ac)
  const bp = dotOf(ab, ap)
  const cp = dotOf(ac, ap)
  const denominator = differenceOfProducts(bb, cc, bc, bc)

  if (Math.abs(denominator) < 1e-12) {
    return undefined
  }

  const acrossB = differenceOfProducts(cc, bp, bc, cp) / denominator
  const acrossC = differenceOfProducts(bb, cp, bc, bp) / denominator

  return [1 - acrossB - acrossC, acrossB, acrossC]
}

/**
 * Reads the anchor of a point of a face.
 *
 * @param point The point, in the world.
 * @param polygon The face the point stands on.
 * @param face The index of the face in the level.
 * @param offset The scene position of the level, which the world subtracts.
 *
 * @returns The anchor of the point, or `undefined` when the point is off the face.
 */
export function anchorOfPoint(
  point: Vector3,
  polygon: ArxPolygon,
  face: number,
  offset: Vector3,
): SurfaceAnchor | undefined {
  // the level takes the world back: the scene position is what the world lost, and the mirror is its own inverse
  const level = arxVector3toVector3(point.clone().add(offset))
  const count = cornersOf(polygon)
  const a = polygon.vertices[0]
  const b = polygon.vertices[1]
  const c = polygon.vertices[2]

  if (a === undefined || b === undefined || c === undefined) {
    return undefined
  }

  const first = triangleWeightsOf(level, [a, b, c])

  if (first !== undefined && isInside(first)) {
    const weights = [first[0] ?? 0, first[1] ?? 0, first[2] ?? 0]

    if (count === 3) {
      return { face, weights }
    }

    weights.push(0)

    return { face, weights }
  }

  if (count === 3) {
    return undefined
  }

  const d = polygon.vertices[3]

  if (d === undefined) {
    return undefined
  }

  // the quad is split along b-c: the other triangle is (c, b, d)
  const second = triangleWeightsOf(level, [c, b, d])

  if (second === undefined || !isInside(second)) {
    return undefined
  }

  return { face, weights: [0, second[1] ?? 0, second[0] ?? 0, second[2] ?? 0] }
}

/**
 * Reads where the anchor stands now, in the world.
 *
 * @param anchor The point of the face.
 * @param map The level of the face.
 * @param offset The scene position of the level, which the world subtracts.
 *
 * @returns The point of the face, or `undefined` when the face is not in the level.
 */
export function pointOfAnchor(anchor: SurfaceAnchor, map: ArxMap, offset: Vector3): Vector3 | undefined {
  const polygon = map.polygons[anchor.face]

  if (polygon === undefined) {
    return undefined
  }

  const count = cornersOf(polygon)
  let x = 0
  let y = 0
  let z = 0
  let total = 0

  for (let index = 0; index < count; index++) {
    const weight = anchor.weights[index]
    const vertex = polygon.vertices[index]

    if (weight === undefined || vertex === undefined) {
      continue
    }

    const shareX = weight * vertex.x
    const shareY = weight * vertex.y
    const shareZ = weight * vertex.z

    x = x + shareX
    y = y + shareY
    z = z + shareZ
    total = total + weight
  }

  if (Math.abs(total) < 1e-9) {
    return undefined
  }

  return arxVector3toVector3({ x: x / total, y: y / total, z: z / total }).sub(offset)
}

/**
 * Reads the points of one face the handle may stand on: its corners.
 *
 * @param map The level of the face.
 * @param face The index of the face in the level.
 * @param offset The scene position of the level, which the world subtracts.
 *
 * @returns The points of the face; empty when it is not in the level.
 */
function facePointsOf(map: ArxMap, face: number, offset: Vector3): FacePoint[] {
  const polygon = map.polygons[face]

  if (polygon === undefined) {
    return []
  }

  const count = cornersOf(polygon)
  const points: FacePoint[] = []

  for (let index = 0; index < count; index++) {
    const vertex = polygon.vertices[index]

    if (vertex === undefined) {
      continue
    }

    const weights = zeroWeightsOf(count)

    weights[index] = 1
    points.push({ point: arxVector3toVector3(vertex).sub(offset), weights })
  }

  return points
}

/**
 * Reads the points of the selected faces the handle may stand on, in the world, sampled down.
 *
 * @param map The level of the faces.
 * @param faces The selected faces, by their index in the level.
 * @param offset The scene position of the level, which the world subtracts.
 *
 * @returns The points of every sampled face, with the anchor of each.
 */
export function surfaceOf(map: ArxMap, faces: readonly number[], offset: Vector3): Surface {
  const facesToRead = Math.max(1, Math.floor(SURFACE_SAMPLE / POINTS_PER_FACE))
  const step = Math.max(1, Math.floor(faces.length / facesToRead))
  const limit = SURFACE_SAMPLE * 3
  const numbers: number[] = []
  const anchors: SurfaceAnchor[] = []

  for (let index = 0; index < faces.length && numbers.length < limit; index = index + step) {
    const face = faces[index]

    if (face === undefined) {
      continue
    }

    for (const found of facePointsOf(map, face, offset)) {
      if (numbers.length + 3 > limit) {
        return { points: new Float32Array(numbers), anchors }
      }

      numbers.push(found.point.x, found.point.y, found.point.z)
      anchors.push({ face, weights: found.weights })
    }
  }

  return { points: new Float32Array(numbers), anchors }
}

/**
 * A point of the surface of the selection, with the place of it on the view.
 */
export type SurfaceCandidate = {
  /**
   * The index of the point in the buffer of the surface.
   */
  readonly index: number
  /**
   * Where the point is on the view, in the units of the normalized device coordinates.
   */
  readonly x: number
  /**
   * Where the point is on the view, the height of it.
   */
  readonly y: number
  /**
   * How far the point is from the line of the crosshair, the height of it weighed in.
   */
  readonly cost: number
}

/**
 * Reads the points of the selection nearest to the line of the crosshair.
 *
 * @remarks
 * The handle of a drag stands on the face the author looks at. The points of the selection are projected, the ones on
 * the view are the candidates, and the order of them is the distance from the **line of the crosshair**: the height of
 * that line is what the author reads the handle against, so a point above or below it costs {@link HEIGHT_COST} times
 * its distance, and only a point near that line pulls the handle away from the middle of the view. A turned camera
 * therefore slides the handle along the height of the crosshair, on the art, instead of jumping between the tips of the
 * mesh (2026-11-27, the owner). A selection that left the view has no candidate at all.
 *
 * More than one is read when the view has to try them: a point of the selection may stand behind another mesh (a floor
 * under a tree), and the handle of it would be hidden there (2026-11-27, the owner: the handle went around the faces of
 * the tree while the floor was the selection).
 *
 * @param points The points of the surface of the selection, three numbers each.
 * @param camera The camera the view draws through.
 * @param limit How many candidates to read at most.
 *
 * @returns The candidates, nearest first.
 */
export function surfaceCandidatesOf(points: Float32Array, camera: Camera, limit: number): SurfaceCandidate[] {
  const world = new Vector3()
  const projected = new Vector3()
  const candidates: SurfaceCandidate[] = []

  for (let index = 0; index < points.length; index = index + 3) {
    world.set(points[index] ?? 0, points[index + 1] ?? 0, points[index + 2] ?? 0)
    projected.copy(world).project(camera)

    // a point behind the camera, or past the edge of the canvas, is not what the author looks at
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || projected.z > 1) {
      continue
    }

    const across = Math.abs(projected.x)
    const up = Math.abs(projected.y) * HEIGHT_COST
    const cost = up + across
    let placed = candidates.length

    while (placed > 0) {
      const other = candidates[placed - 1]

      if (other === undefined || cost >= other.cost) {
        break
      }

      placed = placed - 1
    }

    candidates.splice(placed, 0, { index: index / 3, x: projected.x, y: projected.y, cost })

    if (candidates.length > limit) {
      candidates.pop()
    }
  }

  return candidates
}

/**
 * Reads the place of the handle: the surface point of the selection nearest to the line of the crosshair.
 *
 * @param points The points of the surface of the selection, three numbers each.
 * @param camera The camera the view draws through.
 *
 * @returns The index of the winning point, or `undefined` when none of them is on the view.
 */
export function nearestSurfaceIndexOf(points: Float32Array, camera: Camera): number | undefined {
  return surfaceCandidatesOf(points, camera, 1)[0]?.index
}

/**
 * Tells whether a point of the world is on the view.
 *
 * @param point The point, in the world.
 * @param camera The camera the view draws through.
 *
 * @returns True when the point projects inside the canvas, in front of the camera.
 */
export function isOnView(point: Vector3, camera: Camera): boolean {
  const projected = point.clone().project(camera)

  return Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z <= 1
}
