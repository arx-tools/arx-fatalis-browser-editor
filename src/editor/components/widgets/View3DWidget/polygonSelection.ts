import type { ArxPolygon } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  type Mesh as ThreeMesh,
  type PerspectiveCamera,
  type Scene,
  type Vector3,
} from 'three'
import { Color } from '../../../../generator/Color.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { polygonFillTriangles, polygonPerimeter, polygonOfTriangle } from '../../../../generator/polygons.ts'

/**
 * What a click does with the polygon under the crosshair.
 *
 * @remarks
 * A plain click starts a new selection, `Shift` adds to it and `Ctrl` (or `Meta`) takes away from it, the
 * same reading the archived editor had.
 */
export type SelectionMode = 'add' | 'remove' | 'replace'

/**
 * The modifiers of a mouse event, as far as the selection cares about them.
 */
export interface SelectionModifiers {
  /**
   * Whether `Shift` is held down: the click adds to the selection.
   */
  readonly shiftKey: boolean
  /**
   * Whether `Ctrl` is held down: the click takes away from the selection.
   */
  readonly ctrlKey: boolean
  /**
   * Whether `Meta` is held down: on the apple keyboards this is the `Ctrl` of the others.
   */
  readonly metaKey: boolean
}

/**
 * Reads the mode of a click from its modifiers.
 *
 * @param event The mouse event of the click.
 *
 * @returns The mode the click asks for.
 */
export function selectionModeOf(event: SelectionModifiers): SelectionMode {
  if (event.ctrlKey || event.metaKey) {
    return 'remove'
  }

  if (event.shiftKey) {
    return 'add'
  }

  return 'replace'
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
  camera.updateMatrixWorld()

  const raycaster = new Raycaster()
  // the range of the camera, not a generous one: a polygon beyond the far plane is not drawn, so picking
  // it would outline a surface that is not on the screen
  raycaster.near = camera.near
  raycaster.far = camera.far
  raycaster.setFromCamera(new Vector2(0, 0), camera)

  const hit = raycaster.intersectObjects([...meshes], false)[0]
  const face = hit?.face

  if (hit === undefined || face === null || face === undefined || typeof face.a !== 'number') {
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
  // fill (its `renderOrder` is the higher one)
  const outlineMaterial = new LineBasicMaterial({
    color: Color.green.getHex(),
    depthTest: false,
    transparent: true,
  })
  const outline = new LineSegments(new BufferGeometry(), outlineMaterial)
  outline.renderOrder = 8
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
