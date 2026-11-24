/**
 * A slice of a buffer, counted in vertices.
 */
export type VertexRun = {
  /**
   * Where the slice starts, in vertices.
   */
  readonly from: number
  /**
   * How many vertices it holds.
   */
  readonly count: number
}

/**
 * A slice of a buffer, with the buffer it comes from.
 */
export type VertexSegment = VertexRun & {
  /**
   * The buffer to read.
   */
  readonly source: Float32Array
}

/**
 * The runs of a buffer that stay when some of its polygons go.
 *
 * @remarks
 * A level is edited by taking polygons out, and the geometry of a mesh is a flat list of the vertices of its
 * polygons: a polygon owns `3` vertices (a triangle), `6` (a quad) or, in the wireframe, `6`/`8` (two vertices per
 * edge of the perimeter). The kept polygons are therefore a few **runs** of the buffer — a delete takes a few out,
 * so the most of it is one or two runs, and copying them is a handful of `set` calls instead of one per polygon.
 *
 * The kept polygons **keep their order**, so a triangle stays at the same place divided by three: that is what the
 * pick reads (`face.a / 3`) and what the triangle map is built on.
 *
 * @param counts How many vertices every polygon of the buffer owns, in the order of the buffer.
 * @param kept Which of the polygons stay, in the same order.
 *
 * @returns The runs to copy, in the order of the buffer.
 */
export function keptRuns(counts: readonly number[], kept: readonly boolean[]): VertexRun[] {
  const runs: VertexRun[] = []
  let from = 0
  let runFrom = 0
  let runCount = 0

  for (const [index, count] of counts.entries()) {
    if (kept[index]) {
      if (runCount === 0) {
        runFrom = from
      }

      runCount = runCount + count
    } else if (runCount > 0) {
      runs.push({ from: runFrom, count: runCount })
      runCount = 0
    }

    from = from + count
  }

  if (runCount > 0) {
    runs.push({ from: runFrom, count: runCount })
  }

  return runs
}

/**
 * Copies slices of buffers into one buffer.
 *
 * @remarks
 * It is the write side of {@link keptRuns} — and of an undo: a step that puts polygons back takes the kept runs from
 * the live geometry and the polygons themselves from a geometry built for them, and the two are interleaved by the
 * order of the segments.
 *
 * @param segments The slices to copy, in the order they go into the new buffer.
 * @param itemSize How many numbers one vertex holds (3 for the position, 2 for the uv).
 *
 * @returns The new buffer.
 */
export function copyVertexSegments(segments: readonly VertexSegment[], itemSize: number): Float32Array {
  let vertexCount = 0

  for (const segment of segments) {
    vertexCount = vertexCount + segment.count
  }

  const target = new Float32Array(vertexCount * itemSize)
  let to = 0

  for (const segment of segments) {
    target.set(
      segment.source.subarray(segment.from * itemSize, (segment.from + segment.count) * itemSize),
      to * itemSize,
    )
    to = to + segment.count
  }

  return target
}
