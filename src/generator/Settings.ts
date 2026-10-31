import { createRandomSeed, setSeed } from './random.ts'

/**
 * What a level is made with.
 *
 * @remarks
 * The `arx-level-generator` keeps a `Settings` class for everything a level is built from, and this is the
 * same idea for the editor: the seed today, and whatever a level needs later (the lighting mode of the
 * export, the level it is made from). Its constructor **starts the generator**: a `Settings` and the numbers
 * a level draws come in one step, so a level can not be built with one seed and drawn with another.
 *
 * There is no node and no browser variant and no interface over them: the editor only ever runs in a browser,
 * and a second shape would be code without a second user. The class is the seam, and it is one place to add
 * a field.
 */
export interface SettingsOptions {
  /**
   * The seed of the level. When it is missing, a fresh one is made.
   */
  readonly seed?: string
}

/**
 * The settings of a level.
 */
export class Settings {
  /**
   * The seed every random number of the level comes from.
   *
   * @remarks
   * Nine digits, and the same one makes the same level: the editor keeps it in the url.
   */
  readonly seed: string

  constructor(options: SettingsOptions = {}) {
    this.seed = options.seed ?? createRandomSeed()

    setSeed(this.seed)
  }
}
