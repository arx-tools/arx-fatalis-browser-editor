import type { ManifestAuthor, ManifestProject } from '../../../generator/manifest.ts'
import { NEW_QUEST_LEVEL_INDEX } from '../level/blankLevel.ts'

/**
 * The values the export dialog lets the user set, and the rules they follow.
 *
 * @remarks
 * The dialog is the last look at the level before the archive is written (2026-11-06, the owner's request), so the
 * values a mod is known by are there: the **seed** the level was made with, the **level index** it takes in the data
 * directory, and the **author** of the level with their page. The rules are here, away from the `.vue`, so they are
 * unit-tested.
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

/**
 * Reads the author of the archive from the field of the dialog.
 *
 * @remarks
 * An empty field is not written at all (a manifest says what it knows), and no name means no author block: the archive
 * says nothing about who made the level, which is what a level of the game is.
 *
 * @param name The text of the name field.
 *
 * @returns The block to write, or `undefined` when the field is empty.
 */
export function authorOf(name: string): ManifestAuthor | undefined {
  const authorName = name.trim()

  if (authorName === '') {
    return undefined
  }

  return { name: authorName }
}

/**
 * Reads the project of the archive from the field of the dialog.
 *
 * @remarks
 * The page of the level, not of the person: a mod site or a website the author keeps for the level. An empty field means
 * no project block, and the project of the zip the level came from is kept then (see `buildExportManifest`).
 *
 * @param homepage The text of the homepage field.
 *
 * @returns The block to write, or `undefined` when the field is empty.
 */
export function projectOf(homepage: string): ManifestProject | undefined {
  const projectHomepage = homepage.trim()

  if (projectHomepage === '') {
    return undefined
  }

  return { homepage: projectHomepage }
}
