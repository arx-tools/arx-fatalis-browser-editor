import type { ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, Points, PointsMaterial, Vector3, type Camera, type Scene } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { nearestSnapPairs, SNAP_THRESHOLD_PX, snapAxesOf, type ScreenPoint, type SnapPair } from '../shared/snapping.ts'

/**
 * How far the vertices of the level are collected into one cell of the grid of the snap, in the units of the level.
 *
 * @remarks
 * The grid is what keeps a drag cheap: only the cells around a corner of the selection are walked, not every vertex of
 * the level. A cell of 100 units holds the corners of a few walls, and the search reaches a few cells around the drag.
 */
const CELL_SIZE = 100

/**
 * How many cells the search walks around a corner, on every axis.
 *
 * @remarks
 * A vertex 12 pixels away on the canvas is a few hundred units away in a big level, so the search is wider than one
 * cell: three cells in every direction reach the wall the author aims at, and stop before the whole level is walked.
 */
const SEARCH_CELLS = 3

/**
 * A vertex of the level the drag may snap to.
 */
type SnapTarget = {
  /**
   * The position of the vertex in the coordinates of the level.
   */
  readonly position: ArxVector3
  /**
   * The same position in the scene of the mesh.
   */
  readonly world: Vector3
}

/**
 * The corners of the selection as one frame shows them.
 */
type CornerProjection = {
  /**
   * The screen points of the corners the camera sees.
   */
  readonly screens: ScreenPoint[]
  /**
   * The index of each projected corner in the list of the corners.
   */
  readonly indexes: number[]
}

/**
 * What a frame of the snap says.
 */
export type VertexSnapResult = {
  /**
   * The offset to add to the tentative translation, on the axes of the drag.
   */
  readonly correction: ArxVector3
  /**
   * The vertex the selection snapped to, when there is one.
   */
  readonly target?: ArxVector3
  /**
   * How far the vertex and the corner were on the canvas, when there is a target.
   */
  readonly distance?: number
}

/**
 * The snap of a drag to the vertices of the level.
 */
export type VertexSnap = {
  /**
   * Reads the closest corner-to-vertex pair of a frame.
   *
   * @param translation The translation the drag has taken so far, in the coordinates of the level.
   * @param axis The handle of the gizmo, like `X` or `XZ`.
   *
   * @returns The correction on the axes of the drag, and the vertex it snaps to.
   */
  readonly snap: (translation: ArxVector3, axis: string | null | undefined) => VertexSnapResult
  /**
   * Hides the marker of the snap.
   */
  readonly hide: () => void
  /**
   * Frees the marker and its grid.
   */
  readonly dispose: () => void
}

/**
 * The cell a position falls in, as a key of the grid.
 *
 * @param position The position in the coordinates of the level.
 *
 * @returns The key of its cell.
 */
function cellKeyOf(position: ArxVector3): string {
  return `${String(Math.floor(position.x / CELL_SIZE))},${String(Math.floor(position.y / CELL_SIZE))},${String(Math.floor(position.z / CELL_SIZE))}`
}

/**
 * A key that tells two vertices at the same place apart, without the cost of a float string.
 *
 * @param position The position in the coordinates of the level.
 *
 * @returns The key of the place, at a tenth of a unit.
 */
function placeKeyOf(position: ArxVector3): string {
  return `${String(Math.round(position.x * 10))},${String(Math.round(position.y * 10))},${String(Math.round(position.z * 10))}`
}

/**
 * Reads the corners of the selected faces, without the repeats.
 *
 * @param map The level of the selection.
 * @param faces The indices of the selected faces.
 *
 * @returns The positions of the corners, in the coordinates of the level.
 */
function cornersOf(map: ArxMap, faces: readonly number[]): ArxVector3[] {
  const corners: ArxVector3[] = []
  const seen = new Set<string>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    let count = 3

    if (isQuad(polygon)) {
      count = 4
    }

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      const source = polygon.vertices[vertex]

      if (source === undefined) {
        continue
      }

      const position = { x: source.x, y: source.y, z: source.z }
      const key = placeKeyOf(position)

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      corners.push(position)
    }
  }

  return corners
}

/**
 * Collects the vertices of the level the selection may snap to.
 *
 * @remarks
 * The faces of the selection are left out: a corner snapping to a vertex of the thing it is a part of would pull the
 * selection onto itself. A vertex shared by a selected and an unselected face is still there from the unselected one,
 * which is the vertex the author sees at the edge of the selection.
 *
 * @param map The level.
 * @param faces The selected faces.
 *
 * @returns The grid of the cells the vertices are in.
 */
