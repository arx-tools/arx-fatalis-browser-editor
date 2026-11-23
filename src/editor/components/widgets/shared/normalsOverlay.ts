import type { ArxPolygon } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Scene,
  type Vector3,
} from 'three'
import { computed, type ComputedRef } from 'vue'
import { usedVerticesOf } from '../../../../generator/polygons.ts'
import { persistedRef } from '../../../modules/persistedRef/persistedRef.ts'

/**
 * The color of the line of a face normal: amber.
 *
 * @remarks
 * The two normals of a face (the one of the face and the four of its corners) are read together, and the two layers
 * have to be told apart at a glance: the face normal keeps the amber of the accent, and the vertex normals the cyan the
 * game's own debug view uses. Both read on the dark faces and on the painted ones.
 */
const FACE_NORMAL_COLOR = 0xff_a5_00

/**
 * The color of the line of a vertex normal: cyan.
 */
const VERTEX_NORMAL_COLOR = 0x22_d3_ee

/**
 * The color of the line of a normal of a selected face: white.
 *
 * @remarks
 * The two layers share the color (2026-11-23, the owner: the same white is fine on the face and on the corner): the white
 * is the brightest line of the scene, so a selected line stands out of the amber and the cyan of the unselected ones even
 * on a light wall, and the shape of the line already says which layer it belongs to. The red and the green of the face
 * layer were tried first; the red sat too close to the amber, and the green was too loud beside the crosshair contour.
 */
const NORMAL_SELECTED_COLOR = 0xff_ff_ff

/**
 * The share of the radius of a face a normal line takes.
 *
 * @remarks
 * The faces of a level go from the width of a hand to a whole wall, so a fixed length would be invisible on the big ones
 * and a forest of lines on the small ones: a line is half of the radius of its face (2026-11-23, the owner).
 */
export const NORMAL_LENGTH_FACTOR = 0.5

/**
 * The layers of the normals a view draws.
 *
 * @remarks
 * - `face`: one line in the middle of every face, along the normal of the face
 * - `vertex`: one line on every corner of every face, along the normal of that corner (the game's smooth shading)
 *
 * The two are **independent switches** (2026-11-23, the owner): the author combines them freely, and the two off is a
 * state of its own (the switch of the normals is on, and no line is drawn, the way the snapping can be on with no kind
 * of it).
 */
export type NormalsLayers = {
  /**
   * Whether the face normals are drawn.
   */
  readonly face: boolean
  /**
   * Whether the vertex normals are drawn.
   */
  readonly vertex: boolean
}

/**
 * Whether the face normals are drawn.
 *
 * @remarks
 * A view preference like the wireframe: a fact of the author, not of the level, so it stays in the browser between the
 * maps (and not in the url: a shared link shows the level the way the reader wants it). Only the walkable view reads it
 * (2026-11-23, the owner): the fixed views keep their flat map. The default is **on**: the face normal is what the
 * polygon inspector and the export read, and a level has one of them per face, against the three or four corner
 * normals.
 */
export const faceNormalsVisible = persistedRef<boolean>({
  key: 'faceNormalsVisible',
  defaultValue: true,
  persistInLocalStorage: true,
})

/**
 * Whether the vertex normals are drawn.
 *
 * @remarks
 * The other layer of {@link faceNormalsVisible}, with a switch of its own: the corner normals are ten times the lines of
 * the face ones on a big level, so they are not on until the author asks for them. The default is off.
 */
