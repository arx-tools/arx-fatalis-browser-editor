import { BufferAttribute, BufferGeometry } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

type TypedArray = Float32Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array

/**
 * Removes whole triangles from a non-indexed geometry, keeping **every** vertex attribute (the
 * position, normal, uv and the baked LLF color) and rebuilding the BVH.
 *
 * The triangles are identified by their index in the geometry - the same index the raycast gives
 * through `face.a / 3`. The deletion is O(vertices) instead of rebuilding the geometry from all
 * polygons, which is what made deleting a face slow.
 */
export function removeTriangles(geometry: BufferGeometry, removedTriangleIndices: ReadonlySet<number>): BufferGeometry {
  const position = geometry.getAttribute('position')
  const triangleCount = position.count / 3
  const keptTriangleIndices: number[] = []

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    if (!removedTriangleIndices.has(triangle)) {
      keptTriangleIndices.push(triangle)
    }
  }

  const newGeometry = new BufferGeometry()

  for (const [name, bufferAttribute] of Object.entries(geometry.attributes)) {
    const attribute = bufferAttribute as BufferAttribute
    const source = attribute.array as TypedArray
    const { itemSize, normalized } = attribute
    const ArrayConstructor = source.constructor as new (length: number) => TypedArray
    const newArray = new ArrayConstructor(keptTriangleIndices.length * 3 * itemSize)
    let writeIndex = 0

    for (const triangle of keptTriangleIndices) {
      const from = triangle * 3 * itemSize
      const triangleSize = 3 * itemSize
      const to = from + triangleSize
      newArray.set(source.subarray(from, to), writeIndex)
      writeIndex = writeIndex + triangleSize
    }

    newGeometry.setAttribute(name, new BufferAttribute(newArray, itemSize, normalized))
  }

  newGeometry.boundsTree = new MeshBVH(newGeometry)

  return newGeometry
}
