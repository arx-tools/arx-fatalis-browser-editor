import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  MathUtils,
  Vector3,
  type Camera,
  type Scene,
} from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { polygonPerimeter } from '../../../../generator/polygons.ts'
import { SNAP_THRESHOLD_PX, screenDistance, snapAxesOf, type ScreenPoint, type SnapAxis } from '../shared/snapping.ts'

/**
 * How far two edges may be from parallel and still rail, in degrees.
 */
const PARALLEL_TOLERANCE_DEGREES = 15

/**
 * The size of a cell of the grid of the target edges, in the units of the level.
 */
const CELL_SIZE = 100

/**
 * How many cells the search walks around a source edge, on every axis.
 */
const SEARCH_CELLS = 3

/**
 * An edge in the coordinates of the level.
 */
type GameEdge = {
  /**
   * The start of the edge.
   */
  readonly a: ArxVector3
  /**
   * The end of the edge.
   */
  readonly b: ArxVector3
}

/**
 * An edge the rail may use, with the scene positions the marker needs.
 */
type TargetEdge = GameEdge & {
  /**
   * The first end in the scene.
   */
  readonly worldA: Vector3
  /**
   * The second end in the scene.
   */
  readonly worldB: Vector3
}

/**
 * A target edge a frame of the drag can rail on, with the move that rails it.
 */
type EdgeCandidate = {
  /**
   * The edge the selection rails on.
   */
  readonly target: TargetEdge
  /**
   * The closest point of the target to the probe.
   */
  readonly point: ArxVector3
  /**
   * The probe that looks for the target.
   */
  readonly probe: ArxVector3
  /**
   * How far the probe and the closest point were on the canvas.
   */
  readonly distance: number
  /**
   * How far the closest point is along the drag axis.
   */
  readonly along: number
  /**
   * The offset that railed the probe, on the axes of the drag only.
   */
  readonly correction: ArxVector3
}

/**
 * What a frame of the edge rail says.
 */
export type EdgeSnapResult = {
  /**
   * The offset that brings the source edge onto the target edge.
   */
  readonly correction: ArxVector3
  /**
   * The edge the selection rails on, when there is one.
   */
  readonly target?: GameEdge
  /**
   * How far the edge and the source edge were on the canvas, when there is a target.
   */
  readonly distance?: number
}

/**
 * The edge rail of a translate drag.
 */
export type EdgeSnap = {
  /**
   * Reads the closest parallel target edge of a frame.
   *
   * @param translation The translation of the drag so far, in the coordinates of the level.
   * @param axis The handle of the gizmo, like `X`.
   *
   * @returns The correction, and the target edge it comes from.
   */
  readonly snap: (translation: ArxVector3, axis: string | null | undefined) => EdgeSnapResult
  /**
   * Hides the line of the target edge.
   */
  readonly hide: () => void
  /**
   * Frees the line.
   */
  readonly dispose: () => void
}

/**
 * What the edge rail reads from the view.
 */
export type EdgeSnapOptions = {
  /**
   * The camera of the view, for the screen distance of the edges.
   */
  readonly camera: Camera
  /**
   * The canvas the view draws on, for the pixels of the threshold.
   */
  readonly canvas: HTMLCanvasElement
  /**
   * The scene the line of the target edge goes into.
   */
  readonly scene: Scene
}

/**
 * The key of a place, at a tenth of a unit.
 *
 * @param position The place in the level, in its own units.
 *
 * @returns The key that finds the same place again.
 */
function placeKeyOf(position: ArxVector3): string {
  return `${String(Math.round(position.x * 10))},${String(Math.round(position.y * 10))},${String(Math.round(position.z * 10))}`
}

/**
 * The key of an edge, whichever end comes first.
 *
 * @param a Where the edge begins.
 * @param b Where the edge ends.
 *
 * @returns The key that finds the edge from either end.
 */
function edgeKeyOf(a: ArxVector3, b: ArxVector3): string {
  const first = placeKeyOf(a)
  const second = placeKeyOf(b)

  if (first < second) {
    return `${first}|${second}`
  }

  return `${second}|${first}`
}

/**
 * The edges of a polygon.
 *
 * @remarks
 * The corners of a quad come in the order the game stores them (`0, 1, 2, 3`), which is not the order of its outline:
 * the perimeter goes `0-1-3-2` (see `polygonPerimeter`). Walking the corners one after the other would leave out the
 * two side edges of every quad and invent the two diagonals instead, and a drag that has to rail on a side edge (an X
 * drag on a floor, for one) would find no target at all.
 *
 * @param polygon The face.
 *
 * @returns Its edges, in the order of its outline.
 */
