import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Color } from '../../src/generator/Color.ts'

void describe('Color.lighten', () => {
  void it('adds a percentage of the full scale to every channel', () => {
    const color = Color.black.lighten(50)

    // the hundredth of the scale is not exact in floating point: (255 / 100) * 50 = 127.49999999999999
    assert.deepEqual(
      [color.r, color.g, color.b].map((channel) => {
        return Number(channel.toFixed(2))
      }),
      [127.5, 127.5, 127.5],
    )
  })

  void it('leaves the color alone at zero percent', () => {
    const color = new Color(10, 20, 30).lighten(0)

    assert.deepEqual([color.r, color.g, color.b], [10, 20, 30])
  })

  void it('stops at the top of the scale', () => {
    // a channel is a byte in the file: above 255 there is nothing to add
    const color = new Color(200, 200, 200).lighten(100)

    assert.deepEqual([color.r, color.g, color.b], [255, 255, 255])
  })

  void it('keeps the alpha of the color', () => {
    const color = new Color(0, 0, 0, 0.5).lighten(50)

    assert.equal(color.a, 0.5)
  })
})

void describe('Color.darken', () => {
  void it('subtracts a percentage of the full scale from every channel', () => {
    const color = Color.white.darken(50)

    // the hundredth of the scale is not exact in floating point: (255 / 100) * 50 = 127.49999999999999
    assert.deepEqual(
      [color.r, color.g, color.b].map((channel) => {
        return Number(channel.toFixed(2))
      }),
      [127.5, 127.5, 127.5],
    )
  })

  void it('leaves the color alone at zero percent', () => {
    const color = new Color(10, 20, 30).darken(0)

    assert.deepEqual([color.r, color.g, color.b], [10, 20, 30])
  })

  void it('stops at the bottom of the scale', () => {
    const color = new Color(40, 40, 40).darken(100)

    assert.deepEqual([color.r, color.g, color.b], [0, 0, 0])
  })

  void it('keeps the alpha of the color', () => {
    const color = new Color(255, 255, 255, 0.25).darken(50)

    assert.equal(color.a, 0.25)
  })
})
