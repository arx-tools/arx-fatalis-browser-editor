import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { usedVerticesOf } from '../../../../generator/polygons.ts'
import type { FaceUv } from '../../../../generator/arxMap/uvs.ts'

/**
 * How far the uv mapper can zoom out: the texture at **half** the size of the square.
 *
 * @remarks
 * The face of a level is often bigger than the square (a wall tiled with many faces), and a corner on the border of the
 * texture is easier to aim at when the whole texture is smaller: half the square shows the texture and a margin of the
 * repeat around it.
 */
export const MIN_ZOOM = 0.5

/**
 * The zoom the mapper opens at: the texture a little **inside** the square, with a margin of the repeat around it.
 *
 * @remarks
 * It was the whole square (1), and the owner asked for 0.8 (2026-11-06): the border of the face stays visible on the
 * screenshot of the texture, so a corner on the edge of the face is easier to aim at than a corner on the edge of the
 * square.
 */
export const DEFAULT_ZOOM = 0.8

/**
 * How far it can zoom in: a corner a few pixels apart on the texture.
 */
export const MAX_ZOOM = 8

/**
 * The names of the corners of a face, in the order the model holds them.
 *
 * @remarks
 * The corners are the **letters** of the face (2026-11-09, the owner's request): the handles on the square and the list
 * under it read A, B, C and D, the way the uv of a face is written down. A face of the level has three or four corners,
 * so only the first three or four names are used, and the colours of the handles follow the order.
 */
const CORNER_NAMES = ['A', 'B', 'C', 'D'] as const

/**
 * Reads the name of a corner, for the handles and the list of the corners.
 *
 * @remarks
 * A corner past the letters keeps its number, so a face with more corners than the letters is still readable.
 *
 * @param index The corner, in the order the model holds them.
 *
 * @returns The letter of the corner, or its number when the letters are used up.
 */
export function cornerNameOf(index: number): string {
  return CORNER_NAMES[index] ?? String(index + 1)
}

/**
 * How much one pixel of the wheel turns the zoom.
 *
 * @remarks
 * The exponential keeps every step the same size, whatever the current zoom is, and the wheel back is always the exact
 * inverse of the wheel in — the same step the fixed views use.
 */
const WHEEL_STEP = 0.0015

/**
 * A point of the texture, in the 0..1 space of the uv.
 */
export interface UvPoint {
  /**
   * The column of the texture, from the left.
   */
  readonly u: number
  /**
   * The row of the texture, from the bottom (the way the renderer reads it).
   */
  readonly v: number
}

/**
 * A point of the widget, in pixels from the top left of its square.
 */
export interface StagePoint {
  /**
   * The column, in pixels.
   */
  readonly x: number
  /**
   * The row, in pixels.
   */
  readonly y: number
}

/**
 * The uv in the middle of the corners of a face.
 *
 * @remarks
 * It is where the square is centred **when a face arrives** (the selection, the level, a reload). After that the view
 * stays where it is, and the corners move under it: a face dragged by its yellow must not chase the view (2026-11-06,
 * the owner: *"mindig középre akarja igazítani a kijelölést … csak inicializáláskor igazítsa"*).
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns The middle of them, or the middle of the texture when the face has no corner.
 */
export function centreOfUvs(corners: readonly UvPoint[]): UvPoint {
  if (corners.length === 0) {
    return { u: 0.5, v: 0.5 }
  }

  const u =
    corners.reduce((sum, corner) => {
      return sum + corner.u
    }, 0) / corners.length
  const v =
    corners.reduce((sum, corner) => {
      return sum + corner.v
    }, 0) / corners.length

  return { u, v }
}

/**
 * What the mapper draws: the square of the widget, the zoom and the place the view is centred on.
 */
export interface UvView {
  /**
   * The side of the square, in pixels.
   */
  readonly size: number
  /**
   * The zoom: 1 shows the texture at the size of the square.
   */
  readonly zoom: number
  /**
   * The uv the middle of the square shows.
   *
   * @remarks
   * The drag of a corner keeps the **face** in the middle of the widget: the corners of the face are what the user moves,
   * so they stay under the eye. A face whose uv runs past the texture (a wall that tiles) is centred the same way, and
   * the texture around it is drawn repeated, the way the game draws it.
   */
  readonly centre: UvPoint
}

