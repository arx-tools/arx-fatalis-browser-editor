/**
 * The FNV-1a prime the fingerprint multiplies with.
 */
const FNV_PRIME = 0x01_00_01_93

/**
 * The start of the FNV-1a hash.
 */
const FNV_OFFSET_BASIS = 0x81_1c_9d_c5

/**
 * How many hex digits the hash of the fingerprint takes.
 */
const HEX_WIDTH = 8

/**
 * Makes a short fingerprint of a file.
 *
 * @remarks
 * The stored steps of the history carry **indices of the polygons** of a level, so they may only be replayed on the
 * very file they were made on: a level that was regenerated, rewritten or replaced with another build has another
 * polygon order, and a replay would change other faces than the ones the author picked. The fingerprint tells the
 * stored steps from those of another file.
 *
 * It is an FNV-1a over the bytes (a few tens of milliseconds on the packed scene of level 11, once per load) with the
 * length, which is enough for this: it is not a security hash, it only has to tell two builds of a level apart.
 *
 * @param bytes The file to read.
 *
 * @returns The fingerprint: eight hex digits of the hash, a colon, and the length of the file in hex.
 */
export function fingerprintOf(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let hash = FNV_OFFSET_BASIS

  for (const byte of view) {
    hash = hash ^ byte
    hash = Math.imul(hash, FNV_PRIME)
  }

  return `${(hash >>> 0).toString(16).padStart(HEX_WIDTH, '0')}:${view.length.toString(16)}`
}
