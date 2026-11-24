import type { ArxPolygon } from 'arx-convert/types'
import type { FaceUv } from '../../../../../generator/arxMap/uvs.ts'
import { sameUvs, uvsOf } from './geometry.ts'
import type { UvMismatch, UvPoint, UvSelection, UvSelectionInput } from './types.ts'

/**
 * The order the mismatches are read in, and the sentence of the widget: the uv first (it is what the widget edits), the
 * texture after it.
 */
const UV_MISMATCH_ORDER: readonly UvMismatch[] = ['uv', 'textures']

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
  const name = textureNameOf(first.textureContainerId)
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
    // the faces of a mismatch may be on one texture or on many: the name is only a fact when they share it, and a
    // container the level has no name for has none to show (the `#id` of `textureOf` is there for the comparison only)
    let shownName: string | undefined = name

    if (otherTexture) {
      shownName = undefined
    }

    return { kind: 'mismatch', reasons, textureName: shownName }
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
