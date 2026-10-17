import type { ArxColor, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, type Material, Mesh, Uint8BufferAttribute, Vector2, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

function arxCoordinateToThreejsCoordinate(vector: Vector3): Vector3 {
  return vector.clone().multiply(new Vector3(-1, -1, 1))
}

export function arxVector3toVector3({ x, y, z }: ArxVector3): Vector3 {
  return arxCoordinateToThreejsCoordinate(new Vector3(x, y, z))
}

/**
 * Converts arx polygons into a three.js mesh.
 *
 * When `llfColors` is given, the mesh also gets a `color` attribute with the pre-computed vertex
 * lighting of the level - `llfColors[vertex.llfColorIdx]` for every vertex, in the very same order
 * as the position/uv/normal attributes (including the `c, b, d` order of the second triangle of a
 * quad). That is what the game renders, so such a mesh needs an **unlit** material: the light is
 * already in the vertices.
 */
export function arxPolygonsToMesh(
  polygons: ArxPolygon[],
  material: Material,
  offset: Vector3,
  llfColors?: ArxColor[],
): Mesh {
  const vertices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []

  polygons.forEach((polygonData) => {
    const [a, b, c, d] = polygonData.vertices.map(({ x, y, z }) => {
      return arxVector3toVector3({ x, y, z }).sub(offset).toArray()
    })

    const [uvA, uvB, uvC, uvD] = polygonData.vertices.map(({ u, v }) => {
      return new Vector2(u, v).toArray()
    })

    const rawNormals = polygonData.normals ?? [polygonData.norm, polygonData.norm, polygonData.norm, polygonData.norm2]
    const [nA, nB, nC, nD] = rawNormals.map((normal) => {
      return arxVector3toVector3(normal).toArray()
    })

    vertices.push(...a, ...b, ...c)
    uvs.push(...uvA, ...uvB, ...uvC)
    normals.push(...nA, ...nB, ...nC)

    let cA: number[] = []
    let cB: number[] = []
    let cC: number[] = []
    let cD: number[] = []
    if (llfColors !== undefined) {
      const vertexColors = polygonData.vertices.map(({ llfColorIdx }) => {
        let color: ArxColor | undefined
        if (llfColorIdx !== undefined) {
          color = llfColors[llfColorIdx]
        }

        if (color === undefined) {
          return [255, 255, 255]
        }

        return [color.r, color.g, color.b]
      })
      ;[cA, cB, cC, cD] = vertexColors
      colors.push(...cA, ...cB, ...cC)
    }

    if (isQuad(polygonData)) {
      vertices.push(...c, ...b, ...d)
      uvs.push(...uvC, ...uvB, ...uvD)
      normals.push(...nC, ...nB, ...nD)

      if (llfColors !== undefined) {
        colors.push(...cC, ...cB, ...cD)
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))

  if (llfColors !== undefined) {
    geometry.setAttribute('color', new Uint8BufferAttribute(new Uint8Array(colors), 3, true))
  }

  geometry.boundsTree = new MeshBVH(geometry)

  return new Mesh(geometry, material)
}

export function meshToArxPolygons(_mesh: Mesh): ArxPolygon[] {
  // TODO
  return []
}
