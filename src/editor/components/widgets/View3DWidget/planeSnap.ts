import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3, type Camera, type Scene } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { polygonPerimeter } from '../../../../generator/polygons.ts'
import { screenDistance, snapAxesOf, snapThresholdPx, type ScreenPoint } from '../shared/snapping.ts'
import { selectionCornersOf } from './selectionCorners.ts'

/**
 * The size of a cell of the grid of the target faces, in the units of the level.
 */
const CELL_SIZE = 100

/**
 * How many cells the search walks around a corner, on every axis.
 *
 * @remarks
 * The threshold is a jump on the canvas, so the face a corner may land on is close in the world too: three cells reach
 * a target that the perspective makes look near from far away, and stop before the whole level is walked.
 */
const SEARCH_CELLS = 3

/**
 * How far a corner may be from the face it snaps to, in the units of the level, while the landing point is tested.
 *
 * @remarks
 * The corner of one face and the edge of its neighbor share a place, and the float numbers of the FTS carry the two
 * a little apart; the tolerance keeps a landing on the border of a face inside it.
 */
const FACE_EDGE_TOLERANCE = 0.01

/**
 * How flat the drag axis has to be against the plane of a face to skip it, as the cosine of the angle.
 *
 * @remarks
 * A line that runs in the plane of a face never meets it: the snap would divide by nearly zero and jump along the
 * level. A drag along the floor toward a wall is the reason the check is here: the floor can not take the corner.
 */
const PARALLEL_EPSILON = 1e-6

/**
 * The number of points the outline of the marker can hold: a face of four corners and the first one again.
 */
const MARKER_POINTS = 5

/**
 * A face of the level the corner of the selection may land on.
 */
type TargetFace = {
  /**
   * The index of the polygon in the level.
   */
  readonly index: number
  /**
   * The corners of the face, in the order of its outline.
   */
  readonly perimeter: readonly number[]
  /**
   * The unit normal of its plane.
   */
  readonly normal: ArxVector3
  /**
   * The offset of its plane: the normal of every point of the face gives this dot.
   */
  readonly planeOffset: number
}

/**
 * A face of the level a corner of the selection can land on, with the move that lands it.
 */
type PlaneCandidate = {
  /**
   * The face the corner lands on.
   */
  readonly target: TargetFace
  /**
   * The offset that lands the corner on its plane, along the axis of the drag.
   */
  readonly correction: ArxVector3
  /**
   * How far the corner was from the face on the canvas.
   */
  readonly distance: number
  /**
   * How far the landing point is from the corner on the canvas.
   */
  readonly jump: number
}

/**
 * What a frame of the plane snap says.
 */
export type PlaneSnapResult = {
  /**
   * The offset to add to the tentative translation, along the axis of the drag.
   */
  readonly correction: ArxVector3
  /**
   * The face the corner lands on, when there is one.
   */
  readonly target?: number
  /**
   * How far the corner was from the face on the canvas, when there is a target.
   */
  readonly distance?: number
}

/**
 * The snap of a drag to the plane of the faces of the level.
 */
export type PlaneSnap = {
  /**
   * Reads the closest face a corner of the selection can land on.
   *
   * @param translation The translation the drag has taken so far, in the coordinates of the level.
   * @param axis The handle of the gizmo, like `X`.
   *
   * @returns The correction along the axis, and the face it lands on.
   */
  readonly snap: (translation: ArxVector3, axis: string | null | undefined) => PlaneSnapResult
  /**
   * Hides the outline of the target face.
   */
  readonly hide: () => void
  /**
   * Frees the outline and its grid.
   */
  readonly dispose: () => void
}

/**
 * What the plane snap reads from the view.
 */
export type PlaneSnapOptions = {
  /**
   * The camera of the view, for the screen-space threshold.
   */
  readonly camera: Camera
  /**
   * The canvas the view draws on, for the pixels of the threshold.
   */
  readonly canvas: HTMLCanvasElement
  /**
   * The scene the outline of the target face goes into.
   */
  readonly scene: Scene
}

/**
 * The unit vector of an axis of the gizmo, in the coordinates of the level.
 *
 * @param axis The handle of the gizmo to turn into a vector.
 *
 * @returns The unit vector of it.
 */
