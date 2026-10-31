import seedrandom, { type PRNG } from 'seedrandom'

/**
 * Creates a random seed.
 *
 * @remarks
 * The same shape the `arx-level-generator` uses: a number between a hundred million and a billion, as a
 * string, so it reads well in the url. The seed itself comes from `Math.random`, the numbers a level chooses
 * with come from the seeded generator below.
 *
 * @returns The seed, nine digits.
 */
export function createRandomSeed(): string {
  const lowest = 100_000_000
  const span = 999_999_999 - lowest + 1
  const offset = Math.random() * span

  return Math.floor(offset + lowest).toString()
}

/**
 * The pseudo random number generator the generator code draws from.
 *
 * @remarks
 * The whole point of the seed is that a level comes out the same way twice: everything that needs a random
 * number asks for it here, and this one is seeded by {@link setSeed}. The module keeps its own generator
 * instead of replacing the global `Math.random` (the `arx-level-generator` does that, in a process of its
 * own): the editor shares its page with the dock and with three, and those take ids from `Math.random` — a
 * seeded global would hand out the same id twice.
 */
let generator: PRNG = seedrandom(createRandomSeed())

/**
 * Starts the random number generator over from a seed.
 *
 * @param seed The seed to draw from: the same seed gives the same numbers.
 */
export function setSeed(seed: string): void {
  generator = seedrandom(seed)
}

/**
 * Reads a number between zero (inclusive) and one (exclusive), the way `Math.random` does.
 *
 * @returns The next number of the seeded sequence.
 */
export function random(): number {
  return generator()
}

/**
 * Reads a random floating point number between two values.
 *
 * @param a The lower bound, inclusive.
 * @param b The upper bound, exclusive.
 *
 * @returns The number.
 */
export function randomBetween(a: number, b: number): number {
  const span = b - a
  const offset = random() * span

  return a + offset
}

/**
 * Reads a random integer between two values.
 *
 * @param min The lower bound, inclusive.
 * @param max The upper bound, inclusive.
 *
 * @returns The integer.
 */
export function randomIntBetween(min: number, max: number): number {
  const low = Math.ceil(min)
  const span = Math.floor(max) - low + 1
  const offset = random() * span

  return Math.floor(offset + low)
}

/**
 * Picks one item of a list, at random.
 *
 * @param items The list to pick from.
 *
 * @returns The item.
 */
export function pickRandom<T>(items: readonly T[]): T {
  return items[randomIntBetween(0, items.length - 1)]
}
