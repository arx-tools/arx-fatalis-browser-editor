import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { type Vector3, BufferAttribute, BufferGeometry, Vector2 } from 'three'
import { arxVector3toVector3 } from './conversion.ts'

/**
 * Builds the geometry of a set of Arx polygons.
 *
 * @remarks
 * - every polygon becomes one or two triangles: the game stores quads, three.js only knows triangles
 * - the polygon vertices come in the order the game uses, so the quad is split along `a, b, c` and
 * `c, b, d` (the diagonal is `b-c`), which keeps the winding
 * - the UVs and the normals come along, even though the first round draws the mesh without textures and
 * with a flat material: they are what the texture and the lighting round needs, and they cost nothing to
 * build here
 * - the mesh is shifted by the scene position of the level, so it sits around the origin
 *
 * @param polygons The polygons to convert.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The geometry, ready for a `Mesh`.
 */
export function arxPolygonsToGeometry(polygons: readonly ArxPolygon[], offset: Vector3): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  for (const polygon of polygons) {
    const [a, b, c, d] = polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex).sub(offset).toArray()
    })
    const [uvA, uvB, uvC, uvD] = polygon.vertices.map((vertex) => {
      return new Vector2(vertex.u, vertex.v).toArray()
    })

    // the normals of the four corners: the game gives one normal for the first two corners and another
    // for the last two when the polygon is curved, and the same one four times when it is flat
    const rawNormals = polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]
    const [nA, nB, nC, nD] = rawNormals.map((normal) => {
      return arxVector3toVector3(normal).toArray()
    })

    positions.push(...(a as number[]), ...(b as number[]), ...(c as number[]))
    normals.push(...(nA as number[]), ...(nB as number[]), ...(nC as number[]))
    uvs.push(...uvA, ...uvB, ...uvC)

    if (isQuad(polygon)) {
      positions.push(...(c as number[]), ...(b as number[]), ...(d as number[]))
      normals.push(...(nC as number[]), ...(nB as number[]), ...(nD as number[]))
      uvs.push(...uvC, ...uvB, ...uvD)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))

  return geometry
}