function axisVectorOf(axis: 'x' | 'y' | 'z'): ArxVector3 {
  if (axis === 'x') {
    return { x: 1, y: 0, z: 0 }
  }

  if (axis === 'y') {
    return { x: 0, y: 1, z: 0 }
  }

  return { x: 0, y: 0, z: 1 }
}

/**
 * The dot product of two vectors.
 *
 * @param one The first vector.
 * @param other The second one.
 *
 * @returns The sum of the products of their coordinates.
 */
function dotProduct(one: ArxVector3, other: ArxVector3): number {
  const x = one.x * other.x
  const y = one.y * other.y
  const z = one.z * other.z

  return x + y + z
}

/**
 * The cross product of two vectors.
 *
 * @param one The first vector.
 * @param other The second one.
 *
 * @returns The vector that stands on both.
 */
function crossProduct(one: ArxVector3, other: ArxVector3): ArxVector3 {
  const x = one.y * other.z
  const y = one.z * other.x
  const z = one.x * other.y
  const oppositeX = one.z * other.y
  const oppositeY = one.x * other.z
  const oppositeZ = one.y * other.x

  return { x: x - oppositeX, y: y - oppositeY, z: z - oppositeZ }
}

/**
 * The cells of the grid around a position.
 *
 * @param position The position in the coordinates of the level.
 *
 * @returns The keys of the cells the search walks.
 */
function cellsAround(position: ArxVector3): string[] {
  const cellX = Math.floor(position.x / CELL_SIZE)
  const cellY = Math.floor(position.y / CELL_SIZE)
  const cellZ = Math.floor(position.z / CELL_SIZE)
  const cells: string[] = []

  for (let x = cellX - SEARCH_CELLS; x <= cellX + SEARCH_CELLS; x = x + 1) {
    for (let y = cellY - SEARCH_CELLS; y <= cellY + SEARCH_CELLS; y = y + 1) {
      for (let z = cellZ - SEARCH_CELLS; z <= cellZ + SEARCH_CELLS; z = z + 1) {
        cells.push(`${String(x)},${String(y)},${String(z)}`)
      }
    }
  }

  return cells
}

/**
 * The cells a face covers, as the keys of the grid.
 *
 * @remarks
 * The box of the face is what is indexed, not its middle: a wall of a corridor is long, and the corner may come to its
 * far end, where the middle of the face would not be in the cells the search walks.
 *
 * @param polygon The face whose box is indexed.
 * @param perimeter The corners of its outline.
 *
 * @returns The keys of the cells its box covers.
 */
function cellsOfFace(polygon: ArxPolygon, perimeter: readonly number[]): string[] {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const index of perimeter) {
    const vertex = polygon.vertices[index]

    if (vertex === undefined) {
      continue
    }

    minX = Math.min(minX, vertex.x)
    minY = Math.min(minY, vertex.y)
    minZ = Math.min(minZ, vertex.z)
    maxX = Math.max(maxX, vertex.x)
    maxY = Math.max(maxY, vertex.y)
    maxZ = Math.max(maxZ, vertex.z)
  }

  if (!Number.isFinite(minX)) {
    return []
  }

  const cells: string[] = []

  for (let x = Math.floor(minX / CELL_SIZE); x <= Math.floor(maxX / CELL_SIZE); x = x + 1) {
    for (let y = Math.floor(minY / CELL_SIZE); y <= Math.floor(maxY / CELL_SIZE); y = y + 1) {
      for (let z = Math.floor(minZ / CELL_SIZE); z <= Math.floor(maxZ / CELL_SIZE); z = z + 1) {
        cells.push(`${String(x)},${String(y)},${String(z)}`)
      }
    }
  }

  return cells
}

/**
 * Reads the unit normal of the plane of a face.
 *
 * @param polygon The face.
 * @param perimeter The corners of its outline.
 *
 * @returns The normal, or `undefined` when the face has no plane (a line of no area).
 */
function normalOf(polygon: ArxPolygon, perimeter: readonly number[]): ArxVector3 | undefined {
  const first = polygon.vertices[perimeter[0] ?? -1]
  const second = polygon.vertices[perimeter[1] ?? -1]
  const third = polygon.vertices[perimeter[2] ?? -1]

  if (first === undefined || second === undefined || third === undefined) {
    return undefined
  }

  const abX = second.x - first.x
  const abY = second.y - first.y
  const abZ = second.z - first.z
  const acX = third.x - first.x
  const acY = third.y - first.y
  const acZ = third.z - first.z
  const { x, y, z } = crossProduct({ x: abX, y: abY, z: abZ }, { x: acX, y: acY, z: acZ })
  const length = Math.hypot(x, y, z)

  if (length < 1e-9) {
    return undefined
  }

  return { x: x / length, y: y / length, z: z / length }
}

