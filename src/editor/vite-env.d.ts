/**
 * The compile time values the vite config injects.
 *
 * `define` replaces the identifier in the bundle, so the declaration has to exist for the type
 * checker: without it every reference to the build info would be an unknown global.
 */

/**
 * The version, the commit and the build date of this build (`vite.config.ts`, `buildInfo`).
 */
declare const BUILD_INFO: string

/**
 * The same build in parts, for the block the manifest of an export carries: the name of the program, the
 * version, the commit, the day it was made, and where its code lives (`vite.config.ts`).
 */
declare const EDITOR_INFO: {
  readonly name: string
  readonly version: string
  readonly commit: string
  readonly builtAt: string
  readonly url: string
}
