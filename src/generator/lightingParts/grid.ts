import type { ArxLLF, ArxLight } from 'arx-convert/types'
import type { Vector3 } from 'three'
import type { LightGrid, LightGridCache } from './types.ts'

/**
 * The size of a cell of the light grid, in the units of the level.
 *
 * @remarks
 * A corner reads the lights of its own cell and the ones that reach too far to be put in cells: on a level of a city a
 * cell of this size holds a few lights, against the five hundred a bake of the level reads.
 */
const LIGHT_CELL_SIZE = 512

/**
 * The number of cells a light may be registered in.
 *
 * @remarks
 * A light that reaches over a big part of the level would be in thousands of cells, and a corner would read it almost
 * everywhere: it goes to the list of the whole level instead.
 */
const LIGHT_CELL_LIMIT = 4096

/**
 * The fewest lights a bake reads before the grid is worth its lookups.
 */
const LIGHT_GRID_MINIMUM = 16

/**
 * The hash of a cell of the grid.
 *
 * @remarks
 * Two cells may share a hash: the grid then holds the lights of both, and the bake tests them and leaves the ones out
 * that do not reach. A collision costs a few tests, never a light.
 *
 * @param x The cell on the first axis.
 * @param y The cell on the second one.
 * @param z The cell on the third one.
 *
 * @returns The number the cells are stored under.
 */
function cellHashOf(x: number, y: number, z: number): number {
  return (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ Math.imul(z, 83_492_791)) >>> 0
}

/**
 * The cell of a corner of the level.
 *
 * @param position The corner, in the frame of the scene.
 *
 * @returns The number its cell is stored under.
 */
export function cellHashOfPosition(position: Vector3): number {
  return cellHashOf(
    Math.floor(position.x / LIGHT_CELL_SIZE),
    Math.floor(position.y / LIGHT_CELL_SIZE),
    Math.floor(position.z / LIGHT_CELL_SIZE),
  )
}

/**
 * Builds the grid of the lights of a bake.
 *
 * @param lights The lights of the bake, with their position in the frame of the scene.
 *
 * @returns The grid, or `undefined` when the bake reads too few lights for it to pay off.
 */
function buildLightGridOf(
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
): LightGrid | undefined {
  if (lights.length < LIGHT_GRID_MINIMUM) {
    return undefined
  }

  const cells = new Map<number, number[]>()
  const everywhere: number[] = []

  /**
   * Puts a light into one cell of the grid.
   *
   * @param x The cell on the first axis.
   * @param y The cell on the second one.
   * @param z The cell on the third one.
   * @param index The light, by its index in the bake.
   */
  function addToCellOf(x: number, y: number, z: number, index: number): void {
    const hash = cellHashOf(x, y, z)
    let cell = cells.get(hash)

    if (cell === undefined) {
      cell = []
      cells.set(hash, cell)
    }

    // two cells may share a hash, and a light that covers both comes twice: the repeats of a light are side by side,
    // because the walk fills the cells of a light in one go
    if (cell.at(-1) !== index) {
      cell.push(index)
    }
  }

  for (const [index, { light, position }] of lights.entries()) {
    const reach = light.fallEnd

    if (reach <= 0) {
      continue
    }

    const firstX = Math.floor((position.x - reach) / LIGHT_CELL_SIZE)
    const lastX = Math.floor((position.x + reach) / LIGHT_CELL_SIZE)
    const firstY = Math.floor((position.y - reach) / LIGHT_CELL_SIZE)
    const lastY = Math.floor((position.y + reach) / LIGHT_CELL_SIZE)
    const firstZ = Math.floor((position.z - reach) / LIGHT_CELL_SIZE)
    const lastZ = Math.floor((position.z + reach) / LIGHT_CELL_SIZE)
    const count = (lastX - firstX + 1) * (lastY - firstY + 1) * (lastZ - firstZ + 1)

    if (count > LIGHT_CELL_LIMIT) {
      everywhere.push(index)

      continue
    }

    for (let x = firstX; x <= lastX; x = x + 1) {
      for (let y = firstY; y <= lastY; y = y + 1) {
        for (let z = firstZ; z <= lastZ; z = z + 1) {
          addToCellOf(x, y, z, index)
        }
      }
    }
  }

  return { cells, everywhere }
}

/**
 * Tells whether two lists of lights stand where the grid was built.
 *
 * @remarks
 * The place and the reach of every light are what the cells hold. The color and the intensity of a
 * light do not move it, so a drag of them keeps the grid of the level.
 *
 * @param one The lights the grid was built from.
 * @param other The lights of the bake now.
 *
 * @returns True when the two lists place the same lights the same way.
 */
function placesEveryLightOf(one: readonly ArxLight[], other: readonly ArxLight[]): boolean {
  if (one.length !== other.length) {
    return false
  }

  for (const [index, light] of one.entries()) {
    const candidate = other[index]

    if (
      candidate?.position.x !== light.position.x ||
      candidate?.position.y !== light.position.y ||
      candidate?.position.z !== light.position.z ||
      candidate?.fallEnd !== light.fallEnd
    ) {
      return false
    }
  }

  return true
}

/**
 * The grids of the levels, by their lighting.
 */
const lightGrids = new WeakMap<ArxLLF, LightGridCache>()

/**
 * Reads the grid of a level, and builds it when it is missing or stale.
 *
 * @param llf The lighting of the level: the cache is keyed by it.
 * @param lights The lights of the bake, with their position in the frame of the scene.
 *
 * @returns The grid, or `undefined` when the bake reads too few lights for it to pay off.
 */
export function lightGridOf(
  llf: ArxLLF,
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
): LightGrid | undefined {
  if (lights.length < LIGHT_GRID_MINIMUM) {
    return undefined
  }

  const placed = lights.map((entry) => {
    return entry.light
  })
  const cached = lightGrids.get(llf)

  if (cached !== undefined && placesEveryLightOf(cached.lights, placed)) {
    return cached.grid
  }

  const grid = buildLightGridOf(lights)

  if (grid === undefined) {
    return undefined
  }

  lightGrids.set(llf, { grid, lights: placed })

  return grid
}