/**
 * Tells whether a point of the plane of a face is inside its outline.
 *
 * @remarks
 * The faces of the level are convex, so the point is inside when it stands on the same side of every edge of the
 * outline. The distance of the point from the line of an edge is compared with the tolerance: a landing on a shared
 * edge counts as inside.
 *
 * @param polygon The face whose outline the point is tested against.
 * @param perimeter The corners of its outline.
 * @param normal The unit normal of its plane.
 * @param point The place on the plane to test.
 *
 * @returns True when the point is inside the face.
 */
function isInsideFace(
  polygon: ArxPolygon,
  perimeter: readonly number[],
  normal: ArxVector3,
  point: ArxVector3,
): boolean {
  let sign = 0

  for (let index = 0; index < perimeter.length; index = index + 1) {
    const from = polygon.vertices[perimeter[index] ?? -1]
    const to = polygon.vertices[perimeter[(index + 1) % perimeter.length] ?? -1]

    if (from === undefined || to === undefined) {
      return false
    }

    const edgeX = to.x - from.x
    const edgeY = to.y - from.y
    const edgeZ = to.z - from.z
    const pointX = point.x - from.x
    const pointY = point.y - from.y
    const pointZ = point.z - from.z
    const side = dotProduct(crossProduct({ x: edgeX, y: edgeY, z: edgeZ }, { x: pointX, y: pointY, z: pointZ }), normal)
    const edgeLength = Math.hypot(edgeX, edgeY, edgeZ)

    if (edgeLength < 1e-9) {
      continue
    }

    const distance = side / edgeLength

    if (Math.abs(distance) < FACE_EDGE_TOLERANCE) {
      continue
    }

    if (sign === 0) {
      sign = distance
    } else if (distance * sign < 0) {
      return false
    }
  }

  return true
}

/**
 * The distance of a point from a segment of the canvas.
 *
 * @param point The point of the canvas.
 * @param from The start of the segment.
 * @param to The end of it.
 *
 * @returns The distance in pixels.
 */
function distanceToSegment(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const edgeX = to.x - from.x
  const edgeY = to.y - from.y
  const squaredX = edgeX * edgeX
  const squaredY = edgeY * edgeY
  const lengthSquared = squaredX + squaredY

  if (lengthSquared === 0) {
    return screenDistance(point, from)
  }

  const relativeX = point.x - from.x
  const relativeY = point.y - from.y
  const dotX = relativeX * edgeX
  const dotY = relativeY * edgeY
  const t = Math.min(1, Math.max(0, (dotX + dotY) / lengthSquared))
  const stepX = edgeX * t
  const stepY = edgeY * t
  const nearestX = from.x + stepX
  const nearestY = from.y + stepY

  return Math.hypot(point.x - nearestX, point.y - nearestY)
}

/**
 * The distance of a point from a polygon of the canvas.
 *
 * @param point The point of the canvas.
 * @param polygon The corners of the polygon, in the order of its outline.
 *
 * @returns The distance in pixels: zero inside the polygon.
 */
function distanceToPolygon(point: ScreenPoint, polygon: readonly ScreenPoint[]): number {
  let positive = 0
  let negative = 0

  for (let index = 0; index < polygon.length; index = index + 1) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]

    if (from === undefined || to === undefined) {
      continue
    }

    const edgeX = to.x - from.x
    const edgeY = to.y - from.y
    const relativeX = point.x - from.x
    const relativeY = point.y - from.y
    const first = edgeX * relativeY
    const second = edgeY * relativeX
    const side = first - second

    if (side > 0) {
      positive = positive + 1
    } else if (side < 0) {
      negative = negative + 1
    }
  }

  if (positive === 0 || negative === 0) {
    return 0
  }

  let nearest = Number.POSITIVE_INFINITY

  for (let index = 0; index < polygon.length; index = index + 1) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]

    if (from === undefined || to === undefined) {
      continue
    }

    nearest = Math.min(nearest, distanceToSegment(point, from, to))
  }

  return nearest
}

