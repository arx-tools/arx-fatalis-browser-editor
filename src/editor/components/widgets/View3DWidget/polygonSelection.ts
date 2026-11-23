import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Color as ThreeColor,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  Raycaster,
  Vector2,
  type Intersection,
  type Mesh as ThreeMesh,
  type OrthographicCamera,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type Side,
  type WebGLRenderer,
  type Vector3,
} from 'three'
import { Color } from '../../../../generator/Color.ts'
import type { SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import {
  isDoubleSided,
  isTouchingVertices,
  polygonFillTriangles,
  polygonOfTriangle,
} from '../../../../generator/polygons.ts'
import { createSelectionContour, type SelectionContour } from './selectionContour.ts'

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
 * The middle of the view, in normalized device coordinates: where the crosshair of the walkable view is.
 */
const MIDDLE = new Vector2(0, 0)

/**
 * What a pick of the polygons reads.
 */
type PickRequest = {
  /**
   * The camera of the view.
   */
  readonly camera: PerspectiveCamera | OrthographicCamera
  /**
   * The point of the view, in normalized device coordinates.
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
 * Only the faces turned toward the camera can be hit: the material of the level is front side only, and
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
 * The fixed views read the level with an orthographic camera, and the point is the normalized device coordinate of the
 * pointer: the middle is `(0, 0)`, the top left corner `(-1, 1)`. Only the faces turned toward the camera can be hit,
 * the same way the crosshair of the walkable view reads them.
 *
 * @param camera The camera of the view.
 * @param point The point of the view, in normalized device coordinates.
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
 * How much of the color of its room a face keeps under the yellow.
 *
 * @remarks
 * A room map painted over with a solid yellow turned every selected room into one patch, so the author could not tell
 * where one room ends and the next one begins (three rooms in one selection, level 11). A hint of the color of the room
 * keeps the rooms apart under the mark, and a face without a room stays the plain yellow, because it has no color of
 * its own to keep.
 */
const TINT_OF_ROOM = 0.6

/**
 * How much of the yellow the fill of the faces turned toward the camera paints.
 */
const FILL_OPACITY = 0.35

/**
 * How much of the yellow the fill paints while the gray base is under it.
 *
 * @remarks
 * On the room map there is no art to keep: the base has already taken the color of the room away, so the yellow can
 * be the mark itself instead of a tint over a color, which read as a dull olive.
 */
const FILL_ON_MAP_OPACITY = 0.85

/**
 * The color of the base the fill gets while the room map is on.
 *
 * @remarks
 * The room map paints every face with the color of its room, and a translucent yellow over a blue room read as green:
 * the same selection looked different in every room. The gray base hides the room color under the yellow, so the mark
 * of the selection is one color on the map as it is on the level. It is a dark neutral of the palette, so it is not
 * mistaken for the gray of the map that says "this face has no room".
 */
const BACKDROP_COLOR = '#4a4f57'

/**
 * How much of the gray the base paints: nearly opaque, which is the point of it (the room color must stay out of the
 * yellow, a hint of it would be enough to tint the mix again).
 */
const BACKDROP_OPACITY = 0.92

/**
 * The color of the fill of the faces of a **group**.
 *
 * @remarks
 * A group is a lock: its faces go into the group together and are taken out of it together, and the red mark says the
 * selection is a unit (2026-11-18, the owner: the green of the phantom is the add, the red of the fill is the unit). The
 * material of the fill stays yellow, so the two colors come from the vertices: yellow (1, 1, 0) carries red (1, 0, 0)
 * as it is, and the free faces keep the yellow.
 */
const GROUP_FILL_COLOR = new ThreeColor(Color.red.getHex())

/**
 * The outline of the polygon under the crosshair, and the fill of the selected ones.
 *
 * @remarks
 * Both are built from the source polygons, not from the render mesh: the outline walks the perimeter of the
 * whole quad (not the two triangles), and the fill covers exactly the triangles the polygon was split into.
 * The outline is green, and red while the click would take the polygon away; the fill is a translucent
 * yellow, drawn over the level (`renderOrder` 7) and without depth writes, so it does not fight the mesh.
 *
 * The fill is **front side only**, like the material of the level (2026-11-10, the owner): a face turned away from the
 * camera is in the selection and is deleted with it, and the panels count it, but painting it would turn the selection
 * into two colors and would read as if the surfaces in front of the camera were selected.
 *
 * The one exception is the face the level itself draws from both sides (`DoubleSided`): it is painted from both sides,
 * because the level shows it from both, and its mark would vanish exactly when the author walks around it (2026-11-14,
 * the owner; the 14549th face of level 12 is one, the banner of the cutscene room).
 */
export type PolygonSelectionOverlay = {
  /**
   * Shows the polygons under the crosshair, or hides the outline.
   *
   * @param polygons The polygons to outline (the face under the crosshair, or the whole group of it), or an empty list
   * for none.
   * @param mode The mode of the click that is about to happen; it colors the outline.
   */
  readonly setCursor: (polygons: readonly ArxPolygon[], mode: SelectionMode) => void
  /**
   * Draws the outline of the crosshair over the scene, when the view has a renderer to draw it with.
   *
   * @param camera The camera the scene was drawn with.
   */
  readonly renderCursor: (camera: Camera) => void
  /**
   * Shows the fill of the selected polygons.
   *
   * @param polygons The selected polygons, in any order.
   * @param tintOf The color of the room of a face, which the mark keeps a hint of, or `undefined` for a face without a
   * room (and for every face while the level is not colored).
   */
  readonly setHighlight: (
    polygons: readonly ArxPolygon[],
    tintOf?: (polygon: ArxPolygon) => string | undefined,
    inGroup?: (polygon: ArxPolygon) => boolean,
  ) => void
  /**
   * Draws a gray base under the fill, or takes it away.
   *
   * @remarks
   * The base belongs to the room map: with the map off the fill lies on the art of the level, and a base would hide it.
   *
   * @param visible Whether the gray base is drawn.
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
 * Builds the fill of a set of polygons: their triangles, as one geometry.
 *
 * @param polygons The polygons to fill.
 * @param offset The scene position of the level, already mirrored.
 * @param tintOf The color of the room of a face, which the mark keeps a hint of, or `undefined` for every face (and
 * for a face without a room).
 * @param baseOf The color of the mark of a face, or `undefined` for the yellow of the pick.
 *
 * @returns The triangles, ready for a `Mesh`.
 */
export function polygonFillGeometry(
  polygons: readonly ArxPolygon[],
  offset: Vector3,
  tintOf?: (polygon: ArxPolygon) => string | undefined,
  baseOf?: (polygon: ArxPolygon) => ThreeColor,
): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const yellow = new ThreeColor(Color.yellow.getHex())

  for (const polygon of polygons) {
    const base = baseOf?.(polygon) ?? yellow
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

      // the mark of the face: the yellow, with a hint of the color of its room. A face the file never put into a room
      // has no color of its own, so it keeps the plain yellow
      let room: string | undefined

      if (polygon.room >= 0) {
        room = tintOf?.(polygon)
      }

      let mark = base

      if (room !== undefined) {
        mark = base.clone().lerp(new ThreeColor(room), TINT_OF_ROOM)
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
 * The two halves of a selection: the faces the level draws from one side, and the ones it draws from both.
 *
 * @remarks
 * The fill of a face is painted on the sides the level paints it on, so the mark of the selection does not show a face
 * the level culls, and does not hide a face it shows from behind (2026-11-14, the owner). The order of the faces is
 * kept inside each half, so the geometry of a half is the one of the level.
 *
 * @param polygons The faces to split.
 *
 * @returns The faces with the `DoubleSided` bit and the ones without it, in the order they came in.
 */
export function splitBySide(polygons: readonly ArxPolygon[]): {
  readonly singleSided: ArxPolygon[]
  readonly doubleSided: ArxPolygon[]
} {
  const singleSided: ArxPolygon[] = []
  const doubleSided: ArxPolygon[] = []

  for (const polygon of polygons) {
    if (isDoubleSided(polygon)) {
      doubleSided.push(polygon)

      continue
    }

    singleSided.push(polygon)
  }

  return { singleSided, doubleSided }
}

/**
 * Builds the material of the fill: the yellow mark of the selected faces.
 *
 * @param side The sides of a face it paints: one for a face the level culls, two for the one it draws from both.
 *
 * @returns The yellow, lit, translucent mark of the fill.
 */
function fillMaterialOf(side: Side): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: Color.yellow.getHex(),
    vertexColors: true,
    side,
    transparent: true,
    opacity: FILL_OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  })
}

/**
 * Builds the material of the gray base under the fill.
 *
 * @param side The sides of a face it paints, the ones of the fill it sits under.
 *
 * @returns The gray, lit, nearly opaque base.
 */
function backdropMaterialOf(side: Side): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: BACKDROP_COLOR,
    side,
    transparent: true,
    opacity: BACKDROP_OPACITY,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  })
}

