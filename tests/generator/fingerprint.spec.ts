import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fingerprintOf } from '../../src/generator/fingerprint.ts'

/**
 * Builds a file of the test.
 *
 * @param values The bytes it holds.
 *
 * @returns The bytes as a buffer.
 */
function fileOf(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

void describe('fingerprintOf', () => {
  void it('gives the same bytes the same fingerprint', () => {
    assert.equal(fingerprintOf(fileOf(1, 2, 3)), fingerprintOf(fileOf(1, 2, 3)))
  })

  void it('tells two files apart when one byte moves', () => {
    assert.notEqual(fingerprintOf(fileOf(1, 2, 3)), fingerprintOf(fileOf(1, 2, 4)))
  })

  void it('tells two files apart when one byte is added', () => {
    assert.notEqual(fingerprintOf(fileOf(1, 2, 3)), fingerprintOf(fileOf(1, 2, 3, 0)))
  })

  void it('carries the length of the file', () => {
    assert.match(fingerprintOf(fileOf(1, 2, 3)), /^[0-9a-f]{8}:3$/u)
  })

  void it('gives an empty file a fingerprint too', () => {
    assert.match(fingerprintOf(fileOf()), /^[0-9a-f]{8}:0$/u)
  })
})
