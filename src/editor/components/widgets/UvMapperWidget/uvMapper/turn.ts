import type { UvPoint, UvTurn } from './types.ts'

/**
 * The corners of a face in the order they go around it.
 *
 * @remarks
 * The stored order of a quad is two edges (`a-b` and `c-d`), so the way around it is `a, b, d, c`; a triangle goes
 * around as it is stored.
 */
const AROUND_QUAD = [0, 1, 3, 2]

const AROUND_TRIANGLE = [0, 1, 2]

/**
 * The pairs of the corners a flip swaps.
 *
 * @param count How many corners the face has.
 * @param turn Which flip it is.
 *
 * @returns The pairs, as indices of the corners.
 */
function swappedByFlip(count: number, turn: 'flip-h' | 'flip-v'): Array<[number, number]> {
  const quad = count === 4

  if (turn === 'flip-h') {
    if (quad) {
      return [
        [0, 1],
        [2, 3],
      ]
    }

    return [[0, 1]]
  }

  if (quad) {
    return [
      [0, 2],
      [1, 3],
    ]
  }

  return [[0, 2]]
}

/**
 * The corner whose uv each corner takes, for a turn.
 *
 * @param count How many corners the face has.
 * @param turn Which turn it is.
 *
 * @returns One index per corner: where the uv of the corner comes from.
 */
function permutationOf(count: number, turn: UvTurn): number[] {
  const identity = Array.from({ length: count }, (_, index) => {
    return index
  })

  if (turn === 'flip-h' || turn === 'flip-v') {
    const result = [...identity]

    for (const [one, other] of swappedByFlip(count, turn)) {
      result[one] = other
      result[other] = one
    }

    return result
  }

  let around = AROUND_TRIANGLE

  if (count === 4) {
    around = AROUND_QUAD
  }

  const result = [...identity]

  // the corners of a face go around it **counter-clockwise** as the face is seen (the mapper draws the texture the way
  // the 3D view shows it, see `screenOfUv`), so the picture on the face turns **clockwise** when every corner takes the
  // uv of the one after it: the content of a corner moves a step back on the ring. The name is the way the **picture**
  // turns, not the way the uvs travel (2026-11-06, the owner: the icons were the other way around).
  let step = 1

  if (turn === 'rotate-ccw') {
    step = around.length - 1
  }

  for (const [place, index] of around.entries()) {
    const from = around[(place + step) % around.length] ?? index

    result[index] = from
  }

  return result
}

/**
 * Lays the corners of a face on other corners of it.
 *
 * @remarks
 * A turn is a **permutation of the corners**, not a new uv: a texture that came in rotated or mirrored on a face is
 * fixed by laying its corners on other corners, so the area of the texture the face takes stays the same (2026-11-05,
 * the owner: *"csak a vertexeket cserélgeti … az UV értékek nem változnak"*). `rotate-cw` turns the **picture on the
 * face** a quarter clockwise, `rotate-ccw` the other way (the uvs travel the opposite way, because the picture moves
 * to where the uvs came from), and the two flips swap the pairs that sit across the middle of the face.
 *
 * @param corners The corners as they are.
 * @param turn Which way to lay them.
 *
 * @returns The corners, with the uv of one on another.
 */
export function turnedUvs(corners: readonly UvPoint[], turn: UvTurn): UvPoint[] {
  if (corners.length < 3) {
    return corners.map((corner) => {
      return { ...corner }
    })
  }

  const order = permutationOf(corners.length, turn)

  return corners.map((corner, index) => {
    const source = corners[order[index] ?? index] ?? corner

    return { ...source }
  })
}

/**
 * How far one quarter of the texture reaches, in uv.
 */
const QUARTER = 0.5

/**
 * The top left point of every quarter of the texture, **clockwise from the top left one**.
 *
 * @remarks
 * The two buttons of the footer walk these in this order: `Layout grid` puts the corners of a quad in one quarter of the
 * texture and takes them to the next one on every click, and the picture on the face walks the texture clockwise.
 */
const QUARTER_ORIGINS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [QUARTER, 0],
  [QUARTER, QUARTER],
  [0, QUARTER],
]

/**
 * How far two uvs may be apart and still be the same point of a quarter, in uv.
 *
 * It only has to swallow the rounding of the values the buttons write: a dragged corner is a quarter of a texture away
 * from the points of its quarter, so the buttons take it to the top left one.
 */
const QUARTER_EPSILON = 1e-6

/**
 * The uv of the four corners of a rectangle of the texture.
 *
 * @remarks
 * The corner 0 takes the top left point, 1 the top right, 2 the bottom left and 3 the bottom right. The stored order of
 * a face is a **bowtie** (`a, b, c, d` crosses itself) and its perimeter walks `a, b, d, c`, so the corner 2 is the
 * bottom left and the corner 3 the bottom right — the order of this function is the order of the corners of the model.
 *
 * @param u0 The left edge of the rectangle.
 * @param v0 The top edge of it.
 * @param u1 The right edge of it.
 * @param v1 The bottom edge of it.
 *
 * @returns One point per corner.
 */
function rectUvs(u0: number, v0: number, u1: number, v1: number): UvPoint[] {
  return [
    { u: u0, v: v0 },
    { u: u1, v: v0 },
    { u: u0, v: v1 },
    { u: u1, v: v1 },
  ]
}

/**
 * The four points of a quarter of the texture.
 *
 * @param quarter The quarter, in the order of {@link QUARTER_ORIGINS}.
 *
 * @returns One point per corner of a quad.
 */