function edgesOf(polygon: ArxPolygon): GameEdge[] {
  const perimeter = polygonPerimeter(polygon)
  const edges: GameEdge[] = []

  for (let index = 0; index < perimeter.length; index = index + 1) {
    const from = perimeter[index]
    const to = perimeter[(index + 1) % perimeter.length]

    if (from === undefined || to === undefined) {
      continue
    }

    const one = polygon.vertices[from]
    const other = polygon.vertices[to]

    if (one === undefined || other === undefined) {
      continue
    }

    edges.push({
      a: { x: one.x, y: one.y, z: one.z },
      b: { x: other.x, y: other.y, z: other.z },
    })
  }

  return edges
}

/**
 * The boundary edges of the selection.
 *
 * @remarks
 * An edge shared by two selected faces is inside the selection: it is not a line the author can rail on the level. The
 * edges that belong to one selected face are the outline of the selection, and those are the edges the rail moves.
 *
 * @param map The level.
 * @param faces The selected faces.
 *
 * @returns The boundary edges, without the repeats.
 */
function boundaryEdgesOf(map: ArxMap, faces: readonly number[]): GameEdge[] {
  const counts = new Map<string, { readonly edge: GameEdge; readonly count: number }>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    for (const edge of edgesOf(polygon)) {
      const key = edgeKeyOf(edge.a, edge.b)
      const entry = counts.get(key)

      if (entry === undefined) {
        counts.set(key, { edge, count: 1 })
      } else {
        counts.set(key, { edge: entry.edge, count: entry.count + 1 })
      }
    }
  }

  return counts
    .values()
    .filter((entry) => {
      return entry.count === 1
    })
    .map((entry) => {
      return entry.edge
    })
    .toArray()
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
 * The cell a position falls in.
 *
 * @param position The position in the coordinates of the level.
 *
 * @returns The key of its cell.
 */
function cellKeyOf(position: ArxVector3): string {
  return `${String(Math.floor(position.x / CELL_SIZE))},${String(Math.floor(position.y / CELL_SIZE))},${String(Math.floor(position.z / CELL_SIZE))}`
}

/**
 * The closest point of an edge to a point.
 *
 * @param point The point, in the coordinates of the level.
 * @param a One end of the edge.
 * @param b The other end.
 *
 * @returns The closest point of the segment.
 */
function closestPointOf(point: ArxVector3, a: ArxVector3, b: ArxVector3): ArxVector3 {
  const abX = b.x - a.x
  const abY = b.y - a.y
  const abZ = b.z - a.z
  const squaredX = abX * abX
  const squaredY = abY * abY
  const squaredZ = abZ * abZ
  const lengthSquared = squaredX + squaredY + squaredZ

  if (lengthSquared === 0) {
    return a
  }

  const distanceX = point.x - a.x
  const distanceY = point.y - a.y
  const distanceZ = point.z - a.z
  const dotX = distanceX * abX
  const dotY = distanceY * abY
  const dotZ = distanceZ * abZ
  const t = MathUtils.clamp((dotX + dotY + dotZ) / lengthSquared, 0, 1)
  const stepX = abX * t
  const stepY = abY * t
  const stepZ = abZ * t

  return { x: a.x + stepX, y: a.y + stepY, z: a.z + stepZ }
}

/**
 * The unit direction of an edge, in the coordinates of the level.
 *
 * @param edge The edge whose direction is read.
 *
 * @returns Its direction, or `undefined` for an edge of no length.
 */
function directionOf(edge: GameEdge): ArxVector3 | undefined {
  const x = edge.b.x - edge.a.x
  const y = edge.b.y - edge.a.y
  const z = edge.b.z - edge.a.z
  const length = Math.hypot(x, y, z)

  if (length === 0) {
    return undefined
  }

  return { x: x / length, y: y / length, z: z / length }
}

/**
 * The unit direction of a drag axis.
 *
 * @param axis The axis of the gizmo.
 *
 * @returns The unit vector of the drag, in the coordinates of the level.
 */
function axisDirectionOf(axis: 'x' | 'y' | 'z'): ArxVector3 {
  if (axis === 'x') {
    return { x: 1, y: 0, z: 0 }
  }

  if (axis === 'y') {
    return { x: 0, y: 1, z: 0 }
  }

  return { x: 0, y: 0, z: 1 }
}

/**
 * The midpoint of an edge.
 *
 * @param edge The edge whose midpoint is read.
 *
 * @returns The midpoint, in the coordinates of the level.
 */
