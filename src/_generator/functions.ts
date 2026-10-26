/**
 * Takes a percentage of a number.
 *
 * @remarks
 * - the subject (`x`) comes first, like `MathUtils.clamp` in three: there is no currying in the
 * level generator, so the arguments read left to right
 *
 * @param x The number to take the percentage of.
 * @param percentage The percentage, 0..100.
 * @returns `percentage` percent of `x`.
 */
export function percentOf(x: number, percentage: number): number {
  return (x / 100) * percentage
}
