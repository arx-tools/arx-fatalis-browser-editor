/**
 * How many faces the mesh draws, and how they are split into triangles of the geometry.
 */
export interface FaceCounts {
  /**
   * The faces the mesh was built from: a triangle or a quad, not a triangle of the geometry.
   */
  readonly faceCount: number
  /**
   * The faces that are a single triangle.
   */
  readonly triangleCount: number
  /**
   * The faces that are a quad, which the geometry splits into two triangles.
   */
  readonly quadCount: number
}

/**
 * Counts the faces of a mesh from the map that groups its triangles.
 *
 * @remarks
 * The count comes **from the mesh**: the geometry is built one face at a time, and the triangle map remembers
 * which triangles belong to which face (see `triangleToPolygonMap`). So a face with a single triangle is a
 * triangle and a face with two of them is a quad — the quad flags of the file are not read, and a later edit
 * that changes the geometry is counted as it is.
 *
 * @param triangleToPolygon The polygon index of every triangle, in the order of the geometry.
 *
 * @returns The number of faces, and the triangles and the quads among them.
 */
export function countFacesOfTriangles(triangleToPolygon: readonly number[]): FaceCounts {
  const trianglesOf = new Map<number, number>()

  for (const polygon of triangleToPolygon) {
    trianglesOf.set(polygon, (trianglesOf.get(polygon) ?? 0) + 1)
  }

  let triangleCount = 0
  let quadCount = 0

  for (const triangles of trianglesOf.values()) {
    if (triangles === 1) {
      triangleCount = triangleCount + 1

      continue
    }

    quadCount = quadCount + 1
  }

  return { faceCount: trianglesOf.size, triangleCount, quadCount }
}