function quarterUvs(quarter: number): UvPoint[] {
  const origin = QUARTER_ORIGINS[quarter] ?? QUARTER_ORIGINS[0]

  return rectUvs(origin[0], origin[1], origin[0] + QUARTER, origin[1] + QUARTER)
}

/**
 * Orders two corners by their place on the texture: left to right, and top to bottom on the same column.
 *
 * @param left The first corner.
 * @param right The second one.
 *
 * @returns A negative number when the first comes earlier, a positive one when it comes later.
 */
function pointOrder(left: UvPoint, right: UvPoint): number {
  if (left.u !== right.u) {
    return left.u - right.u
  }

  return left.v - right.v
}

/**
 * Copies the corners, so a caller can not change the state of the widget through the list it gets back.
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns A copy of every corner.
 */
function copiedCorners(corners: readonly UvPoint[]): UvPoint[] {
  return corners.map((corner) => {
    return { ...corner }
  })
}

/**
 * Tells whether two lists of corners hold the same points, whatever their order.
 *
 * @param first The corners as they are.
 * @param second The points of a quarter.
 *
 * @returns True when every corner sits on a point of the quarter, and the quarter has no point left.
 */
function samePoints(first: readonly UvPoint[], second: readonly UvPoint[]): boolean {
  const sortedFirst = [...first].toSorted(pointOrder)
  const sortedSecond = [...second].toSorted(pointOrder)

  return sortedFirst.every((point, index) => {
    const other = sortedSecond[index]

    if (other === undefined) {
      return false
    }

    return Math.abs(point.u - other.u) < QUARTER_EPSILON && Math.abs(point.v - other.v) < QUARTER_EPSILON
  })
}

/**
 * The quarter of the texture the corners of a quad sit on, when they sit on one.
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns The quarter (0: top left, 1: top right, 2: bottom right, 3: bottom left), or `undefined` when the corners
 * are not the four points of one quarter.
 */
export function quarterOfUvs(corners: readonly UvPoint[]): number | undefined {
  if (corners.length !== 4) {
    return undefined
  }

  for (let quarter = 0; quarter < QUARTER_ORIGINS.length; quarter = quarter + 1) {
    if (samePoints(corners, quarterUvs(quarter))) {
      return quarter
    }
  }

  return undefined
}

/**
 * Lays the corners of a quad on the four points of the top left quarter, each on the point it is closest to.
 *
 * @remarks
 * A point of the quarter takes **one** corner: the corners are paired with the points by their distance, the closest pair
 * first, so two corners that both sit near the middle of the texture do not land on the same point and leave a hole in
 * the quarter. The corners stay in their own order, so a corner keeps the side of the quarter it was on.
 *
 * @param corners The corners of the quad.
 *
 * @returns One point of the top left quarter per corner.
 */
function placeInTopLeftQuarter(corners: readonly UvPoint[]): UvPoint[] {
  const points = quarterUvs(0)
  const pairs: Array<{ readonly corner: number; readonly point: number; readonly distance: number }> = []

  for (const [corner, uv] of corners.entries()) {
    for (const [point, target] of points.entries()) {
      pairs.push({ corner, point, distance: Math.hypot(target.u - uv.u, target.v - uv.v) })
    }
  }

  pairs.sort((left, right) => {
    return left.distance - right.distance
  })

  const placed: Array<UvPoint | undefined> = corners.map(() => {
    return undefined
  })
  const takenPoints = new Set<number>()

  for (const pair of pairs) {
    if (placed[pair.corner] !== undefined || takenPoints.has(pair.point)) {
      continue
    }

    placed[pair.corner] = points[pair.point]
    takenPoints.add(pair.point)
  }

  return placed.map((point, index) => {
    if (point !== undefined) {
      return { ...point }
    }

    return { ...(corners[index] ?? { u: 0, v: 0 }) }
  })
}

/**
 * Lays the corners of a quad in a quarter of the texture, and takes them to the next one on every call.
 *
 * @remarks
 * The owner's request (2026-11-06): a face that draws one quarter of its texture (four faces of a wall, one per quarter)
 * is set up by two clicks of this button. The corners of a quad that sit on a quarter go to the **next** quarter,
 * clockwise from the top left one (0, 0 → 0.5, 0 → 0.5, 0.5 → 0, 0.5). The corners of anything else go to the **top
 * left** quarter, each on the 0 or the 0.5 point it is closer to — and they stay in the order they are, so the same
 * corner keeps the same point.
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns The corners of the quarter, or the corners themselves when the face is not a quad.
 */
export function quarteredUvs(corners: readonly UvPoint[]): UvPoint[] {
  if (corners.length !== 4) {
    return copiedCorners(corners)
  }

  const quarter = quarterOfUvs(corners)

  if (quarter === undefined) {
    return placeInTopLeftQuarter(corners)
  }

  return quarterUvs((quarter + 1) % QUARTER_ORIGINS.length)
}

/**
 * Stretches the corners of a quad over the whole texture: `0/0` in the top left corner, `1/1` in the bottom right one.
 *
 * @remarks
 * The other button of the owner's request (2026-11-06): a quad that draws a part of its texture (a piece of a wall the
 * level repeats, a face that came in shorter than the picture) takes the whole picture with one click. The corner 0
 * takes the top left point, 1 the top right, 2 the bottom left and 3 the bottom right, so a face that was mirrored on
 * the texture is not mirrored any more.
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns The four corners of the texture, or the corners themselves when the face is not a quad.
 */
export function maximizedUvs(corners: readonly UvPoint[]): UvPoint[] {
  if (corners.length !== 4) {
    return copiedCorners(corners)
  }

  return rectUvs(0, 0, 1, 1)
}