function targetsOf(
  map: ArxMap,
  faces: readonly number[],
): {
  readonly grid: ReadonlyMap<string, readonly SnapTarget[]>
} {
  const selected = new Set(
    faces.map((index) => {
      return map.polygons[index]
    }),
  )
  const offset = arxVector3toVector3(map.scenePosition)
  const grid = new Map<string, SnapTarget[]>()
  const seen = new Set<string>()

  for (const polygon of map.polygons) {
    if (selected.has(polygon) || map.isHidden(polygon)) {
      continue
    }

    let count = 3

    if (isQuad(polygon)) {
      count = 4
    }

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      const source = polygon.vertices[vertex]

      if (source === undefined) {
        continue
      }

      const position = { x: source.x, y: source.y, z: source.z }
      const key = placeKeyOf(position)

      if (seen.has(key)) {
        continue
      }

      seen.add(key)

      const target: SnapTarget = {
        position,
        world: arxVector3toVector3(position).sub(offset),
      }
      const cell = cellKeyOf(position)
      const list = grid.get(cell)

      if (list === undefined) {
        grid.set(cell, [target])
      } else {
        list.push(target)
      }
    }
  }

  return { grid }
}

/**
 * The cells of the grid around a position.
 *
 * @param position The position in the coordinates of the level.
 *
 * @returns The keys of the cells the search walks.
 */
function cellsAround(position: ArxVector3): string[] {
  const [cellX, cellY, cellZ] = cellKeyOf(position).split(',').map(Number)
  const cells: string[] = []

  for (let x = (cellX ?? 0) - SEARCH_CELLS; x <= (cellX ?? 0) + SEARCH_CELLS; x = x + 1) {
    for (let y = (cellY ?? 0) - SEARCH_CELLS; y <= (cellY ?? 0) + SEARCH_CELLS; y = y + 1) {
      for (let z = (cellZ ?? 0) - SEARCH_CELLS; z <= (cellZ ?? 0) + SEARCH_CELLS; z = z + 1) {
        cells.push(`${String(x)},${String(y)},${String(z)}`)
      }
    }
  }

  return cells
}

/**
 * The vertices of the level a set of corners can reach.
 *
 * @param corners The corners of the selection, in the coordinates of the level.
 * @param translation The translation of the drag, in the coordinates of the level.
 * @param grid The grid of the vertices.
 *
 * @returns The vertices of the cells around the corners, without the repeats.
 */
function candidatesOf(
  corners: readonly ArxVector3[],
  translation: ArxVector3,
  grid: ReadonlyMap<string, readonly SnapTarget[]>,
): SnapTarget[] {
  const candidates = new Set<SnapTarget>()

  for (const corner of corners) {
    const position = {
      x: corner.x + translation.x,
      y: corner.y + translation.y,
      z: corner.z + translation.z,
    }

    for (const cell of cellsAround(position)) {
      const list = grid.get(cell)

      if (list === undefined) {
        continue
      }

      for (const target of list) {
        candidates.add(target)
      }
    }
  }

  return [...candidates]
}

/**
 * What the snap of a drag reads from the view.
 */
export type VertexSnapOptions = {
  /**
   * The camera of the view, for the screen-space threshold.
   */
  readonly camera: Camera
  /**
   * The canvas the view draws on, for the pixels of the threshold.
   */
  readonly canvas: HTMLCanvasElement
  /**
   * The scene the marker of the snap goes into.
   */
  readonly scene: Scene
}

/**
 * Builds the snap of a translate drag to the vertices of the level.
 *
 * @remarks
 * The corners and the vertices are collected **once**, when the drag starts: the level does not change while the
 * selection moves, and the grid is what makes a frame of the drag cheap. The marker is a small point in the scene of
 * the level, over the geometry, so the author sees the vertex the selection is about to take.
 *
 * The snap corrects only the axes of the handle of the gizmo (see `snapAxesOf`): a drag along the game's Z keeps the X
 * and Y the author chose. The threshold is a distance on the canvas, so the same gesture snaps at every zoom.
 *
 * @param map The level of the selection.
 * @param faces The selected faces.
 * @param options The camera, the canvas and the scene of the view.
 *
 * @returns The snap of the drag.
 */
