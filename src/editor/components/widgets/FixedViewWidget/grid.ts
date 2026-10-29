import type { Vector3 } from 'three'
import type { CameraBounds } from '../cameraBounds.ts'
import type { CameraViewMode } from './cameraAlign.ts'

/**
 * How many cells the framed span of a view should hold at most.
 *
 * @remarks
 * The cell size is the "nice" step at or above `span / TARGET_CELLS`, so the number of the lines stays
 * readable and the cell of a deeper zoom is always a smaller nice number — that is the subdivision: the
 * grid does not get one huge square, it steps down as the camera walks in.
 */
const TARGET_CELLS = 12

/**
 * The size of a grid cell on the two axes of a fixed view, in world units.
 */
export interface GridLayout {
  /**
   * One cell, a "nice" number: 1, 2 or 5 times a power of ten.
   */
  readonly cell: number
  /**
   * How many cells cover the framed span of the view.
   */
  readonly divisions: number
}

/**
 * The two axes of the level the grid of a direction lies on.
 *
 * @remarks
 * The game's axes, so a 500 unit cell means 500 units on the map: the top and the bottom show X and Z, the
 * front and the back X and Y, the left and the right Z and Y.
 */
export function gridAxes(mode: CameraViewMode): { readonly first: 'x' | 'y' | 'z'; readonly second: 'x' | 'y' | 'z' } {
  if (mode === 'top' || mode === 'bottom') {
    return { first: 'x', second: 'z' }
  }

  if (mode === 'front' || mode === 'back') {
    return { first: 'x', second: 'y' }
  }

  return { first: 'z', second: 'y' }
}

/**
 * The largest side of the box of the level, in world units.
 *
 * @param bounds The box of the level, in the game's coordinates.
 *
 * @returns The longest of the three sizes.
 */
export function largestSide(bounds: CameraBounds): number {
  return Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z)
}

/**
 * Rounds a value up to the next "nice" number: 1, 2 or 5 times a power of ten.
 *
 * @param value The value to round up (a positive number).
 *
 * @returns The smallest nice number that is at least `value`.
 */
export function niceStep(value: number): number {
  if (value <= 0) {
    return 1
  }

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude

  if (normalized <= 1) {
    return magnitude
  }

  if (normalized <= 2) {
    return 2 * magnitude
  }

  if (normalized <= 5) {
    return 5 * magnitude
  }

  return 10 * magnitude
}

/**
 * The grid of a view: the cell size and how many of them cover the framed span.
 *
 * @param span The world size the view shows across, in the units of the level.
 *
 * @returns The cell size and the number of the divisions.
 */
export function gridOf(span: number): GridLayout {
  const cell = niceStep(span / TARGET_CELLS)

  return { cell, divisions: Math.max(Math.ceil(span / cell), 1) }
}

/**
 * Where the grid of a view is anchored, in the space of the meshes.
 *
 * @remarks
 * The lines of the grid stand at whole multiples of the cell (so a line means the same place in the level
 * whatever the view shows), and the grid is centred on the point the view looks at, snapped to that grid.
 * The third axis, the one the view looks along, keeps the depth of the target: the lines are drawn in the
 * plane of the view.
 *
 * @param target The point the view looks at, in the space of the meshes.
 * @param mode The direction of the view: which two axes the grid lies on.
 * @param cell The cell size, in the units of the level.
 *
 * @returns The corner of the grid, in the space of the meshes.
 */
export function gridOrigin(target: Vector3, mode: CameraViewMode, cell: number): Vector3 {
  const axes = gridAxes(mode)
  const origin = target.clone()

  origin[axes.first] = Math.floor(target[axes.first] / cell) * cell
  origin[axes.second] = Math.floor(target[axes.second] / cell) * cell

  return origin
}