export const vertexNormalsVisible = persistedRef<boolean>({
  key: 'vertexNormalsVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * The layers the switches ask for.
 *
 * @remarks
 * The two refs are read together on every change, so a view and the widget see the same pair, and the view does not have
 * to know the two switches.
 */
export const normalsLayers: ComputedRef<NormalsLayers> = computed(() => {
  return { face: faceNormalsVisible.value, vertex: vertexNormalsVisible.value }
})

/**
 * The three numbers of a point or a direction in the space of the mesh.
 */
type Triple = readonly [number, number, number]

/**
 * The middle and the radius of a face, in the space of the mesh.
 */
type FaceFrame = {
  /**
   * The middle of the face.
   */
  readonly middle: Triple
  /**
   * The distance of the farthest corner from the middle.
   */
  readonly radius: number
  /**
   * The corners of the face, in the order of its stored vertices.
   */
  readonly corners: readonly Triple[]
}

/**
 * Mirrors and shifts a game point into the space of the mesh.
 *
 * @param x The game x of the point.
 * @param y The game y of the point.
 * @param z The game z of the point.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The same point in the space of the mesh.
 */
function pointOf(x: number, y: number, z: number, offset: Vector3): Triple {
  return [-x - offset.x, -y - offset.y, z - offset.z]
}

/**
 * Reads the middle, the radius and the corners of a face.
 *
 * @remarks
 * The corners are the ones the polygon actually uses (three for a triangle, four for a quad), so the leftover slot of a
 * triangle does not pull the middle of its face. The radius is the farthest corner of the face, the same length the
 * face frame of the selection reads.
 *
 * @param polygon The face to read.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The frame of the face, or `undefined` when it has no corner.
 */
function frameOf(polygon: ArxPolygon, offset: Vector3): FaceFrame | undefined {
  const vertices = usedVerticesOf(polygon)

  if (vertices.length === 0) {
    return undefined
  }

  const corners: Triple[] = []
  let sumX = 0
  let sumY = 0
  let sumZ = 0

  for (const vertex of vertices) {
    const [x, y, z] = pointOf(vertex.x, vertex.y, vertex.z, offset)

    corners.push([x, y, z])
    sumX = sumX + x
    sumY = sumY + y
    sumZ = sumZ + z
  }

  const middle: Triple = [sumX / vertices.length, sumY / vertices.length, sumZ / vertices.length]
  let radius = 0

  for (const corner of corners) {
    const distance = Math.hypot(corner[0] - middle[0], corner[1] - middle[1], corner[2] - middle[2])

    radius = Math.max(radius, distance)
  }

  return { middle, radius, corners }
}

/**
 * Mirrors a game normal and makes it a unit vector.
 *
 * @param normal The normal in the game's coordinates.
 *
 * @returns The direction in the space of the mesh, or `undefined` when the normal is a zero vector.
 */
function directionOf(normal: Triple): Triple | undefined {
  const x = -normal[0]
  const y = -normal[1]
  const z = normal[2]
  const length = Math.hypot(x, y, z)

  if (length === 0) {
    return undefined
  }

  return [x / length, y / length, z / length]
}

/**
 * Writes one line of a normal into a buffer of points.
 */
function pushLine(positions: number[], start: Triple, direction: Triple, length: number): void {
  const offsetX = direction[0] * length
  const offsetY = direction[1] * length
  const offsetZ = direction[2] * length

  positions.push(start[0], start[1], start[2], start[0] + offsetX, start[1] + offsetY, start[2] + offsetZ)
}

/**
 * Builds the lines of the face normals of a level.
 *
 * @remarks
 * A line starts in the middle of the face and goes along the normal of the face, which is the side the game draws it
 * from: the line of a floor points up and the line of a ceiling down. A face without a normal or without a size has no
 * line.
 *
 * @param polygons The faces to draw, in their own order.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The points of the lines, six numbers per line.
 */
export function faceNormalLines(polygons: readonly ArxPolygon[], offset: Vector3): Float32Array {
  const positions: number[] = []

  for (const polygon of polygons) {
    const frame = frameOf(polygon, offset)

    if (frame === undefined || frame.radius === 0) {
      continue
    }

    const direction = directionOf([polygon.norm.x, polygon.norm.y, polygon.norm.z])

    if (direction === undefined) {
      continue
    }

    pushLine(positions, frame.middle, direction, frame.radius * NORMAL_LENGTH_FACTOR)
  }

  return new Float32Array(positions)
}

/**
 * Builds the lines of the vertex normals of a level.
 *
 * @remarks
 * The game does not shade a face flat: it gives a normal to every corner, and a curved polygon (the two stored normals)
 * bends its shading across the face. A line starts on a corner and goes along the normal of that corner, as long as the
 * face normal is on the middle of the face.
 *
 * @param polygons The faces to draw, in their own order.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The points of the lines, six numbers per line.
 */
export function vertexNormalLines(polygons: readonly ArxPolygon[], offset: Vector3): Float32Array {
  const positions: number[] = []

  for (const polygon of polygons) {
    const frame = frameOf(polygon, offset)

    if (frame === undefined || frame.radius === 0) {
      continue
    }

    const cornerNormals = polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]
    const length = frame.radius * NORMAL_LENGTH_FACTOR

    for (const [index, corner] of frame.corners.entries()) {
      const normal = cornerNormals[index]
      const direction = directionOf([normal.x, normal.y, normal.z])

      if (direction === undefined) {
        continue
      }

      pushLine(positions, corner, direction, length)
    }
  }

  return new Float32Array(positions)
}

/**
 * The normals of a level, over the mesh of one view.
 */
export type NormalsOverlay = {
  /**
   * Shows or hides the normals; a call with the state it already has does nothing.
   *
   * @param visible Whether the normals should be in the scene.
   */
  readonly setVisible: (visible: boolean) => void
  /**
   * Chooses the layers to draw, and draws the one that is not built yet.
   *
   * @param layers The layers to show.
   */
  readonly setLayers: (layers: NormalsLayers) => void
  /**
   * Takes the polygons the lines are built from, and builds the lines of the shown layers again.
   *
   * @remarks
   * A level is edited in place, so the buffers of its mesh tell nothing about a new geometry: this is the call after an
   * edit, and a hidden group changes the list of the polygons the same way. The selected faces are a source of their own,
   * because their lines take the selected color.
   *
   * @param polygons The faces to draw, in their own order.
   * @param offset The scene position of the level, already mirrored.
   * @param selected The faces in the selection; the lines of these take the selected color.
   */
  readonly setSource: (polygons: readonly ArxPolygon[], offset: Vector3, selected: ReadonlySet<ArxPolygon>) => void
  /**
   * Takes the overlay out of the scene and frees its geometries and materials.
   */
  readonly dispose: () => void
}

/**
 * One layer of the normals: its lines and the buffers they draw.
 */
type NormalsLayer = {
  /**
   * The lines of the layer, hidden until the layer is asked for.
   */
  readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>
  /**
   * The index of the source the geometry was built from, so a layer is built once per source.
   */
  builtSource: number
}

/**
 * Builds a layer of normal lines, with an empty geometry.
 *
 * @param color The color of the lines.
 * @param renderOrder The order of the layer over the other overlays of the view.
 *
 * @returns The layer, ready to be filled.
 */
function createLayer(color: number, renderOrder: number): NormalsLayer {
  const geometry = new BufferGeometry()

  // an empty buffer from the start: the layer is in the scene before it is built, and a geometry without a position
  // attribute is not something the renderer should have to meet
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3))

  const material = new LineBasicMaterial({ color, transparent: true })
  const lines = new LineSegments(geometry, material)

  lines.renderOrder = renderOrder

  // the lines cover the level, so culling them as one object would almost never drop them, and their bounding sphere
  // would be computed from a buffer that changes on every edit
  lines.frustumCulled = false
  lines.visible = false

  return { lines, builtSource: -1 }
}