/**
 * The face a uv mapper widget edits: the faces of the selection that share their texture and their uv, and the one set
 * of corners they draw with.
 */
export interface ShownFace {
  /**
   * The level the faces belong to.
   */
  readonly map: ArxMap
  /**
   * The faces, all of them drawing with the same corners on the same texture.
   */
  readonly indices: readonly number[]
  /**
   * The first of them: the one the caption names the texture by.
   */
  readonly polygon: ArxPolygon
}

/**
 * The view in the middle of the face: nothing is panned.
 */
const NO_PAN: UvPoint = { u: 0, v: 0 }

/**
 * The uv of the corners of a face.
 *
 * @param polygon The face to read.
 *
 * @returns Three points for a triangle, four for a quad, in the order the polygon stores them.
 */
export function uvsOf(polygon: ArxPolygon): UvPoint[] {
  return usedVerticesOf(polygon).map((vertex) => {
    return { u: vertex.u, v: vertex.v }
  })
}

/**
 * Keeps a uv inside the texture.
 *
 * @remarks
 * The game's levels keep the uv of a face inside 0..1 (a tiled wall is a texture the level repeats by naming it on many
 * faces), and a corner dragged past the edge would draw a stretched edge texel. The drag therefore stops at the border,
 * and the same clamp holds the numbers a test writes.
 *
 * @param point The uv to keep.
 *
 * @returns The uv, with both of its numbers inside 0..1.
 */
export function clampUv(point: UvPoint): UvPoint {
  return {
    u: Math.min(1, Math.max(0, point.u)),
    v: Math.min(1, Math.max(0, point.v)),
  }
}

/**
 * Reads the view of the widget.
 *
 * @param size The side of the square, in pixels.
 * @param zoom How far the view is zoomed in.
 * @param corners The corners of the face, whose middle is the place the view is centred on.
 * @param pan How far the view was dragged away from that middle, in uv units.
 *
 * @returns The view, ready to map a uv to a pixel.
 */
export function viewOf(size: number, zoom: number, corners: readonly UvPoint[], pan: UvPoint = NO_PAN): UvView {
  const centre = centreOfUvs(corners)

  return { size, zoom, centre: { u: centre.u + pan.u, v: centre.v + pan.v } }
}

/**
 * The pixel of a uv in the view.
 *
 * @param view The view of the widget.
 * @param uv The point of the texture.
 *
 * @returns Where it is on the square: x from the left, y from the top.
 */
export function screenOfUv(view: UvView, uv: UvPoint): StagePoint {
  const middle = view.size / 2
  const scale = view.size * view.zoom
  const across = (uv.u - view.centre.u) * scale
  const down = (uv.v - view.centre.v) * scale

  // the v of a level runs **down the file**: the game uploads the image as it is (its first row is the top) and the
  // renderer reads the texture from the bottom, so a v of 0 is the top row of the image — the 3D view draws a face with
  // the texture turned this way, and the mapper has to agree with it (2026-11-04, the owner's polygon 20026)
  return { x: middle + across, y: middle + down }
}

/**
 * The corners of a face, in the order of its perimeter.
 *
 * @remarks
 * The four corners of a quad are **not** around it: `a` and `b` are one edge and `c` and `d` the one across, so the
 * perimeter is `a, b, d, c` (the stored order `a, b, c, d` crosses itself and draws a bow tie). A triangle walks its
 * stored order.
 *
 * @param corners The uv of the corners, as the model holds them.
 *
 * @returns The corner indices, walked around the face.
 */
export function perimeterOf(corners: readonly UvPoint[]): number[] {
  if (corners.length === 4) {
    return [0, 1, 3, 2]
  }

  return corners.map((_corner, index) => {
    return index
  })
}

/**
 * The points of the perimeter of the face, on the square.
 *
 * @param corners The uv of the corners, as the model holds them.
 * @param view What the square draws.
 *
 * @returns The place of each of them on the square, in pixels.
 */
function perimeterPoints(corners: readonly UvPoint[], view: UvView): StagePoint[] {
  return perimeterOf(corners).map((index) => {
    return screenOfUv(view, corners[index] ?? { u: 0, v: 0 })
  })
}

