import { ArxPolygonFlags } from 'arx-convert/types'
import type { TripleOf } from 'arx-convert/utils'

/**
 * Sleeps for the given time, the loading and the export sequences use it to let the browser paint.
 *
 * @param delayInMs The time to wait in milliseconds.
 */
export async function wait(delayInMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, delayInMs)
  })
}

/**
 * Rounds a number to the given number of decimals.
 *
 * @remarks
 * - the maths is the same as in `arx-level-generator/src/helpers.ts`, but the arguments are the
 * other way around: the subject (`x`) comes first, like `MathUtils.clamp` in three, because there
 * is no currying here
 *
 * @param x The number to round.
 * @param decimals How many decimals to keep.
 * @returns The rounded number.
 */
export function roundToNDecimals(x: number, decimals: number): number {
  // `@stylistic/no-mixed-operators` asks for `x * (10 ** decimals)`, prettier strips those parens,
  // so the factor is a temporary instead (the same maths, no fighting linters)
  const factor = 10 ** decimals

  return Math.round(x * factor) / factor
}

/**
 * Rounds every part of a triplet to two decimals, the form the camera pose goes into the url with.
 *
 * @remarks
 * - `TripleOf<T>` is the type the triplet has, the way a `DoubleOf<T>` is a twin and a `QuadrupleOf<T>`
 * is a quadruplet
 * - the destructuring is in the body because the jsdoc rules want a named parameter
 *
 * @param value The triplet to round.
 * @returns The triplet with two decimals in every part.
 */
export function roundTriplet(value: TripleOf<number>): TripleOf<number> {
  const [x, y, z] = value

  return [roundToNDecimals(x, 2), roundToNDecimals(y, 2), roundToNDecimals(z, 2)]
}

export function isTransparent(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.Transparent) !== 0
}

export function isDoubleSided(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.DoubleSided) !== 0
}

export function isNoDraw(flags: ArxPolygonFlags): boolean {
  return (flags & ArxPolygonFlags.NoDraw) !== 0
}

/**
 * Parses a comma separated triplet, for example a `1,2,3` url parameter.
 *
 * @remarks
 * - the text is the serialized form, the result is a triplet: `TripleOf<T>` is the type it has, the
 * way a `DoubleOf<T>` is a twin and a `QuadrupleOf<T>` is a quadruplet
 *
 * @param raw The text to parse.
 * @returns The triplet, or undefined when the text is not three finite numbers.
 */
export function parseNumberTriplet(raw: string): TripleOf<number> | undefined {
  const parts = raw.split(',').map((part) => {
    return Number.parseFloat(part.trim())
  })

  if (parts.length !== 3) {
    return undefined
  }

  if (
    parts.some((part) => {
      return !Number.isFinite(part)
    })
  ) {
    return undefined
  }

  // the length is three and every part is a finite number, so the cast to the tuple is safe
  return parts as TripleOf<number>
}
