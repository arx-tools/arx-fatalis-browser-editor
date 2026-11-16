/**
 * The number of the last change of the level, from the palette cache's point of view.
 *
 * @remarks
 * The baked palette of a level and a profile is cached (see `lighting.ts`), so a dropdown change does not compute the
 * same light again. A step of the history or an undo changes the geometry, the lights or the palette length, and the
 * palette of the cache is stale from then on: the version is bumped with every such change, and a cache entry is only
 * used while its version is the current one.
 */
let version = 0

/**
 * Reads the version a cached palette has to carry to be usable.
 *
 * @returns The number of the last change.
 */
export function lightingCacheVersion(): number {
  return version
}

/**
 * Tells the cache that the level changed, so every palette baked before it is stale.
 */
export function bumpLightingCacheVersion(): void {
  version = version + 1
}