export function createVertexSnap(map: ArxMap, faces: readonly number[], options: VertexSnapOptions): VertexSnap {
  const { camera, canvas, scene } = options
  const corners = cornersOf(map, faces)
  const { grid } = targetsOf(map, faces)
  const markerGeometry = new BufferGeometry()
  const markerAttribute = new BufferAttribute(new Float32Array(Math.max(1, corners.length) * 3), 3)

  markerGeometry.setAttribute('position', markerAttribute)

  const markerMaterial = new PointsMaterial({
    color: 0xff_d5_4a,
    size: 12,
    sizeAttenuation: false,
    depthTest: false,
    transparent: true,
  })
  const marker = new Points(markerGeometry, markerMaterial)

  marker.renderOrder = 1002
  marker.visible = false
  marker.frustumCulled = false
  scene.add(marker)

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
   * Hides the marker.
   */
  function hide(): void {
    marker.visible = false
  }

  /**
   * Projects the corners of the selection.
   *
   * @param translation The translation of the drag, in the coordinates of the level.
   *
   * @returns The screen points, and the indices of the corners.
   */
  function cornersOnScreenOf(translation: ArxVector3): CornerProjection {
    const offset = arxVector3toVector3(map.scenePosition)
    const sceneTranslation = arxVector3toVector3(translation)
    const screens: ScreenPoint[] = []
    const indexes: number[] = []

    for (const [index, corner] of corners.entries()) {
      const world = arxVector3toVector3(corner).add(sceneTranslation).sub(offset)
      const screen = screenOf(world)

      if (screen === undefined) {
        continue
      }

      screens.push(screen)
      indexes.push(index)
    }

    return { screens, indexes }
  }

  /**
   * Projects the vertices the drag can reach.
   *
   * @param candidates The vertices of the cells around the corners.
   *
   * @returns The screen points, and the vertices they belong to.
   */
  function targetsOnScreenOf(candidates: readonly SnapTarget[]): {
    readonly screens: ScreenPoint[]
    readonly targets: SnapTarget[]
  } {
    const screens: ScreenPoint[] = []
    const targets: SnapTarget[] = []

    for (const target of candidates) {
      const screen = screenOf(target.world)

      if (screen === undefined) {
        continue
      }

      screens.push(screen)
      targets.push(target)
    }

    return { screens, targets }
  }

  /**
   * Moves the marker to every vertex the pairs name.
   *
   * @param pairs The closest vertex of every corner.
   * @param targetList The vertices the pairs index.
   *
   * @returns How many markers were written.
   */
  function markTargetsOf(pairs: readonly SnapPair[], targetList: readonly SnapTarget[]): number {
    const marked = new Set<SnapTarget>()
    let count = 0

    for (const pair of pairs) {
      const target = targetList[pair.target]

      if (target === undefined || marked.has(target)) {
        continue
      }

      marked.add(target)
      markerAttribute.setXYZ(count, target.world.x, target.world.y, target.world.z)
      count = count + 1
    }

    return count
  }

  return {
    snap: (translation: ArxVector3, axis: string | null | undefined): VertexSnapResult => {
      const axes = snapAxesOf(axis)
      const correction: ArxVector3 = { x: 0, y: 0, z: 0 }

      if (axes.length === 0 || corners.length === 0) {
        hide()

        return { correction }
      }

      camera.updateMatrixWorld()

      const cornerProjection = cornersOnScreenOf(translation)

      if (cornerProjection.screens.length === 0) {
        hide()

        return { correction }
      }

      const candidates = candidatesOf(corners, translation, grid)
      const targetProjection = targetsOnScreenOf(candidates)

      const pairs = nearestSnapPairs(cornerProjection.screens, targetProjection.screens, SNAP_THRESHOLD_PX)

      if (pairs.length === 0) {
        hide()

        return { correction }
      }

      const best = pairs.toSorted((one, other) => {
        return one.distance - other.distance
      })[0]

      if (best === undefined) {
        hide()

        return { correction }
      }

      const corner = corners[cornerProjection.indexes[best.corner] ?? -1]
      const target = targetProjection.targets[best.target]

      if (corner === undefined || target === undefined) {
        hide()

        return { correction }
      }

      for (const snapped of axes) {
        correction[snapped] = target.position[snapped] - (corner[snapped] + translation[snapped])
      }

      const count = markTargetsOf(pairs, targetProjection.targets)

      markerGeometry.setDrawRange(0, count)
      markerAttribute.needsUpdate = true
      marker.visible = count > 0

      return { correction, target: target.position, distance: best.distance }
    },
    hide,
    dispose: (): void => {
      scene.remove(marker)
      markerGeometry.dispose()
      markerMaterial.dispose()
    },
  }
}
