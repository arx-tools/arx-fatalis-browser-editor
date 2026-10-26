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
