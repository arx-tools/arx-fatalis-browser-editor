import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Color as ThreeColor,
  FrontSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  Raycaster,
  Vector2,
  type Intersection,
  type Mesh as ThreeMesh,
  type OrthographicCamera,
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

  // the triangles of the meshes before the hit one come first: the map runs over every mesh in the same order
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
 * The middle of the view, in normalised device coordinates: where the crosshair of the walkable view is.
 */
const MIDDLE = new Vector2(0, 0)

/**
 * What a pick of the polygons reads.
 */
interface PickRequest {
  /**
   * The camera of the view.
   */
  readonly camera: PerspectiveCamera | OrthographicCamera
  /**
   * The point of the view, in normalised device coordinates.
   */
  readonly point: Vector2
  /**
   * The meshes of the level in this view.
   */
  readonly meshes: readonly ThreeMesh[]
  /**
   * The triangle map of the level.
   */
  readonly triangleToPolygon: readonly number[]
  /**
   * How many faces to read at most.
   */
  readonly limit: number
}

/**
 * Reads the polygons under a point of a view, nearest first.
 *
 * @param request The camera, the point, the meshes and the limit of the pick.
 *
 * @returns The polygon indices, nearest first.
 */
function pickPolygonsFrom(request: PickRequest): number[] {
  const { camera, point, meshes, triangleToPolygon, limit } = request

  camera.updateMatrixWorld()

  const raycaster = new Raycaster()
  // the range of the camera, not a generous one: a polygon beyond the far plane is not drawn, so picking
  // it would outline a surface that is not on the screen
  raycaster.near = camera.near
  raycaster.far = camera.far
  // the first face the ray meets is the answer: the tree stops at it instead of reading every face along the ray
  raycaster.firstHitOnly = true
  raycaster.setFromCamera(point, camera)

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
  return pickPolygonsFrom({ camera, point: MIDDLE, meshes, triangleToPolygon, limit })
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
 * Reads the polygon under a point of a view.
 *
 * @remarks
 * The fixed views read the level with an orthographic camera, and the point is the normalised device coordinate of the
 * pointer: the middle is `(0, 0)`, the top left corner `(-1, 1)`. Only the faces turned towards the camera can be hit,
 * the same way the crosshair of the walkable view reads them.
 *
 * @param camera The camera of the view.
 * @param point The point of the view, in normalised device coordinates.
 * @param meshes The meshes of the level in this view.
 * @param triangleToPolygon The triangle map of the level.
 *
 * @returns The polygon index, or `undefined` when the ray hits nothing.
 */
export function pickPolygonAt(
  camera: PerspectiveCamera | OrthographicCamera,
  point: Vector2,
  meshes: readonly ThreeMesh[],
  triangleToPolygon: readonly number[],
): number | undefined {
  return pickPolygonsFrom({ camera, point, meshes, triangleToPolygon, limit: 1 })[0]
}

/**
 * How much of the colour of its room a face keeps under the yellow.
 *
 * @remarks
 * A room map painted over with a solid yellow turned every selected room into one patch, so the author could not tell
 * where one room ends and the next one begins (three rooms in one selection, level 11). A hint of the colour of the room
 * keeps the rooms apart under the mark, and a face without a room stays the plain yellow, because it has no colour of
 * its own to keep.
 */
const TINT_OF_ROOM = 0.6

/**
 * How much of the yellow the fill of the faces turned towards the camera paints.
 */
const FILL_OPACITY = 0.35

/**
 * How much of the yellow the fill paints while the grey base is under it.
 *
 * @remarks
 * On the room map there is no art to keep: the base has already taken the colour of the room away, so the yellow can
 * be the mark itself instead of a tint over a colour, which read as a dull olive.
 */
const FILL_ON_MAP_OPACITY = 0.85

/**
 * The colour of the base the fill gets while the room map is on.
 *
 * @remarks
 * The room map paints every face with the colour of its room, and a translucent yellow over a blue room read as green:
 * the same selection looked different in every room. The grey base hides the room colour under the yellow, so the mark
 * of the selection is one colour on the map as it is on the level. It is a dark neutral of the palette, so it is not
 * mistaken for the grey of the map that says "this face has no room".
 */
const BACKDROP_COLOR = '#4a4f57'

/**
 * How much of the grey the base paints: nearly opaque, which is the point of it (the room colour must stay out of the
 * yellow, a hint of it would be enough to tint the mix again).
 */
const BACKDROP_OPACITY = 0.92

/**
 * The outline of the polygon under the crosshair, and the fill of the selected ones.
 *
 * @remarks
 * Both are built from the source polygons, not from the render mesh: the outline walks the perimeter of the
 * whole quad (not the two triangles), and the fill covers exactly the triangles the polygon was split into.
 * The outline is green, and red while the click would take the polygon away; the fill is a translucent
 * yellow, drawn over the level (`renderOrder` 7) and without depth writes, so it does not fight the mesh.
 *
 * The fill is **front side only**, like the material of the level (2026-11-10, the owner): the faces turned away from
 * the camera are not painted, so the yellow always means "this is selected and this is what I see". A selected face
 * turned away (the other side of a wall, the ceiling above the camera) is in the selection and is deleted with it, and
 * the panels count it; painting it would turn the selection into two colours and would read as if the surfaces in
 * front of the camera were selected.
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
   * @param tintOf The colour of the room of a face, which the mark keeps a hint of, or `undefined` for a face without a
   * room (and for every face while the level is not coloured).
   */
  readonly setHighlight: (polygons: readonly ArxPolygon[], tintOf?: (polygon: ArxPolygon) => string | undefined) => void
  /**
   * Draws a grey base under the fill, or takes it away.
   *
   * @remarks
   * The base belongs to the room map: with the map off the fill lies on the art of the level, and a base would hide it.
   *
   * @param visible Whether the grey base is drawn.
   */
  readonly setBackdrop: (visible: boolean) => void
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
 * @param tintOf The colour of the room of a face, which the mark keeps a hint of, or `undefined` for every face (and
 * for a face without a room).
 *
 * @returns The triangles, ready for a `Mesh`.
 */
export function polygonFillGeometry(
  polygons: readonly ArxPolygon[],
  offset: Vector3,
  tintOf?: (polygon: ArxPolygon) => string | undefined,
): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const yellow = new ThreeColor(Color.yellow.getHex())

  for (const polygon of polygons) {
    const vertices = polygonVertices(polygon, offset)
    // the game gives one normal for the first two corners and another for the last two when the polygon is curved,
    // the way the level builds its own geometry: the corner normals are what makes the base under the fill shade like
    // the surfaces it covers (a flat normal would paint the beams of a ceiling away)
    const cornerNormals = (polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]).map(
      (normal) => {
        return arxVector3toVector3(normal)
      },
    )

    for (const [a, b, c] of polygonFillTriangles(polygon)) {
      const first = vertices[a]
      const second = vertices[b]
      const third = vertices[c]

      positions.push(first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z)
      normals.push(
        cornerNormals[a].x,
        cornerNormals[a].y,
        cornerNormals[a].z,
        cornerNormals[b].x,
        cornerNormals[b].y,
        cornerNormals[b].z,
        cornerNormals[c].x,
        cornerNormals[c].y,
        cornerNormals[c].z,
      )

      // the mark of the face: the yellow, with a hint of the colour of its room. A face the file never put into a room
      // has no colour of its own, so it keeps the plain yellow
      let room: string | undefined

      if (polygon.room >= 0) {
        room = tintOf?.(polygon)
      }

      let mark = yellow

      if (room !== undefined) {
        mark = yellow.clone().lerp(new ThreeColor(room), TINT_OF_ROOM)
      }

      for (let vertex = 0; vertex < 3; vertex++) {
        colors.push(mark.r, mark.g, mark.b)
      }
    }
  }

  const geometry = positionsToGeometry(positions)
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))

  return geometry
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
  //
  // The fill is front side only, the way the material of the level draws its faces: a double sided fill painted a
  // face selected from behind the same as a face in front of the camera, and from above the room the back of the
  // ceiling covered the whole view, so the author read a floor as selected while the yellow came from above it.
  //
  // It is lit (`MeshLambertMaterial`): on the room map the yellow is nearly solid, and a flat colour swallowed the
  // beams and the corners of the room (2026-11-10, the owner). The lit yellow keeps the shading of the surfaces it
  // covers, so the mark is bright and the geometry still reads.
  const fillMaterial = new MeshLambertMaterial({
    color: Color.yellow.getHex(),
    vertexColors: true,
    side: FrontSide,
    transparent: true,
    opacity: FILL_OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  })
  const fill = new Mesh(new BufferGeometry(), fillMaterial)
  fill.renderOrder = 7
  fill.frustumCulled = false

  // the grey base sits just under the fill: the same geometry with a weaker polygon offset and a lower render order,
  // so the yellow is always the one on top
  // it is lit on purpose (`MeshLambertMaterial`, like the material of the room map): a flat grey hid the beams of a
  // ceiling and read as one colour, while the lit one keeps the shading of the surfaces and only takes their colour away
  const backdropMaterial = new MeshLambertMaterial({
    color: BACKDROP_COLOR,
    side: FrontSide,
    transparent: true,
    opacity: BACKDROP_OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  })
  const backdrop = new Mesh(new BufferGeometry(), backdropMaterial)
  backdrop.renderOrder = 6
  backdrop.frustumCulled = false

  let hasSelection = false
  let hasBackdrop = false

  /**
   * Puts a mesh of the highlight into the scene, or takes it out.
   *
   * @param mesh The mesh of the fill or of its base.
   * @param shown Whether it belongs to the scene now.
   */
  function put(mesh: Mesh, shown: boolean): void {
    if (shown) {
      if (!mesh.parent) {
        scene.add(mesh)
      }

      return
    }

    scene.remove(mesh)
  }

  /**
   * Follows the two states of the highlight: whether there is a selection, and whether the base is drawn.
   */
  function updateHighlight(): void {
    put(fill, hasSelection)
    put(backdrop, hasSelection && hasBackdrop)
  }

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
    setHighlight: (polygons: readonly ArxPolygon[], tintOf): void => {
      fill.geometry.dispose()

      const geometry = polygonFillGeometry(polygons, offset, tintOf)
      fill.geometry = geometry
      backdrop.geometry = geometry
      hasSelection = polygons.length > 0
      updateHighlight()
    },
    setBackdrop: (visible: boolean): void => {
      hasBackdrop = visible

      // the base under the fill means the room map: there the yellow is the mark itself, and on the level it stays a
      // tint that the art shows through
      if (visible) {
        fillMaterial.opacity = FILL_ON_MAP_OPACITY
      } else {
        fillMaterial.opacity = FILL_OPACITY
      }

      updateHighlight()
    },
    dispose: (): void => {
      scene.remove(outline)
      scene.remove(fill)
      scene.remove(backdrop)
      outline.geometry.dispose()
      fill.geometry.dispose()
      outlineMaterial.dispose()
      fillMaterial.dispose()
      backdropMaterial.dispose()
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