/**
 * Builds the snap of a translate drag to the planes of the faces of the level.
 *
 * @remarks
 * The source is a **corner of the selection**, not the crosshair: the author brings the face near a surface, and the
 * corner is what lands on it. The target is a visible face of the level the corner can reach: the corner is on the
 * face on the canvas (or within the threshold of its outline), and the line of the drag meets its plane inside the
 * face. The correction is the meeting point along the axis of the drag.
 *
 * The jump of the snap is a distance on the canvas too: a corner that stands high above a floor is over it on the
 * screen, but landing on the floor plane would move the selection far, so it is not taken. This is what makes the snap
 * let go when the author lifts a face off the floor.
 *
 * The marker is the outline of the face the corner lands on.
 *
 * @param map The level of the selection.
 * @param faces The selected faces.
 * @param options The camera, the canvas and the scene of the view.
 *
 * @returns The snap of the drag.
 */
export function createPlaneSnap(map: ArxMap, faces: readonly number[], options: PlaneSnapOptions): PlaneSnap {
  const { camera, canvas, scene } = options
  const corners = selectionCornersOf(map, faces)
  const selected = new Set(
    faces.map((index) => {
      return map.polygons[index]
    }),
  )
  const grid = new Map<string, TargetFace[]>()

  for (const [index, polygon] of map.polygons.entries()) {
    if (selected.has(polygon) || map.isHidden(polygon)) {
      continue
    }

    const perimeter = polygonPerimeter(polygon)
    const normal = normalOf(polygon, perimeter)

    if (normal === undefined) {
      continue
    }

    const first = polygon.vertices[perimeter[0] ?? -1]

    if (first === undefined) {
      continue
    }

    const target: TargetFace = {
      index,
      perimeter,
      normal,
      planeOffset: dotProduct(normal, first),
    }

    for (const cell of cellsOfFace(polygon, perimeter)) {
      const list = grid.get(cell)

      if (list === undefined) {
        grid.set(cell, [target])
      } else {
        list.push(target)
      }
    }
  }

  const markerGeometry = new BufferGeometry()
  const markerAttribute = new BufferAttribute(new Float32Array(MARKER_POINTS * 3), 3)
  const markerMaterial = new LineBasicMaterial({ color: 0xff_d5_4a, depthTest: false, transparent: true })
  const marker = new Line(markerGeometry, markerMaterial)

  markerGeometry.setAttribute('position', markerAttribute)
  marker.renderOrder = 1002
  marker.visible = false
  marker.frustumCulled = false
  scene.add(marker)

  const sceneOffset = arxVector3toVector3(map.scenePosition)
  const projected = new Vector3()

  /**
   * Reads a position of the level as the canvas shows it.
   *
   * @param position The position in the coordinates of the level.
   *
   * @returns The point of the canvas, or `undefined` when it is behind the camera.
   */
  function screenOfGame(position: ArxVector3): ScreenPoint | undefined {
    projected.copy(arxVector3toVector3(position)).sub(sceneOffset).project(camera)

    if (Math.abs(projected.z) > 1) {
      return undefined
    }

    const halfX = projected.x * 0.5
    const halfY = projected.y * 0.5

    return {
      x: (halfX + 0.5) * canvas.clientWidth,
      y: (0.5 - halfY) * canvas.clientHeight,
    }
  }

  /**
   * Projects the outline of a face.
   *
   * @param polygon The face to project.
   * @param perimeter The corners of its outline.
   *
   * @returns Its points on the canvas, or `undefined` when a corner of it is behind the camera.
   */
  function screenPolygonOf(polygon: ArxPolygon, perimeter: readonly number[]): ScreenPoint[] | undefined {
    const points: ScreenPoint[] = []

    for (const index of perimeter) {
      const vertex = polygon.vertices[index]

      if (vertex === undefined) {
        return undefined
      }

      const screen = screenOfGame(vertex)

      if (screen === undefined) {
        return undefined
      }

      points.push(screen)
    }

    return points
  }

  /**
   * The snap of one face for one corner, when the corner can land on it.
   *
   * @param target The face to test.
   * @param current The corner at the translation of the frame.
   * @param screen The corner on the canvas.
   * @param direction The unit vector of the drag.
   *
   * @returns The candidate, or `undefined` when the corner can not land on the face.
   */
  function candidateOf(
    target: TargetFace,
    current: ArxVector3,
    screen: ScreenPoint,
    direction: ArxVector3,
  ): PlaneCandidate | undefined {
    const polygon = map.polygons[target.index]

    if (polygon === undefined) {
      return undefined
    }

    const screenPolygon = screenPolygonOf(polygon, target.perimeter)

    if (screenPolygon === undefined) {
      return undefined
    }

    const distance = distanceToPolygon(screen, screenPolygon)

    if (distance > snapThresholdPx.value) {
      return undefined
    }

    const denominator = dotProduct(target.normal, direction)

    if (Math.abs(denominator) < PARALLEL_EPSILON) {
      return undefined
    }

    const above = dotProduct(target.normal, current) - target.planeOffset
    const t = -above / denominator

    if (!Number.isFinite(t)) {
      return undefined
    }

    const stepX = direction.x * t
    const stepY = direction.y * t
    const stepZ = direction.z * t
    const landing: ArxVector3 = {
      x: current.x + stepX,
      y: current.y + stepY,
      z: current.z + stepZ,
    }

    if (!isInsideFace(polygon, target.perimeter, target.normal, landing)) {
      return undefined
    }

    const landingScreen = screenOfGame(landing)

    if (landingScreen === undefined) {
      return undefined
    }

    const jump = screenDistance(screen, landingScreen)

    if (jump > snapThresholdPx.value) {
      return undefined
    }

    return {
      target,
      correction: { x: stepX, y: stepY, z: stepZ },
      distance,
      jump,
    }
  }

  /**
   * Hides the outline.
   */
  function hide(): void {
    marker.visible = false
  }

  /**
   * Moves the marker to the outline of a face.
   *
   * @param target The face to mark.
   */
  function mark(target: TargetFace): void {
    const polygon = map.polygons[target.index]

    if (polygon === undefined) {
      hide()

      return
    }

    let count = 0

    for (const index of target.perimeter) {
      const vertex = polygon.vertices[index]

      if (vertex === undefined) {
        continue
      }

      const world = arxVector3toVector3(vertex).sub(sceneOffset)

      markerAttribute.setXYZ(count, world.x, world.y, world.z)
      count = count + 1
    }

    const first = polygon.vertices[target.perimeter[0] ?? -1]

    if (first !== undefined) {
      const world = arxVector3toVector3(first).sub(sceneOffset)

      markerAttribute.setXYZ(count, world.x, world.y, world.z)
      count = count + 1
    }

    markerAttribute.needsUpdate = true
    markerGeometry.setDrawRange(0, count)
    marker.visible = true
  }

  return {
    snap: (translation: ArxVector3, axis: string | null | undefined): PlaneSnapResult => {
      const axes = snapAxesOf(axis)
      const correction: ArxVector3 = { x: 0, y: 0, z: 0 }

      if (axes.length !== 1 || corners.length === 0) {
        hide()

        return { correction }
      }

      const dragAxis = axes[0]

      if (dragAxis === undefined) {
        hide()

        return { correction }
      }

      camera.updateMatrixWorld()

      const direction = axisVectorOf(dragAxis)
      let best: PlaneCandidate | undefined

      for (const corner of corners) {
        const current: ArxVector3 = {
          x: corner.x + translation.x,
          y: corner.y + translation.y,
          z: corner.z + translation.z,
        }
        const screen = screenOfGame(current)

        if (screen === undefined) {
          continue
        }

        const tested = new Set<TargetFace>()

        for (const cell of cellsAround(current)) {
          const list = grid.get(cell)

          if (list === undefined) {
            continue
          }

          for (const target of list) {
            if (tested.has(target)) {
              continue
            }

            tested.add(target)

            const candidate = candidateOf(target, current, screen, direction)

            if (candidate === undefined) {
              continue
            }

            if (
              best === undefined ||
              candidate.distance < best.distance - 1e-6 ||
              (Math.abs(candidate.distance - best.distance) <= 1e-6 && candidate.jump < best.jump)
            ) {
              best = candidate
            }
          }
        }
      }

      if (best === undefined) {
        hide()

        return { correction }
      }

      mark(best.target)

      return { correction: best.correction, target: best.target.index, distance: best.distance }
    },
    hide,
    dispose: (): void => {
      scene.remove(marker)
      markerGeometry.dispose()
      markerMaterial.dispose()
    },
  }
}
