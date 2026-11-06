import { persistedRef } from '../persistedRef/persistedRef.ts'

/**
 * The seed the generator draws its random numbers from.
 *
 * @remarks
 * It lives **in the url** (`?seed=123456789`), so a link carries the level that was made from it: the same
 * seed gives the same level, and a refresh keeps the one that is open. There is no default: the level makes
 * its own seed when the url has none (`ArxMap` starts the generator with it), and the map writes it back
 * here, so the url carries the level that is on screen.
 */
export const levelSeed = persistedRef<string | undefined>({
  key: 'seed',
  persistInUrl: true,
  persistInLocalStorage: true,
  // the seed is text everywhere it is shown (the field of the export, the manifest of the archive), so the url is read
  // as the text it carries: the default reader parses a number, and `Settings` takes a string (2026-11-06)
  urlDeserialize: (raw) => {
    return raw
  },
})