/**
 * Tells whether a point of the square is inside the face.
 *
 * @remarks
 * The yellow of the square is the face itself, and a press on it moves the whole face (2026-11-06, the owner's request),
 * so the point is tested against the **perimeter** of the corners — the shape the square fills — with a ray cast: an
 * edge of the perimeter counts when it crosses the ray under the point, and an odd number of crossings means inside.
 *
 * @param corners The uv of the corners, as the model holds them.
 * @param view What the square draws.
 * @param point Where the pointer is, in the pixels of the square.
 *
 * @returns True when the point is inside the face.
 */
export function containsFacePoint(corners: readonly UvPoint[], view: UvView, point: StagePoint): boolean {
  if (corners.length < 3) {
    return false
  }

  const polygon = perimeterPoints(corners, view)
  let inside = false
  let last = polygon.at(-1)

  for (const current of polygon) {
    const previous = last

    last = current

    if (previous === undefined) {
      continue
    }

    // a horizontal edge crosses no ray, and the slope below would be the one of a zero rise
    const below = previous.y > point.y
    const above = current.y > point.y

    if (below === above) {
      continue
    }

    const run = current.x - previous.x
    const rise = current.y - previous.y
    const slope = run / rise
    const along = slope * (point.y - previous.y)
    const crossing = along + previous.x

    if (point.x < crossing) {
      inside = !inside
    }
  }

  return inside
}

/**
 * The step one coordinate of the corners may take and still stay on the 0..1 of the texture.
 *
 * @param step The step the pointer asked for.
 * @param min The smallest uv of the corners along the axis.
 * @param max The biggest one.
 *
 * @returns The step, shortened when a corner would leave the texture. A face that is wider than the texture can not be
 * kept inside it, and it moves freely.
 */
function limitedStep(step: number, min: number, max: number): number {
  const lower = -min
  const upper = 1 - max

  if (lower > upper) {
    return step
  }

  return Math.min(Math.max(step, lower), upper)
}

/**
 * Moves the corners of a face together, as far as the texture lets them.
 *
 * @remarks
 * The owner's request (2026-11-06): the yellow of the square is the face, and dragging it moves **every corner** by the
 * same step, so a face that draws a piece of a wall keeps its shape. A face that fits in the texture slides until one of
 * its corners reaches the edge — no corner leaves the 0..1 of the texture, the way a single corner does not either
 * (`clampUv`); a face that is wider than the texture has no placement inside it, and it moves freely.
 *
 * @param corners The uv of the corners, as the model holds them.
 * @param delta The step of the pointer, in uv.
 *
 * @returns The corners, moved.
 */
export function movedUvs(corners: readonly UvPoint[], delta: UvPoint): UvPoint[] {
  const us = corners.map((corner) => {
    return corner.u
  })
  const vs = corners.map((corner) => {
    return corner.v
  })
  const du = limitedStep(delta.u, Math.min(...us), Math.max(...us))
  const dv = limitedStep(delta.v, Math.min(...vs), Math.max(...vs))

  return corners.map((corner) => {
    return { u: corner.u + du, v: corner.v + dv }
  })
}

/**
 * The uv of a pixel of the view.
 *
 * @param view The view of the widget.
 * @param point The pixel, from the top left of the square.
 *
 * @returns The uv it shows, kept inside the texture.
 */
export function uvOfScreen(view: UvView, point: StagePoint): UvPoint {
  const middle = view.size / 2
  const scale = view.size * view.zoom
  const across = (point.x - middle) / scale
  const down = (point.y - middle) / scale

  return clampUv({ u: view.centre.u + across, v: view.centre.v + down })
}

/**
 * The centre of the view after the texture was dragged.
 *
 * @remarks
 * The drag moves the **content** with the pointer: the texture under the hand stays under it, and the view slides the
 * other way. The drag is in pixels of the square, and the centre is in uv: one pixel of the square is `1 / (size * zoom)`
 * of the texture, so a zoomed square pans the same picture with a smaller step of the uv.
 *
 * @param pan The uv the view is centred on now.
 * @param delta How far the pointer went, in pixels of the square.
 * @param size The side of the square, in pixels.
 * @param zoom How far the view is zoomed in.
 *
 * @returns The pan after the drag.
 */
export function pannedBy(pan: UvPoint, delta: StagePoint, size: number, zoom: number): UvPoint {
  const scale = size * zoom
  const across = delta.x / scale
  const down = delta.y / scale

  return { u: pan.u - across, v: pan.v - down }
}

/**
 * The zoom after a turn of the wheel.
 *
 * @param zoom The zoom now.
 * @param deltaY How far the wheel turned, in pixels.
 *
 * @returns The zoom, between {@link MIN_ZOOM} and {@link MAX_ZOOM}.
 */