function midpointOf(edge: GameEdge): ArxVector3 {
  return {
    x: (edge.a.x + edge.b.x) / 2,
    y: (edge.a.y + edge.b.y) / 2,
    z: (edge.a.z + edge.b.z) / 2,
  }
}

/**
 * Builds the rail of a translate drag on the edges of the level.
 *
 * @remarks
 * The source is the **outline of the selection**: the edges that belong to one selected face. The target is any edge of
 * the visible level that runs parallel to one of them. The correction is the shortest vector between the two lines, so
 * the selection slides along the target when the drag runs along it, and snaps onto it when the drag crosses it; the
 * corners are not the anchor, and a face in the middle of a hole rails on its edge.
 *
 * The marker is the target edge itself, drawn over the level.
 *
 * @param map The level of the selection.
 * @param faces The selected faces.
 * @param options The camera, the canvas and the scene of the view.
 *
 * @returns The rail of the drag.
 */
export function createEdgeSnap(map: ArxMap, faces: readonly number[], options: EdgeSnapOptions): EdgeSnap {
  const { camera, canvas, scene } = options
  const selected = new Set(
    faces.map((index) => {
      return map.polygons[index]
    }),
  )
  const sources = boundaryEdgesOf(map, faces)
  const offset = arxVector3toVector3(map.scenePosition)
  const grid = new Map<string, TargetEdge[]>()
  const seen = new Set<string>()

  for (const polygon of map.polygons) {
    if (selected.has(polygon) || map.isHidden(polygon)) {
      continue
    }

    for (const edge of edgesOf(polygon)) {
      const key = edgeKeyOf(edge.a, edge.b)

      if (seen.has(key)) {
        continue
      }

      seen.add(key)

      const target: TargetEdge = {
        a: edge.a,
        b: edge.b,
        worldA: arxVector3toVector3(edge.a).sub(offset),
        worldB: arxVector3toVector3(edge.b).sub(offset),
      }
      const cell = cellKeyOf(midpointOf(edge))
      const list = grid.get(cell)

      if (list === undefined) {
        grid.set(cell, [target])
      } else {
        list.push(target)
      }
    }
  }

  const geometry = new BufferGeometry()
  const attribute = new BufferAttribute(new Float32Array(6), 3)
  const material = new LineBasicMaterial({ color: 0xff_d5_4a, depthTest: false, transparent: true })
  const line = new Line(geometry, material)

  geometry.setAttribute('position', attribute)
  line.renderOrder = 1002
  line.visible = false
  line.frustumCulled = false
  scene.add(line)

  const projected = new Vector3()

  /**
   * Reads a position of the scene as the canvas shows it.
   *
   * @param world The position in the scene.
   *
   * @returns The point of the canvas, or `undefined` when it is behind the camera.
   */
  function screenOf(world: Vector3): ScreenPoint | undefined {
    projected.copy(world).project(camera)

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
   * Hides the line.
   */
  function hide(): void {
    line.visible = false
  }

  /**
   * Reads a target edge as a candidate of the rail for one probe.
   *
   * @remarks
   * The candidate passes when the two edges run parallel, the target is within the screen threshold of the probe, and
   * the move the rail asks for stays on the axes of the drag and is small on the canvas. The last two are what keep a
   * lift from being pulled onto a far edge of the floor: the face must not move across the drag, and the snap must not
   * undo the drag.
   *
   * @param probe The point of the source edge the frame looks from.
   * @param screen The probe on the canvas.
   * @param target The target edge to test.
   * @param direction The unit direction of the source edge.
   * @param parallel The cosine of the angle two edges still count as parallel at.
   * @param dragDirection The unit direction of the axis of the drag.
   * @param axes The axes of the drag.
   *
   * @returns The candidate, or `undefined` when the target is not a rail of the probe.
   */
  function candidateOf(
    probe: ArxVector3,
    screen: ScreenPoint,
    target: TargetEdge,
    direction: ArxVector3,
    parallel: number,
    dragDirection: ArxVector3,
    axes: readonly SnapAxis[],
  ): EdgeCandidate | undefined {
    const targetDirection = directionOf(target)

    if (targetDirection === undefined) {
      return undefined
    }

    const dotX = direction.x * targetDirection.x
    const dotY = direction.y * targetDirection.y
    const dotZ = direction.z * targetDirection.z

    if (Math.abs(dotX + dotY + dotZ) < parallel) {
      return undefined
    }

    const point = closestPointOf(probe, target.a, target.b)
    const screenPoint = screenOf(arxVector3toVector3(point).sub(offset))

    if (screenPoint === undefined) {
      return undefined
    }

    const distance = screenDistance(screen, screenPoint)

    if (!Number.isFinite(distance) || distance > SNAP_THRESHOLD_PX) {
      return undefined
    }

    // the correction only moves the selection along the horizontal axes of the drag: an edge rail that also pulled it
    // across them would move the face in a direction the author did not drag, and the vertical axis belongs to the plane
    // snap (a Y lift that lands the face on a far edge was the case of 2026-11-21)
    const correction: ArxVector3 = { x: 0, y: 0, z: 0 }

    for (const snapped of axes) {
      if (snapped !== 'y') {
        correction[snapped] = point[snapped] - probe[snapped]
      }
    }

    // a snap that moves the selection far on the canvas is not a snap: it would undo the drag (the floor edge a lift
    // runs into was one), so the jump is capped like the one of the plane snap
    const movedScreen = screenOf(
      arxVector3toVector3({
        x: probe.x + correction.x,
        y: probe.y + correction.y,
        z: probe.z + correction.z,
      }).sub(offset),
    )

    if (movedScreen === undefined) {
      return undefined
    }

    if (screenDistance(screen, movedScreen) > SNAP_THRESHOLD_PX) {
      return undefined
    }

    // the edge the drag is moving towards wins over the one it is sliding along: the sliding edge has a correction
    // across the drag, so its along part is zero, and it would hide the crossing edge forever
    const alongX = (point.x - probe.x) * dragDirection.x
    const alongY = (point.y - probe.y) * dragDirection.y
    const alongZ = (point.z - probe.z) * dragDirection.z
    const along = Math.abs(alongX + alongY + alongZ)

    return { target, point, probe, distance, along, correction }
  }

  return {
    snap: (translation: ArxVector3, axis: string | null | undefined): EdgeSnapResult => {
      const axes = snapAxesOf(axis)
      const correction: ArxVector3 = { x: 0, y: 0, z: 0 }

      if (axes.length === 0 || sources.length === 0) {
        hide()

        return { correction }
      }

      camera.updateMatrixWorld()

      // the rail aligns edges in the plan: a vertical-only drag has nothing for it to correct, and the snap it would
      // add would pull the face back down on every edge the lift sweeps past (the case of 2026-11-21)
      const horizontal = axes.filter((candidate) => {
        return candidate !== 'y'
      })

      if (horizontal.length === 0) {
        hide()

        return { correction }
      }

      const parallel = Math.cos(MathUtils.degToRad(PARALLEL_TOLERANCE_DEGREES))
      const dragAxis = axes[0]

      if (dragAxis === undefined) {
        hide()

        return { correction }
      }

      const dragDirection = axisDirectionOf(dragAxis)
      let best: EdgeCandidate | undefined

      for (const source of sources) {
        const current: GameEdge = {
          a: {
            x: source.a.x + translation.x,
            y: source.a.y + translation.y,
            z: source.a.z + translation.z,
          },
          b: {
            x: source.b.x + translation.x,
            y: source.b.y + translation.y,
            z: source.b.z + translation.z,
          },
        }
        const direction = directionOf(current)

        if (direction === undefined) {
          continue
        }

        // the midpoint and the two ends: a face in the middle of a hole may be near the target edge with an end, while
        // the middle of its edge is past the end of the target
        const probes = [midpointOf(current), current.a, current.b]

        for (const probe of probes) {
          const screen = screenOf(arxVector3toVector3(probe).sub(offset))

          if (screen === undefined) {
            continue
          }

          for (const cell of cellsAround(probe)) {
            const list = grid.get(cell)

            if (list === undefined) {
              continue
            }

            for (const target of list) {
              const candidate = candidateOf(probe, screen, target, direction, parallel, dragDirection, axes)

              if (candidate === undefined) {
                continue
              }

              if (
                best === undefined ||
                candidate.along > best.along + 1e-6 ||
                (Math.abs(candidate.along - best.along) <= 1e-6 && candidate.distance < best.distance)
              ) {
                best = candidate
              }
            }
          }
        }
      }

      if (best === undefined) {
        hide()

        return { correction }
      }

      correction.x = best.correction.x
      correction.y = best.correction.y
      correction.z = best.correction.z

      const worldA = arxVector3toVector3(best.target.a).sub(offset)
      const worldB = arxVector3toVector3(best.target.b).sub(offset)

      attribute.setXYZ(0, worldA.x, worldA.y, worldA.z)
      attribute.setXYZ(1, worldB.x, worldB.y, worldB.z)
      attribute.needsUpdate = true
      line.visible = true

      return { correction, target: { a: best.target.a, b: best.target.b }, distance: best.distance }
    },
    hide,
    dispose: (): void => {
      scene.remove(line)
      geometry.dispose()
      material.dispose()
    },
  }
}
