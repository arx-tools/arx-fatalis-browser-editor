import { implode } from 'node-pkware/simple'

/**
 * Compresses the body of a level file, the way the game's files are stored.
 *
 * @remarks
 * The DLF and the FTS keep their fixed header and compress the body behind it; the game reads them back the same way
 * (`arx-convert` writes the header, and the body it leaves possible to compress). A file of a data directory is packed
 * like this, so a level the editor writes goes through the **same** loader as an original one.
 *
 * @param raw The file as `arx-convert` writes it: the header, then the body.
 * @param headerSize Where the header ends and the compressed body starts.
 *
 * @returns The packed file, ready for the game or for {@link ArxMap}.
 */
export function packLevelFile(raw: ArrayBuffer, headerSize: number): ArrayBuffer {
  const head = new Uint8Array(raw.slice(0, headerSize))
  const body = new Uint8Array(implode(raw.slice(headerSize), 'binary', 'large'))
  const packed = new Uint8Array(head.length + body.length)

  packed.set(head, 0)
  packed.set(body, head.length)

  return packed.buffer
}

/**
 * Compresses a whole level file.
 *
 * @remarks
 * The LLF is compressed from its first byte (there is no fixed header the game reads before the compression), so the
 * whole file goes through the compressor.
 *
 * @param raw The file as `arx-convert` writes it.
 *
 * @returns The packed file.
 */
export function packWholeFile(raw: ArrayBuffer): ArrayBuffer {
  return new Uint8Array(implode(raw, 'binary', 'large')).buffer
}