export function zoomAfter(zoom: number, deltaY: number): number {
  const next = zoom * Math.exp(-deltaY * WHEEL_STEP)

  return Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
}

/**
 * Reads a number a user typed into a field.
 *
 * @remarks
 * An empty field, a lone minus or a half typed decimal is **not** a number: the model is left alone until the text is
 * one (an empty string would be a zero, and the corner would jump to the corner of the texture on the first keystroke of
 * a new number). A comma is read as the decimal point, the way a Hungarian keyboard writes it.
 *
 * @param text The text of the field.
 *
 * @returns The number, or `undefined` when the text is not one.
 */
export function numberOfText(text: string): number | undefined {
  const clean = text.trim().replace(',', '.')

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(clean)) {
    return undefined
  }

  const value = Number(clean)

  if (!Number.isFinite(value)) {
    return undefined
  }

  return value
}

/**
 * The turns the widget can lay the corners of a face on: they move the uv around the corners, and the set of the uv
 * values stays the same.
 *
 * @remarks
 * The owner asked for the four of them (2026-11-05) with the icons of the editor: `rotate-ccw`, `rotate-cw` and the two
 * flips. A turn is a **permutation of the corners**, not a new uv: a texture that came in rotated or mirrored on a face
 * is fixed by laying its corners on other corners, so the area of the texture the face takes stays the same.
 */
export type UvTurn = 'flip-h' | 'flip-v' | 'rotate-ccw' | 'rotate-cw'

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

/**
 * The step of the snap of a drag: 90 degrees, in radians.
 *
 * @remarks
 * The owner asked for the four axes only (0, 90, 180 and 270 degrees): a corner of a texture moves along the u or the v
 * of the face, not on the diagonals (2026-11-05). {@link snappedPoint} rounds to the nearest multiple of this.
 */
const SNAP_STEP = Math.PI / 2

/**
 * The point a drag goes to when the snap is on: the pointer laid on the nearest axis of the drag.
 *
 * @remarks
 * The axis starts at the corner as it was when the drag began, and the pointer is **projected** onto it (not the length
 * kept): a hand that goes a little to the side stays on the axis, which is what the snap is for — a wall's texture is
 * as wide as the wall above it, not a degree off. Only the horizontal and the vertical of the screen are allowed, and
 * the mapping to the uv is uniform, so the same axes hold on the texture.
 *
 * @param origin The corner the drag started from, in pixels of the square.
 * @param point The pointer, in pixels of the square.
 *
 * @returns The point of the axis the corner takes.
 */
export function snappedPoint(origin: StagePoint, point: StagePoint): StagePoint {
  const across = point.x - origin.x
  const down = point.y - origin.y
  const steps = Math.round(Math.atan2(down, across) / SNAP_STEP)
  const angle = steps * SNAP_STEP
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  const acrossPart = across * direction.x
  const downPart = down * direction.y
  const along = acrossPart + downPart
  const x = direction.x * along
  const y = direction.y * along

  return { x: origin.x + x, y: origin.y + y }
}

/**
 * The uv of the corners of a face after one of them moved.
 *
 * @param corners The uv of the corners, as the model holds them.
 * @param index Which one moved.
 * @param uv The place it takes.
 *
 * @returns The corners, with the moved one in place and the others untouched.
 */
export function movedCorner(corners: readonly UvPoint[], index: number, uv: UvPoint): UvPoint[] {
  return corners.map((corner, position) => {
    if (position !== index) {
      return corner
    }

    return clampUv(uv)
  })
}

/**
 * Tells whether two sets of corners are the same.
 *
 * @param first The corners of a face.
 * @param second The corners of the same face.
 *
 * @returns True when every corner sits on the same uv.
 */
export function sameUvs(first: readonly UvPoint[], second: readonly UvPoint[]): boolean {
  if (first.length !== second.length) {
    return false
  }

  return first.every((corner, index) => {
    const other = second[index]

    return other !== undefined && Math.abs(corner.u - other.u) < 1e-6 && Math.abs(corner.v - other.v) < 1e-6
  })
}

/**
 * Why the widget can not edit a selection of more than one face.
 *
 * @remarks
 * Two faces with the same texture and the same uv can be edited together — their corners are one quad on the texture, so
 * the drag moves the same thing on all of them. Anything else is refused, and the widget says which of the two differs.
 */
