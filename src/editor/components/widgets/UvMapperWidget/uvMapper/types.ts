import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'

/**
 * A point of the texture, in the 0..1 space of the uv.
 */
export type UvPoint = {
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
export type StagePoint = {
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
 * What the mapper draws: the square of the widget, the zoom and the place the view is centered on.
 */
export type UvView = {
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
   * so they stay under the eye. A face whose uv runs past the texture (a wall that tiles) is centered the same way, and
   * the texture around it is drawn repeated, the way the game draws it.
   */
  readonly center: UvPoint
}

/**
 * The face a uv mapper widget edits: the faces of the selection that share their texture and their uv, and the one set
 * of corners they draw with.
 */
export type ShownFace = {
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
 * Why the widget can not edit a selection of more than one face.
 *
 * @remarks
 * Two faces with the same texture and the same uv can be edited together — their corners are one quad on the texture, so
 * the drag moves the same thing on all of them. Anything else is refused, and the widget says which of the two differs.
 */
export type UvMismatch = 'textures' | 'uv'

/**
 * What the widget can do with the selection.
 *
 * @remarks
 * `empty` is nothing selected, `ready` is one face — or many that share a texture and a uv —, and `mismatch` is many
 * faces the widget can not edit together. The ready selection carries the **faces** it edits (all of them) and the one
 * set of corners they share. A mismatch carries the **name of the texture** the faces are on, when they share one: the
 * widget can not edit them, but it can still show what they are painted with.
 */
export type UvSelection =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'mismatch'
      readonly reasons: readonly UvMismatch[]
      readonly textureName: string | undefined
    }
  | { readonly kind: 'ready'; readonly faces: readonly number[]; readonly corners: readonly UvPoint[] }

/**
 * The selection, as the widget reads it.
 */
export type UvSelectionInput = {
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
