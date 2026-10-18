import type { ArxColor, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, type Material, Mesh, Vector2, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function arxCoordinateToThreejsCoordinate(vector: Vector3): Vector3 {
  return vector.clone().multiply(new Vector3(-1, -1, 1))
}

export function arxVector3toVector3({ x, y, z }: ArxVector3): Vector3 {
  return arxCoordinateToThreejsCoordinate(new Vector3(x, y, z))
}

/**
 * Converts arx polygons into a three.js mesh.
 *
 * When `llfColors` is given, the mesh also gets two color attributes:
 *
 * - `color`: the **albedo** of the texture of the polygon (the flat/average color of the game's
 *   texture, from `flatColors`, keyed by the polygon's `textureContainerId`) - this is what the
 *   dynamic point lights multiply in the `dynamic` mode,
 * - `baked`: the **final baked color** - the pre-computed LLF vertex lighting multiplied by the
 *   albedo. That is what the game renders for the static geometry, so the `baked`/`dynamic`
 *   materials add this attribute to the output (the light is already in the vertices).
 *
 * Both attributes are in the three.js **linear** color space (the LLF palette and the texture
 * average are sRGB, the renderer encodes the output back to sRGB).
 */
export function arxPolygonsToMesh(
  polygons: ArxPolygon[],
  material: Material,
  offset: Vector3,
  llfColors?: ArxColor[],
  flatColors?: ReadonlyMap<number, readonly [number, number, number]>,
): Mesh {
  const vertices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const albedoColors: number[] = []

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
      const flat = flatColors?.get(polygonData.textureContainerId) ?? [255, 255, 255]
      const albedo = flat.map((channel) => {
        return srgbToLinear(channel / 255)
      })
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
      ;[cA, cB, cC, cD] = vertexColors.map(([r, g, b]) => {
        // the game multiplies the texture by the baked light; the LLF palette is sRGB
        return [
          srgbToLinear((r / 255) * (flat[0] / 255)),
          srgbToLinear((g / 255) * (flat[1] / 255)),
          srgbToLinear((b / 255) * (flat[2] / 255)),
        ]
      })
      colors.push(...cA, ...cB, ...cC)
      albedoColors.push(...albedo, ...albedo, ...albedo)
    }

    if (isQuad(polygonData)) {
      vertices.push(...c, ...b, ...d)
      uvs.push(...uvC, ...uvB, ...uvD)
      normals.push(...nC, ...nB, ...nD)

      if (llfColors !== undefined) {
        colors.push(...cC, ...cB, ...cD)
        albedoColors.push(...albedoColors.slice(-9))
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))

  if (llfColors !== undefined) {
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(albedoColors), 3))
    geometry.setAttribute('baked', new BufferAttribute(new Float32Array(colors), 3))
  }

  geometry.boundsTree = new MeshBVH(geometry)

  return new Mesh(geometry, material)
}

export function meshToArxPolygons(_mesh: Mesh): ArxPolygon[] {
  // TODO
  return []
}