/**
 * Builds the overlay of the walkable view.
 *
 * @param scene The scene of the widget.
 * @param offset The scene position of the level, already mirrored.
 * @param renderer The renderer of the view: the outline of the crosshair is a screen-space contour, and its mask is a
 * render target of the canvas. A view without a renderer has no outline.
 *
 * @returns The overlay, with nothing shown yet.
 */
export function createPolygonSelectionOverlay(
  scene: Scene,
  offset: Vector3,
  renderer?: WebGLRenderer,
): PolygonSelectionOverlay {
  // the outline of the crosshair is the contour of the faces as the camera sees them: a line built from the faces would
  // show through what hides it, and a fold of a group would read as a line inside the group (2026-11-18, the owner). The
  // contour is a mask of the faces in a render target, and a shader that draws the edge of that mask.
  let contour: SelectionContour | undefined

  if (renderer !== undefined) {
    contour = createSelectionContour(renderer, offset)
  }

  // the fill lies on the surface of the selected polygons, exactly where the mesh is, so it needs the
  // polygon offset: without it the two fight for the same pixels and the fill mostly loses. The offset
  // keeps the depth test on, so a selection behind a wall stays hidden.
  //
  // The fill is front side only, the way the material of the level draws its faces: a double sided fill painted a
  // face selected from behind the same as a face in front of the camera, and from above the room the back of the
  // ceiling covered the whole view, so the author read a floor as selected while the yellow came from above it.
  //
  // It is lit (`MeshLambertMaterial`): on the room map the yellow is nearly solid, and a flat color swallowed the
  // beams and the corners of the room (2026-11-10, the owner). The lit yellow keeps the shading of the surfaces it
  // covers, so the mark is bright and the geometry still reads.
  //
  // The faces the level draws from both sides have a fill of their own, with a material of two sides: the level shows
  // such a face from behind too, and the mark of a selection may not vanish when the author walks around it (2026-11-14,
  // the owner). Two meshes and not one material of two sides for all, because a face the level culls has to keep a fill
  // the camera sees only from the front.
  const fillMaterial = fillMaterialOf(FrontSide)
  const doubleFillMaterial = fillMaterialOf(DoubleSide)
  const fill = new Mesh(new BufferGeometry(), fillMaterial)
  fill.renderOrder = 7
  fill.frustumCulled = false
  const doubleFill = new Mesh(new BufferGeometry(), doubleFillMaterial)
  doubleFill.renderOrder = 7
  doubleFill.frustumCulled = false

  // the gray base sits just under the fill: the same geometry with a weaker polygon offset and a lower render order,
  // so the yellow is always the one on top
  // it is lit on purpose (`MeshLambertMaterial`, like the material of the room map): a flat gray hid the beams of a
  // ceiling and read as one color, while the lit one keeps the shading of the surfaces and only takes their color away
  const backdropMaterial = backdropMaterialOf(FrontSide)
  const doubleBackdropMaterial = backdropMaterialOf(DoubleSide)
  const backdrop = new Mesh(new BufferGeometry(), backdropMaterial)
  backdrop.renderOrder = 6
  backdrop.frustumCulled = false
  const doubleBackdrop = new Mesh(new BufferGeometry(), doubleBackdropMaterial)
  doubleBackdrop.renderOrder = 6
  doubleBackdrop.frustumCulled = false

  let hasSingleSided = false
  let hasDoubleSided = false
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
    put(fill, hasSingleSided)
    put(backdrop, hasSingleSided && hasBackdrop)
    put(doubleFill, hasDoubleSided)
    put(doubleBackdrop, hasDoubleSided && hasBackdrop)
  }

  return {
    setCursor: (polygons: readonly ArxPolygon[], mode: SelectionMode): void => {
      contour?.set(polygons, mode)
    },
    renderCursor: (camera: Camera): void => {
      contour?.render(camera)
    },
    setHighlight: (polygons, tintOf, inGroup): void => {
      const { singleSided, doubleSided } = splitBySide(polygons)
      let baseOf: ((polygon: ArxPolygon) => ThreeColor) | undefined

      if (inGroup !== undefined) {
        baseOf = (polygon: ArxPolygon): ThreeColor => {
          if (inGroup(polygon)) {
            return GROUP_FILL_COLOR
          }

          return new ThreeColor(Color.yellow.getHex())
        }
      }

      fill.geometry.dispose()
      doubleFill.geometry.dispose()

      const singleGeometry = polygonFillGeometry(singleSided, offset, tintOf, baseOf)
      const doubleGeometry = polygonFillGeometry(doubleSided, offset, tintOf, baseOf)

      fill.geometry = singleGeometry
      backdrop.geometry = singleGeometry
      doubleFill.geometry = doubleGeometry
      doubleBackdrop.geometry = doubleGeometry
      hasSingleSided = singleSided.length > 0
      hasDoubleSided = doubleSided.length > 0
      updateHighlight()
    },
    setBackdrop: (visible: boolean): void => {
      hasBackdrop = visible

      // the base under the fill means the room map: there the yellow is the mark itself, and on the level it stays a
      // tint that the art shows through
      let fillOpacity = FILL_OPACITY

      if (visible) {
        fillOpacity = FILL_ON_MAP_OPACITY
      }

      fillMaterial.opacity = fillOpacity
      doubleFillMaterial.opacity = fillOpacity

      updateHighlight()
    },
    dispose: (): void => {
      contour?.dispose()
      scene.remove(fill)
      scene.remove(backdrop)
      scene.remove(doubleFill)
      scene.remove(doubleBackdrop)
      fill.geometry.dispose()
      doubleFill.geometry.dispose()
      fillMaterial.dispose()
      doubleFillMaterial.dispose()
      backdropMaterial.dispose()
      doubleBackdropMaterial.dispose()
    },
  }
}

/**
 * What a running drag has to decide on: the faces under the ray, and the state of the gesture.
 */
export type DragSweep = {
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
 * something away does not need a neighbor, and a face the selection holds is exactly the one to take.
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
