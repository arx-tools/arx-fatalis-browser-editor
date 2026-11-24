/**
 * The uv mapper: the geometry of the uv square, the turns of the corners and the selection of a face.
 *
 * @remarks
 * The parts live in files of their own: `uvMapper/types.ts` (the shapes), `uvMapper/geometry.ts` (the projection, the
 * pan and the zoom), `uvMapper/turn.ts` (the turns and the quarters of the square) and `uvMapper/selection.ts` (what the
 * widget shows of a selection). This module names what the widget and its composables read, so a part can move inside
 * the folder without a change outside it.
 */

export type {
  ShownFace,
  StagePoint,
  UvMismatch,
  UvPoint,
  UvSelection,
  UvSelectionInput,
  UvTurn,
  UvView,
} from './uvMapper/types.ts'
export {
  MAX_ZOOM,
  MIN_ZOOM,
  DEFAULT_ZOOM,
  centerOfUvs,
  clampUv,
  containsFacePoint,
  cornerNameOf,
  movedCorner,
  movedUvs,
  numberOfText,
  pannedBy,
  perimeterOf,
  sameUvs,
  screenOfUv,
  snappedPoint,
  uvOfScreen,
  uvsOf,
  viewOf,
  zoomAfter,
} from './uvMapper/geometry.ts'
export { maximizedUvs, quarterOfUvs, quarteredUvs, turnedUvs } from './uvMapper/turn.ts'
export { mismatchMessageOf, uvSelectionOf, uvsOfFace } from './uvMapper/selection.ts'
