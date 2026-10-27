import { getHeaderSize } from 'arx-header-size'
import { concatArrayBuffers, explode, sliceArrayBufferAt } from 'node-pkware/simple'

/**
 * The formats of an Arx level the loader reads.
 */
export type ArxFileFormat = 'dlf' | 'fts' | 'llf'

/**
 * Unpacks one Arx file, which is partially or fully compressed.
 *
 * @remarks
 * - the files come out of the PAK partially compressed: a header stays readable, and the body behind it
 * is a `blast()` stream. `arx-header-size` tells where the header ends: the DLF has a fixed 8520 byte
 * header, the FTS has 280 bytes plus 768 per unique header, and an FTS whose size field is zero is not
 * compressed at all
 * - the LLF has no header: the whole file is compressed, which is the same code path, because the
 * header size is zero there
 * - the unpacked file is the header again followed by the decompressed body, exactly what the parser of
 * `arx-convert` expects
 *
 * @param packed The file as it came out of the PAK.
 * @param format Which of the three files it is.
 *
 * @returns The unpacked file: the same bytes the game's parser reads.
 *
 * @throws When the body is not a valid `blast()` stream.
 */
export function unpackArxFile(packed: ArrayBuffer, format: ArxFileFormat): ArrayBuffer {
  const { total, compression } = getHeaderSize(packed, format)

  if (compression === 'none') {
    return packed
  }

  const [header, body] = sliceArrayBufferAt(packed, total)

  return concatArrayBuffers([header, explode(body)])
}
