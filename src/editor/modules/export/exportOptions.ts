import { NEW_QUEST_LEVEL_INDEX } from '../level/blankLevel.ts'

/**
 * The two numbers the export dialog lets the user set, and the rules they follow.
 *
 * @remarks
 * The dialog is the last look at the level before the archive is written (2026-11-06, the owner's request), so the two
 * values a mod is known by are there: the **seed** the level was made with, and the **level index** it takes in the data
 * directory. The rules are here, away from the `.vue`, so they are unit-tested.
 */

/**
 * The smallest index the dialog accepts: the level 0 is the first one of the game.
 */
export const MIN_LEVEL_INDEX = 0

/**
 * Reads the level index of the field.
 *
 * @remarks
 * The field is optional, and a field that is not a number is not an error of the user to fix: the export writes the map
 * of a new quest then. A negative number is read as 0, because the game has no level before the first one.
 *
 * @param text The text of the field.
 *
 * @returns The index: 0 at the smallest, {@link NEW_QUEST_LEVEL_INDEX} for an empty or a broken field.
 */
export function levelIndexOf(text: string): number {
  const value = text.trim()

  if (value === '') {
    return NEW_QUEST_LEVEL_INDEX
  }

  const index = Number.parseInt(value, 10)

  if (!Number.isSafeInteger(index)) {
    return NEW_QUEST_LEVEL_INDEX
  }

  return Math.max(MIN_LEVEL_INDEX, index)
}

/**
 * Reads the seed of the field.
 *
 * @param text The text of the field.
 *
 * @returns The seed, or `undefined` when the field is empty (the archive keeps no seed then).
 */
export function exportSeedOf(text: string): string | undefined {
  const value = text.trim()

  if (value === '') {
    return undefined
  }

  return value
}
