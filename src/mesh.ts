import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, type Material, Mesh, Vector2, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export function arxPolygonsToMesh(polygons: ArxPolygon[], material: Material, offset: Vector3): Mesh {
  const vertices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  polygons.forEach((polygonData) => {
    if (isQuad(polygonData)) {
      const [a, b, c, d] = polygonData.vertices.map(({ x, y, z }) => {
        return new Vector3(x, y, z).sub(offset).multiply(new Vector3(-1, -1, 1))
      })

      // prettier-ignore
      vertices.push(
        ...a.toArray(),
        ...b.toArray(),
        ...c.toArray(),

        ...c.toArray(),
        ...b.toArray(),
        ...d.toArray(),
      )

      const [nA, nB, nC, nD] = (
        polygonData.normals ?? [polygonData.norm, polygonData.norm, polygonData.norm, polygonData.norm2]
      ).map(({ x, y, z }) => {
        return new Vector3(x, y, z).multiply(new Vector3(-1, -1, 1))
      })

      // prettier-ignore
      normals.push(
        ...nA.toArray(),
        ...nB.toArray(),
        ...nC.toArray(),

        ...nC.toArray(),
        ...nB.toArray(),
        ...nD.toArray(),
      )

      const [uvA, uvB, uvC, uvD] = polygonData.vertices.map(({ u, v }) => {
        return new Vector2(u, v)
      })

      // prettier-ignore
      uvs.push(
        ...uvA.toArray(),
        ...uvB.toArray(),
        ...uvC.toArray(),

        ...uvC.toArray(),
        ...uvB.toArray(),
        ...uvD.toArray(),
      )
    } else {
      const [a, b, c] = polygonData.vertices.map(({ x, y, z }) => {
        return new Vector3(x, y, z).sub(offset).multiply(new Vector3(-1, -1, 1))
      })

      // prettier-ignore
      vertices.push(
        ...a.toArray(),
        ...b.toArray(),
        ...c.toArray(),
      )

      const [nA, nB, nC] = (polygonData.normals ?? [polygonData.norm, polygonData.norm, polygonData.norm]).map(
        ({ x, y, z }) => {
          return new Vector3(x, y, z).multiply(new Vector3(-1, -1, 1))
        },
      )

      // prettier-ignore
      normals.push(
        ...nA.toArray(),
        ...nB.toArray(),
        ...nC.toArray(),
      )

      const [uvA, uvB, uvC] = polygonData.vertices.map(({ u, v }) => {
        return new Vector2(u, v)
      })

      // prettier-ignore
      uvs.push(
        ...uvA.toArray(),
        ...uvB.toArray(),
        ...uvC.toArray(),
      )
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))

  geometry.boundsTree = new MeshBVH(geometry)

  return new Mesh(geometry, material)
}

export function meshToArxPolygons(mesh: Mesh): ArxPolygon[] {
  // TODO
  return []
}
