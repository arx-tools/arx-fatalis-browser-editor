import { persistedRef } from '../persistedRef/persistedRef.ts'

/**
 * The name of the author of the archive.
 *
 * @remarks
 * It is the one value of the export dialog that is a fact of the **person**, not of the level: the name is written once
 * and the next export starts from it. The level's own name and its page come from the zip the level came from
 * (`manifest.json`), so they are not asked here.
 *
 * The key is the one of the storage, and it does not change: a name already typed stays in the browser.
 */
export const authorName = persistedRef<string>({
  key: 'exportAuthorName',
  defaultValue: '',
  persistInLocalStorage: true,
})

/**
 * The homepage of the project of the archive.
 *
 * @remarks
 * It is where the **level** is published (a mod site, a website of its own), not where the author is: the manifest keeps
 * it under the `project` block, and a zip of another build put the same address in a `url` key.
 */
export const projectHomepage = persistedRef<string>({
  key: 'exportProjectHomepage',
  defaultValue: '',
  persistInLocalStorage: true,
})
