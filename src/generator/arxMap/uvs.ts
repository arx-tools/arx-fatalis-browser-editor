import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import type { BufferGeometry } from 'three'

/**
 * The place of a corner of a face on its texture, in the 0..1 space of the uv.
 */
export interface FaceUv {
  /**
   * The column of the texture, from the left.
   */
  readonly u: number
  /**
   * The row of the texture, from the bottom (the way the renderer reads it).
   */
  readonly v: number
}

/**
 * The parts of a level the uv a face is written into.
 */
export interface FaceUvsTarget {
  /**
   * The geometry of the solid mesh, when the level has one.
   */
  readonly geometry: BufferGeometry | undefined
  /**
   * The polygons of the level.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The polygon of every triangle of the geometry, for the binary search of {@link writeFaceUvs}.
   */
  readonly triangleToPolygon: readonly number[]
}

/**
 * The first triangle of a face in the index of the mesh.
 *
 * @remarks
 * The triangle map is a running total of the faces, so it is sorted: a face with two triangles is two neighbouring
 * entries. The binary search finds its first triangle without walking the level (a drag of a corner asks for it on
 * every frame).
 *
 * @param triangleToPolygon The polygon of every triangle of the geometry.
 * @param faceIndex The face in the polygon list of the level.
 *
 * @returns The triangle, or `undefined` when the map has none for the face.
 */
function firstTriangleOf(triangleToPolygon: readonly number[], faceIndex: number): number | undefined {
  let low = 0
  let high = triangleToPolygon.length - 1

  while (low <= high) {
    const middle = (low + high) >> 1
    const polygon = triangleToPolygon[middle] ?? -1

    if (polygon < faceIndex) {
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  if (triangleToPolygon[low] === faceIndex) {
    return low
  }

  return undefined
}

/**
 * Writes the uv of the corners of a face into the model and into the mesh.
 *
 * @remarks
 * The uv is not a part of the geometry the level is built from: it is an attribute of the mesh, so a face can be
 * re-textured at the corner level without building the mesh again. The **model** (the vertices of the polygon) is
 * written too, because the export writes the polygon, and the picking, the wireframe and the statistics read it.
 *
 * The corners are the used vertices of the polygon: three for a triangle, four for a quad. The attribute of the mesh
 * holds the six vertices of a quad (`a, b, c` and `c, b, d`), so a quad writes its four corners into that order.
 *
 * @param target The parts of the level the uv is written into.
 * @param faceIndex The face in the polygon list.
 * @param uvs The uv of the corners, in the order they are stored (`a, b, c` and `d` for a quad).
 */
export function writeFaceUvs(target: FaceUvsTarget, faceIndex: number, uvs: readonly FaceUv[]): void {
  const polygon = target.polygons[faceIndex]

  if (polygon === undefined) {
    return
  }

  let corners = 3

  if (isQuad(polygon)) {
    corners = 4
  }

  for (let corner = 0; corner < corners; corner = corner + 1) {
    const uv = uvs[corner]
    const vertex = polygon.vertices[corner]

    if (uv === undefined || vertex === undefined) {
      continue
    }

    vertex.u = uv.u
    vertex.v = uv.v
  }

  const attribute = target.geometry?.getAttribute('uv')
  const first = firstTriangleOf(target.triangleToPolygon, faceIndex)

  if (attribute === undefined || first === undefined) {
    return
  }

  // the vertices of the geometry of one face, in the order `arxPolygonsToGeometry` writes them
  let order = [0, 1, 2]

  if (corners === 4) {
    order = [0, 1, 2, 2, 1, 3]
  }

  const start = first * 3

  for (const [position, corner] of order.entries()) {
    const uv = uvs[corner]

    if (uv !== undefined) {
      attribute.setXY(start + position, uv.u, uv.v)
    }
  }

  attribute.needsUpdate = true
}
