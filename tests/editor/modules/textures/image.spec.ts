import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { averageColorOfPixels } from '../../../../src/editor/modules/textures/image.ts'

void describe('averageColorOfPixels', () => {
  void it('gives the average of the pixels', () => {
    // two opaque pixels: the average of each channel
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 30, 40, 50, 255])

    assert.deepEqual(averageColorOfPixels(pixels, 2, 1), [20, 30, 40])
  })

  void it('leaves the transparent pixels out', () => {
    // the second pixel is transparent: its colour, even a white one, is not part of the average of the fence
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 255, 255, 255, 0])

    assert.deepEqual(averageColorOfPixels(pixels, 2, 1), [10, 20, 30])
  })

  void it('rounds the average to whole bytes', () => {
    // the average of the red channel is 10.67
    const pixels = new Uint8ClampedArray([10, 0, 0, 255, 11, 0, 0, 255, 11, 0, 0, 255])

    assert.deepEqual(averageColorOfPixels(pixels, 3, 1), [11, 0, 0])
  })

  void it('gives nothing when every pixel is transparent', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 0])

    assert.equal(averageColorOfPixels(pixels, 2, 1), undefined)
  })

  void it('gives nothing for no pixel', () => {
    assert.equal(averageColorOfPixels(new Uint8ClampedArray(), 0, 0), undefined)
  })
})