/**
 * Puts the normals of a level into a scene, hidden at first.
 *
 * @remarks
 * It is an overlay like the wireframe, with two layers of its own: the level does not carry the normal lines in its
 * mesh, so they are built from the polygons of the map and every view that draws them has its own wrapper. The lines
 * write depth and are drawn after the wireframe, so the normals of a wall behind another wall stay hidden.
 *
 * Every layer has two halves, a plain one and the one of the **selected** faces, because the line of a selected face
 * takes a color of its own (2026-11-23, the owner). The two halves are built from the two parts of the same polygon
 * list, so a rebuild walks the level once per layer, the same cost as a single color would be.
 *
 * The lines are built from the **visible** polygons the caller gives, and only the layers the view shows are built: the
 * default is the face normals, which is one line per face, and the corner normals of a big level are ten times that many
 * points.
 *
 * @param scene The scene to put the lines into.
 *
 * @returns The overlay, ready to be shown.
 */
export function attachNormals(scene: Scene): NormalsOverlay {
  const group = new Group()

  group.visible = false
  scene.add(group)

  const face = createLayer(FACE_NORMAL_COLOR, 7)
  const vertex = createLayer(VERTEX_NORMAL_COLOR, 8)
  const selectedFace = createLayer(NORMAL_SELECTED_COLOR, 9)
  const selectedVertex = createLayer(NORMAL_SELECTED_COLOR, 10)

  group.add(face.lines, vertex.lines, selectedFace.lines, selectedVertex.lines)

  let layers: NormalsLayers = { face: true, vertex: false }
  let source: { readonly polygons: readonly ArxPolygon[]; readonly offset: Vector3 } | undefined
  let selection: ReadonlySet<ArxPolygon> = new Set()
  let revision = 0

  /**
   * Puts the layers the view asks for on the screen and takes the others off.
   */
  function applyLayers(): void {
    face.lines.visible = layers.face
    selectedFace.lines.visible = layers.face
    vertex.lines.visible = layers.vertex
    selectedVertex.lines.visible = layers.vertex
  }

  /**
   * Builds the geometry of one layer, when the view shows it and the source is new.
   *
   * @param layer The layer to build.
   * @param shown Whether the view shows it.
   * @param polygons The faces of the layer, already split by the selection.
   * @param build The builder of its points.
   */
  function buildLayer(
    layer: NormalsLayer,
    shown: boolean,
    polygons: readonly ArxPolygon[],
    build: (polygons: readonly ArxPolygon[], offset: Vector3) => Float32Array,
  ): void {
    if (!shown || source === undefined || layer.builtSource === revision) {
      return
    }

    const positions = build(polygons, source.offset)

    layer.lines.geometry.setAttribute('position', new BufferAttribute(positions, 3))
    layer.builtSource = revision
  }

  /**
   * Builds the layers the view shows, if they are stale.
   */
  function buildShownLayers(): void {
    if (source === undefined || !group.visible) {
      return
    }

    if (!layers.face && !layers.vertex) {
      return
    }

    const plain: ArxPolygon[] = []
    const highlighted: ArxPolygon[] = []

    for (const polygon of source.polygons) {
      if (selection.has(polygon)) {
        highlighted.push(polygon)
      } else {
        plain.push(polygon)
      }
    }

    buildLayer(face, layers.face, plain, faceNormalLines)
    buildLayer(selectedFace, layers.face, highlighted, faceNormalLines)
    buildLayer(vertex, layers.vertex, plain, vertexNormalLines)
    buildLayer(selectedVertex, layers.vertex, highlighted, vertexNormalLines)
  }

  applyLayers()

  return {
    setVisible: (visible: boolean): void => {
      group.visible = visible
      buildShownLayers()
    },
    setLayers: (next: NormalsLayers): void => {
      layers = next
      applyLayers()
      buildShownLayers()
    },
    setSource: (polygons: readonly ArxPolygon[], offset: Vector3, selected: ReadonlySet<ArxPolygon>): void => {
      source = { polygons, offset }
      selection = selected
      revision = revision + 1
      buildShownLayers()
    },
    dispose: (): void => {
      scene.remove(group)
      group.clear()

      for (const layer of [face, vertex, selectedFace, selectedVertex]) {
        layer.lines.geometry.dispose()
        layer.lines.material.dispose()
      }
    },
  }
}
