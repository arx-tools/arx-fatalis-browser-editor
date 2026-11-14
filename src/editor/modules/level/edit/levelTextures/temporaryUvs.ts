import { isQuad } from 'arx-convert/utils'
import type { ArxPolygon } from 'arx-convert/types'
import { Vector3, type BufferGeometry } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import type { FaceUv } from '../../../../../generator/arxMap/uvs.ts'

/**
 * How short a length may be before the face counts as a point or a line.
 */
const TINY = 1e-6

/**
 * The corners a face uses: three of a triangle, four of a quad.
 *
 * @param polygon The face to read.
 *
 * @returns The corners, in the order the level stores them.
 */
function cornersOf(polygon: ArxPolygon): Vector3[] {
  let count = 3

  if (isQuad(polygon)) {
    count = 4
  }

  return polygon.vertices.slice(0, count).map((vertex) => {
    return new Vector3(vertex.x, vertex.y, vertex.z)
  })
}

/**
 * The normal of the plane of a face.
 *
 * @remarks
 * The level stores the normal of every face, and it is the plane the face was built on: it wins. A face whose normal is
 * zero (a broken one) falls back to the plane of its first three corners, and a face that has no plane at all takes the
 * plane that faces the player down the Z axis.
 *
 * @param polygon The face to read.
 * @param corners The corners of the face.
 *
 * @returns The unit normal of the plane of the face.
 */
function planeNormalOf(polygon: ArxPolygon, corners: readonly Vector3[]): Vector3 {
  const stored = new Vector3(polygon.norm.x, polygon.norm.y, polygon.norm.z)

  if (stored.length() > TINY) {
    return stored.normalize()
  }

  const [a, b, c] = corners

  if (a !== undefined && b !== undefined && c !== undefined) {
    const normal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))

    if (normal.length() > TINY) {
      return normal.normalize()
    }
  }

  return new Vector3(0, 0, 1)
}

/**
 * One direction of the plane of a face.
 *
 * @remarks
 * The axis the plane is the least aligned with is crossed with the normal, which gives a direction of the plane that is
 * never a point: a floor gets its directions from the X and Z axes, a wall from the Y and the other one.
 *
 * @param normal The unit normal of the plane.
 *
 * @returns A unit direction of the plane.
 */
function planeDirectionOf(normal: Vector3): Vector3 {
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
  const first = axes[0] ?? new Vector3(1, 0, 0)
  let picked = first
  let smallest = Math.abs(normal.dot(first))

  for (const axis of axes.slice(1)) {
    const fit = Math.abs(normal.dot(axis))

    if (fit < smallest) {
      smallest = fit
      picked = axis
    }
  }

  return new Vector3().crossVectors(normal, picked).normalize()
}

/**
 * The uvs of a face the level gives no texture: its corners laid on the square of its plane.
 *
 * @remarks
 * Such a face has **no uv** in the level (all of its corners stand on one texel), so the placeholder the editor draws on
 * it would sample that one texel and read as a flat colour. The placeholder says "a texture belongs here", so the face
 * gets the whole texture: its corners are projected onto its plane, and the square around them is the 0..1 space of the
 * uv. The square keeps the shape of the face (the longer side spans the whole texture), so the picture is not stretched.
 *
 * The uvs live in the **geometry** only ({@link applyTemporaryUvsOf}): the polygons keep the uvs the level has, so the
 * panels still say the face has no texture of its own.
 *
 * @param polygon The face to read.
 *
 * @returns The uv of its corners, in the order of the vertices, or the middle of the texture for a face without a plane.
 */
export function planarUvsOf(polygon: ArxPolygon): FaceUv[] {
  const corners = cornersOf(polygon)
  const normal = planeNormalOf(polygon, corners)
  const direction = planeDirectionOf(normal)
  const across = new Vector3().crossVectors(normal, direction).normalize()
  const origin = corners.at(0) ?? new Vector3()

  const projected = corners.map((corner) => {
    const offset = corner.clone().sub(origin)

    return { u: offset.dot(direction), v: offset.dot(across) }
  })

  let minU = Number.POSITIVE_INFINITY
  let maxU = Number.NEGATIVE_INFINITY
  let minV = Number.POSITIVE_INFINITY
  let maxV = Number.NEGATIVE_INFINITY

  for (const corner of projected) {
    minU = Math.min(minU, corner.u)
    maxU = Math.max(maxU, corner.u)
    minV = Math.min(minV, corner.v)
    maxV = Math.max(maxV, corner.v)
  }

  const side = Math.max(maxU - minU, maxV - minV)

  if (!Number.isFinite(side) || side < TINY) {
    return corners.map(() => {
      return { u: 0.5, v: 0.5 }
    })
  }

  return projected.map((corner) => {
    return { u: (corner.u - minU) / side, v: (corner.v - minV) / side }
  })
}

/**
 * Gives the faces without a texture the uvs of their plane, in the geometry only.
 *
 * @remarks
 * The geometry holds the vertices in the order of the polygons (three or six of a quad), so the walk over the polygons is
 * the walk over the attribute. The polygons are not touched: a face the level gives no texture keeps the uvs the level
 * has (all of them on one texel), and the panels that read them keep saying the face has no texture. A repaint of the
 * level (an edit, a reload) calls this again, and the paint of a uv edit (`writeFaceUvs` of
 * [`generator/arxMap/uvs.ts`](../../../../../generator/arxMap/uvs.ts)) writes the real uvs over these when the author
 * places the corners.
 *
 * The attribute is only marked as changed when a value really moved: the paint runs on every revision of the level (a
 * frame of a drag), and an upload of the uvs of the whole level for the same numbers would be a cost without a picture.
 *
 * @param map The level to read: the names of its texture containers decide which face has a texture.
 * @param polygons The solid faces, in the order of the geometry.
 * @param geometry The geometry of the solid mesh.
 */
export function applyTemporaryUvsOf(map: ArxMap, polygons: readonly ArxPolygon[], geometry: BufferGeometry): void {
  const attribute = geometry.getAttribute('uv')
  let start = 0
  let changed = false

  for (const polygon of polygons) {
    let count = 3
    // the vertices of one face, in the order the geometry builder writes them: `a, b, c` and `c, b, d`
    let order = [0, 1, 2]

    if (isQuad(polygon)) {
      count = 6
      order = [0, 1, 2, 2, 1, 3]
    }

    if (map.textureNameOf(polygon.textureContainerId) === undefined) {
      const uvs = planarUvsOf(polygon)

      for (const [position, corner] of order.entries()) {
        const uv = uvs[corner]

        if (uv === undefined) {
          continue
        }

        const vertex = start + position

        if (Math.abs(attribute.getX(vertex) - uv.u) > TINY || Math.abs(attribute.getY(vertex) - uv.v) > TINY) {
          attribute.setXY(vertex, uv.u, uv.v)
          changed = true
        }
      }
    }

    start = start + count
  }

  if (changed) {
    attribute.needsUpdate = true
  }
}
