import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  type Intersection,
  type Mesh as ThreeMesh,
  type PerspectiveCamera,
  type Scene,
  type Vector3,
} from 'three'
import { Color } from '../../../../generator/Color.ts'
import type { SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import {
  isTouchingVertices,
  polygonFillTriangles,
  polygonPerimeter,
  polygonOfTriangle,
} from '../../../../generator/polygons.ts'

/**
 * Reads the polygon of one intersection.
 *
 * @param hit The intersection the raycast reported.
 * @param meshes The meshes of the level, in the order the triangle map was built with.
 * @param triangleToPolygon The triangle map of the level.
 *
 * @returns The polygon index, or `undefined` when the hit is not on a face of the map.
 */
function polygonOfHit(
  hit: Intersection,
  meshes: readonly ThreeMesh[],
  triangleToPolygon: readonly number[],
): number | undefined {
  const { face } = hit

  if (face === null || face === undefined || typeof face.a !== 'number') {
    return undefined
  }

  // the level is more than one mesh (the invisible walls have their own), and the triangle map runs over
  // all of them in the same order: the triangles of the meshes before the hit one come first
  let offset = 0

  for (const mesh of meshes) {
    if (mesh === hit.object) {
      break
    }

    const triangles = mesh.geometry.getAttribute('position').count / 3
    offset = offset + triangles
  }

  // NOT `hit.faceIndex`: the BVH the level puts on its geometry reorders the triangles to keep the tree
  // tight, so the index the intersection reports follows the reordered buffer, not the order the geometry
  // was built in (measured on the level: faceIndex 104200 for the triangle 99413). `face.a` is a real
  // vertex, and the geometry is not indexed, so every triangle owns three vertices of its own: the first
  // one divided by three is the triangle's original index.
  return polygonOfTriangle(triangleToPolygon, offset + Math.trunc(face.a / 3))
}

/**
 * Reads the polygons the camera looks at, nearest first.
 *
 * @remarks
 * The ray of the level can cross more than one face: a drag wants the nearest few of them, so a face that
 * does not touch the selection does not hide the one that does. The list holds every face once, in the
 * order the ray meets them.
 *
 * @param camera The camera of the walkable view.
 * @param meshes The meshes of the level in this view.
 * @param triangleToPolygon The triangle map of the level.
 * @param limit How many faces to read at most.
 *
 * @returns The polygon indices, nearest first.
 */
export function pickPolygons(
  camera: PerspectiveCamera,
  meshes: readonly ThreeMesh[],
  triangleToPolygon: readonly number[],
  limit = 1,
): number[] {
  camera.updateMatrixWorld()

  const raycaster = new Raycaster()
  // the range of the camera, not a generous one: a polygon beyond the far plane is not drawn, so picking
  // it would outline a surface that is not on the screen
  raycaster.near = camera.near
  raycaster.far = camera.far
  raycaster.setFromCamera(new Vector2(0, 0), camera)

  const polygons: number[] = []

  for (const hit of raycaster.intersectObjects([...meshes], false)) {
    const polygon = polygonOfHit(hit, meshes, triangleToPolygon)

    if (polygon === undefined || polygons.includes(polygon)) {
      continue
    }

    polygons.push(polygon)

    if (polygons.length >= limit) {
      break
    }
  }

  return polygons
}

/**
 * Reads the polygon the camera looks at, in the middle of its view.
 *
 * @remarks
 * The ray goes through the middle of the canvas, which is where the crosshair of the walkable view is.
 * Only the faces turned towards the camera can be hit: the material of the level is front side only, and
 * three skips the faces turned away, so a back face can not be selected (the archived editor only fell back
 * to them when nothing visible was under the crosshair; this one does not).
 *
 * @param camera The camera of the walkable view.
 * @param meshes The meshes of the level in this view.
 * @param triangleToPolygon The triangle map of the level.
 *
 * @returns The polygon index, or `undefined` when the ray hits nothing.
 */
export function pickPolygon(
  camera: PerspectiveCamera,
  meshes: readonly ThreeMesh[],
  triangleToPolygon: readonly number[],
): number | undefined {
  return pickPolygons(camera, meshes, triangleToPolygon)[0]
}

/**
 * The outline of the polygon under the crosshair, and the fill of the selected ones.
 *
 * @remarks
 * Both are built from the source polygons, not from the render mesh: the outline walks the perimeter of the
 * whole quad (not the two triangles), and the fill covers exactly the triangles the polygon was split into.
 * The outline is green, and red while the click would take the polygon away; the fill is a translucent
 * yellow, drawn over the level (`renderOrder` 7) and without depth writes, so it does not fight the mesh.
 */
export interface PolygonSelectionOverlay {
  /**
   * Shows the polygon under the crosshair, or hides the outline.
   *
   * @param polygon The polygon to outline, or `undefined` for none.
   * @param mode The mode of the click that is about to happen; it colours the outline.
   */
  readonly setCursor: (polygon: ArxPolygon | undefined, mode: SelectionMode) => void
  /**
   * Shows the fill of the selected polygons.
   *
   * @param polygons The selected polygons, in any order.
   */
  readonly setHighlight: (polygons: readonly ArxPolygon[]) => void
  /**
   * Takes both overlays out of the scene and frees their geometry and material.
   */
  readonly dispose: () => void
}

/**
 * Wraps a list of points into a geometry.
 *
 * @param positions The coordinates, three per point.
 *
 * @returns The geometry, with its position attribute.
 */
function positionsToGeometry(positions: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  return geometry
}

/**
 * The vertices of a polygon in the space of the meshes.
 *
 * @param polygon The polygon to read.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The vertices, in the order the polygon stores them.
 */
function polygonVertices(polygon: ArxPolygon, offset: Vector3): Vector3[] {
  return polygon.vertices.map((vertex) => {
    return arxVector3toVector3(vertex).sub(offset)
  })
}

/**
 * Builds the outline of a polygon: its perimeter, as segments.
 *
 * @param polygon The polygon to outline.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The segments, ready for a `LineSegments`.
 */
export function polygonOutlineGeometry(polygon: ArxPolygon, offset: Vector3): BufferGeometry {
  const vertices = polygonVertices(polygon, offset)
  const perimeter = polygonPerimeter(polygon)
  const positions: number[] = []

  for (let index = 0; index < perimeter.length; index++) {
    const from = vertices[perimeter[index]]
    const to = vertices[perimeter[(index + 1) % perimeter.length]]

    positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
  }

  return positionsToGeometry(positions)
}

/**
 * Builds the fill of a set of polygons: their triangles, as one geometry.
 *
 * @param polygons The polygons to fill.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The triangles, ready for a `Mesh`.
 */
export function polygonFillGeometry(polygons: readonly ArxPolygon[], offset: Vector3): BufferGeometry {
  const positions: number[] = []

  for (const polygon of polygons) {
    const vertices = polygonVertices(polygon, offset)

    for (const [a, b, c] of polygonFillTriangles(polygon)) {
      const first = vertices[a]
      const second = vertices[b]
      const third = vertices[c]

      positions.push(first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z)
    }
  }

  return positionsToGeometry(positions)
}

/**
 * Builds the overlay of the walkable view.
 *
 * @param scene The scene of the widget.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The overlay, with nothing shown yet.
 */
export function createPolygonSelectionOverlay(scene: Scene, offset: Vector3): PolygonSelectionOverlay {
  // the outline lies on the surface of the polygon it outlines, exactly where the mesh is: without turning
  // the depth test off the two fight for the same pixels and the line mostly loses. It is safe to draw it
  // over everything, because the pick always takes the nearest face, so the outline never belongs to a
  // polygon behind a wall.
  //
  // `transparent` with a full opacity is not about blending: three draws the transparent objects after the
  // opaque ones, and the fill of the selection is transparent, so this is what puts the outline over the
  // fill (its `renderOrder` is the highest of the three: above the fill and above the wireframe)
  const outlineMaterial = new LineBasicMaterial({
    color: Color.green.getHex(),
    depthTest: false,
    transparent: true,
  })
  const outline = new LineSegments(new BufferGeometry(), outlineMaterial)
  outline.renderOrder = 9
  // the geometry of the outline is replaced on every frame, and the frustum check of three works on a
  // bounding sphere that such a geometry only gets on demand: it is cheaper to skip the check than to
  // rebuild the sphere for a handful of points
  outline.frustumCulled = false

  // the fill lies on the surface of the selected polygons, exactly where the mesh is, so it needs the
  // polygon offset: without it the two fight for the same pixels and the fill mostly loses. The offset
  // keeps the depth test on, so a selection behind a wall stays hidden.
  const fillMaterial = new MeshBasicMaterial({
    color: Color.yellow.getHex(),
    side: 2,
    transparent: true,
    opacity: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  })
  const fill = new Mesh(new BufferGeometry(), fillMaterial)
  fill.renderOrder = 7
  fill.frustumCulled = false

  /**
   * Outlines the polygon under the crosshair.
   *
   * @param polygon The polygon to show.
   */
  function showCursor(polygon: ArxPolygon): void {
    outline.geometry.dispose()
    outline.geometry = polygonOutlineGeometry(polygon, offset)

    if (!outline.parent) {
      scene.add(outline)
    }
  }

  return {
    setCursor: (polygon: ArxPolygon | undefined, mode: SelectionMode): void => {
      if (polygon === undefined) {
        scene.remove(outline)

        return
      }

      showCursor(polygon)

      let colour = Color.green.getHex()

      if (mode === 'remove') {
        colour = Color.red.getHex()
      }

      outlineMaterial.color.set(colour)
    },
    setHighlight: (polygons: readonly ArxPolygon[]): void => {
      fill.geometry.dispose()
      fill.geometry = polygonFillGeometry(polygons, offset)
      if (polygons.length === 0) {
        scene.remove(fill)

        return
      }

      if (!fill.parent) {
        scene.add(fill)
      }
    },
    dispose: (): void => {
      scene.remove(outline)
      scene.remove(fill)
      outline.geometry.dispose()
      fill.geometry.dispose()
      outlineMaterial.dispose()
      fillMaterial.dispose()
    },
  }
}

/**
 * What a running drag has to decide on: the faces under the ray, and the state of the gesture.
 */
export interface DragSweep {
  /**
   * The faces under the ray, nearest first.
   */
  readonly candidates: readonly number[]
  /**
   * The polygons of the level.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The faces the selection holds already.
   */
  readonly selected: ReadonlySet<number>
  /**
   * The vertices of the faces the drag has taken so far.
   */
  readonly vertices: readonly ArxVector3[]
  /**
   * What the drag does.
   */
  readonly mode: SelectionMode
}

/**
 * What the walk over the faces of the ray found.
 *
 * @remarks
 * The two are told apart because a face the selection **already holds** stops the walk (it hides what is behind
 * it) but must not end the drag: the caller takes its vertices, so the next face beyond it can join the sweep.
 */
export type SweepResult = { kind: 'take'; index: number } | { kind: 'cross'; index: number }

/**
 * The face a running drag takes from the ray.
 *
 * @remarks
 * The walk goes down the ray, nearest first, and stops at the first face that decides the gesture. A face the
 * selection **already holds** stops it with `cross`: that face is in front of whatever lies behind it, so
 * nothing behind it may be taken — but the drag goes on from there (the caller remembers the vertices of the
 * crossed face, so the pencil continues on the other side, the way it would on paper). Otherwise a face joins
 * only when it **touches** the ones the drag has taken so far: a nearer face that does not would hide the one
 * that does (the overlapping polygons of level 8 are the case that shows it), and a face from the other side of
 * the level must not come along. A face that touches nothing is not taken at all, so a drag stops at the
 * islands instead of painting them. With no vertices yet (the first face of a gesture) the touching rule
 * accepts anything, so a click takes what the crosshair is on. `remove` takes the nearest face of all: taking
 * something away does not need a neighbour, and a face the selection holds is exactly the one to take.
 *
 * @param sweep The faces of the ray and the state of the gesture.
 *
 * @returns The face to take or the one the walk ran into, or `undefined` when no face decides the gesture.
 */
export function faceToSweep(sweep: DragSweep): SweepResult | undefined {
  for (const index of sweep.candidates) {
    const polygon = sweep.polygons[index]

    if (polygon === undefined) {
      continue
    }

    if (sweep.mode === 'remove') {
      return { kind: 'take', index }
    }

    if (sweep.selected.has(index)) {
      return { kind: 'cross', index }
    }

    if (isTouchingVertices(polygon, sweep.vertices)) {
      return { kind: 'take', index }
    }
  }

  return undefined
}
