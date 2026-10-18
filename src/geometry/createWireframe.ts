import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, LineSegments, MeshBasicMaterial, type Vector3 } from 'three'
import { arxVector3toVector3 } from '../arx-threejs-format-converters.js'
import { Color } from '../Color.js'

/**
 * A polygon based wireframe: the perimeter of every source polygon (a triangle or a quad) instead
 * of the triangles of the merged geometry. This keeps the quad edges visible without the diagonal
 * that the triangle split introduces, so the wireframe matches the phantom cursor and the
 * selection.
 *
 * The stored vertex order is a "Z" (0, 1, 2, 3), the perimeter is 0-1-2 for a triangle and
 * 0-1-3-2 for a quad.
 */
export function createPolygonWireframe(polygons: ReadonlyArray<ArxPolygon>, offset: Vector3): LineSegments {
  const positions: number[] = []

  for (const polygon of polygons) {
    const vertices = polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex).sub(offset)
    })
    const perimeter = isQuad(polygon) ? [0, 1, 3, 2] : [0, 1, 2]

    for (let i = 0; i < perimeter.length; i++) {
      const from = vertices[perimeter[i]]
      const to = vertices[perimeter[(i + 1) % perimeter.length]]
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  return new LineSegments(
    geometry,
    new MeshBasicMaterial({
      color: Color.white.darken(50).getHex(),
    }),
  )
}