export type UvMismatch = 'textures' | 'uv'

/**
 * The order the mismatches are read in, and the sentence of the widget: the uv first (it is what the widget edits), the
 * texture after it.
 */
const UV_MISMATCH_ORDER: readonly UvMismatch[] = ['uv', 'textures']

/**
 * What the widget can do with the selection.
 *
 * @remarks
 * `empty` is nothing selected, `ready` is one face — or many that share a texture and a uv —, and `mismatch` is many
 * faces the widget can not edit together. The ready selection carries the **faces** it edits (all of them) and the one
 * set of corners they share.
 */
export type UvSelection =
  | { readonly kind: 'empty' }
  | { readonly kind: 'mismatch'; readonly reasons: readonly UvMismatch[] }
  | { readonly kind: 'ready'; readonly faces: readonly number[]; readonly corners: readonly UvPoint[] }

/**
 * The selection, as the widget reads it.
 */
export interface UvSelectionInput {
  /**
   * The selected faces, by their index in the level.
   */
  readonly indices: readonly number[]
  /**
   * Every polygon of the level.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The name of the texture of a container, or `undefined` when the level has no container with the id.
   */
  readonly textureNameOf: (textureContainerId: number) => string | undefined
}

/**
 * The texture a face draws with, as the widget compares it.
 *
 * @param polygon The face.
 * @param textureNameOf The name of the texture of a container.
 *
 * @returns The name of the container, or the id of it when the level has no name for it.
 */
function textureOf(polygon: ArxPolygon, textureNameOf: (textureContainerId: number) => string | undefined): string {
  const name = textureNameOf(polygon.textureContainerId)

  if (name === undefined) {
    return `#${String(polygon.textureContainerId)}`
  }

  return name
}

/**
 * Reads the selection: one face, many faces that share their texture and their uv, or why not.
 *
 * @remarks
 * The **texture** is compared by the name of its container (two containers may name the same file), and the uv by the
 * corners of the face, with the same tolerance as the rest of the editor ({@link sameUvs}). A triangle and a quad can
 * never share their uv: their corner count differs, which is a uv mismatch like any other.
 *
 * A selected index the level does not have is skipped (an undo of a delete may move the indices before the selection is
 * dropped).
 *
 * @param input The selection and the level it points at.
 *
 * @returns What the widget can do with it.
 */
export function uvSelectionOf(input: UvSelectionInput): UvSelection {
  const { indices, polygons, textureNameOf } = input
  const faces: number[] = []
  const found: ArxPolygon[] = []

  for (const index of indices) {
    const polygon = polygons[index]

    if (polygon !== undefined) {
      faces.push(index)
      found.push(polygon)
    }
  }

  const [first, ...rest] = found

  if (first === undefined) {
    return { kind: 'empty' }
  }

  const texture = textureOf(first, textureNameOf)
  const corners = uvsOf(first)
  const otherTexture = rest.some((polygon) => {
    return textureOf(polygon, textureNameOf) !== texture
  })
  const otherUv = rest.some((polygon) => {
    return !sameUvs(corners, uvsOf(polygon))
  })
  const reasons = UV_MISMATCH_ORDER.filter((reason) => {
    if (reason === 'textures') {
      return otherTexture
    }

    return otherUv
  })

  if (reasons.length > 0) {
    return { kind: 'mismatch', reasons }
  }

  return { kind: 'ready', faces, corners }
}

/**
 * The sentence of the widget for a selection it can not edit.
 *
 * @param reasons The mismatches, in the order the widget shows them.
 *
 * @returns The message, like `Can't edit UV on selection: mismatching UV mapping, mismatching textures`.
 */
export function mismatchMessageOf(reasons: readonly UvMismatch[]): string {
  const parts = reasons.map((reason) => {
    if (reason === 'textures') {
      return 'mismatching textures'
    }

    return 'mismatching UV mapping'
  })

  return `Can't edit UV on selection: ${parts.join(', ')}`
}

/**
 * The uv of a face, the way the model holds it.
 *
 * @param corners Where each of them sits on the texture.
 *
 * @returns The uvs, in the shape a step of the history holds.
 */
export function uvsOfFace(corners: readonly UvPoint[]): FaceUv[] {
  return corners.map((corner) => {
    return { u: corner.u, v: corner.v }
  })
}
