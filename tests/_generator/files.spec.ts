import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DLF_HEADER_SIZE } from 'arx-header-size'
import { implode } from 'node-pkware/simple'
import { unpackArxFile } from '../../src/_generator/files.ts'

/**
 * The payload of the test: a small, compressible block of bytes.
 *
 * @returns The bytes to pack.
 */
function payload(): Uint8Array {
  return Uint8Array.from({ length: 400 }, (_, index) => {
    return index % 7
  })
}

/**
 * Builds a partially compressed DLF: the fixed header, then the compressed body.
 *
 * @returns The packed file.
 */
function packedDlf(): ArrayBuffer {
  const header = new Uint8Array(DLF_HEADER_SIZE)
  const compressed = implode(payload().buffer, 'binary', 'small')
  const body = new Uint8Array(compressed)
  const packed = new Uint8Array(header.length + body.length)
  packed.set(header, 0)
  packed.set(body, header.length)

  return packed.buffer
}

void describe('unpackArxFile', () => {
  void it('decompresses the body behind the header', () => {
    const unpacked = unpackArxFile(packedDlf(), 'dlf')

    // the header stays, the body comes back
    assert.equal(unpacked.byteLength, DLF_HEADER_SIZE + payload().length)
    assert.deepEqual(new Uint8Array(unpacked, DLF_HEADER_SIZE), payload())
  })

  void it('keeps an uncompressed fts as it is', () => {
    // the FTS header marks the whole file uncompressed when the size at byte 264 is zero
    const packed = new ArrayBuffer(280)
    const view = new DataView(packed)
    view.setInt32(256, 0, true)
    view.setInt32(264, 0, true)

    const unpacked = unpackArxFile(packed, 'fts')

    assert.equal(unpacked, packed)
  })
})
