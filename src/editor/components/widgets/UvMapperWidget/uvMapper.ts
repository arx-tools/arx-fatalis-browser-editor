import type { ArxPolygon } from 'arx-convert/types'
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
 * The zoom the mapper opens at: the texture at the size of the square.
 */
export const DEFAULT_ZOOM = 1

/**
 * How far it can zoom in: a corner a few pixels apart on the texture.
 */
export const MAX_ZOOM = 8

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
  let u = 0.5
  let v = 0.5

  if (corners.length > 0) {
    u =
      corners.reduce((sum, corner) => {
        return sum + corner.u
      }, 0) / corners.length
    v =
      corners.reduce((sum, corner) => {
        return sum + corner.v
      }, 0) / corners.length
  }

  return { size, zoom, centre: { u: u + pan.u, v: v + pan.v } }
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
 * The pan after the texture was dragged.
 *
 * @remarks
 * The drag moves the **content** with the pointer: the texture under the hand stays under it, and the view slides the
 * other way. The drag is in pixels of the square, and the pan is in uv: one pixel of the square is `1 / (size * zoom)` of
 * the texture, so a zoomed square pans the same picture with a smaller step of the uv.
 *
 * @param pan The pan now.
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

  // the uv of a corner goes to the one after it around the face (cw), or to the one before it (ccw)
  let step = 1

  if (turn === 'rotate-cw') {
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
 * the owner: *"csak a vertexeket cserélgeti … az UV értékek nem változnak"*). `rotate-cw` sends the uv of a corner to
 * the one after it around the face, `rotate-ccw` to the one before it, and the two flips swap the pairs that sit across
 * the middle of the face.
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
 * @param corners The corners of the face.
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
