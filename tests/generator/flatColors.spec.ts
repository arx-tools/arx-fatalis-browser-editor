import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { Color, SRGBColorSpace } from 'three'
import {
  clearRegisteredFlatColors,
  flatColorOf,
  hasGameFlatColor,
  registerFlatColor,
  wireframeLineColorOf,
  type FlatColor,
} from '../../src/generator/flatColors.ts'

/**
 * Reads the display HSL of a colour of the vertex colours (the linear space three draws with).
 *
 * @param color The colour, linear `0..1`.
 *
 * @returns The hue, the saturation and the lightness, in display values.
 */
function hslOf(color: FlatColor): { h: number; s: number; l: number } {
  const value = new Color().setRGB(color[0], color[1], color[2])
  const hsl = { h: 0, s: 0, l: 0 }

  value.getHSL(hsl, SRGBColorSpace)

  return hsl
}

/**
 * Reads the display HSL of a flat colour (sRGB bytes).
 *
 * @param color The flat colour.
 *
 * @returns The hue, the saturation and the lightness, in display values.
 */
function flatHslOf(color: FlatColor): { h: number; s: number; l: number } {
  const value = new Color().setRGB(color[0] / 255, color[1] / 255, color[2] / 255, SRGBColorSpace)
  const hsl = { h: 0, s: 0, l: 0 }

  value.getHSL(hsl, SRGBColorSpace)

  return hsl
}

/**
 * Reads the distance of two hues on the colour wheel.
 *
 * @param first The first hue, `0..1`.
 * @param second The second hue, `0..1`.
 *
 * @returns The distance, `0..0.5`.
 */
function hueDistanceOf(first: number, second: number): number {
  return Math.abs(((first - second + 1.5) % 1) - 0.5)
}

void describe('flatColorOf', () => {
  void it('reads the flat colour of a texture of the game', () => {
    // the Underworld mode paints a face with the average of its texture
    assert.deepEqual(flatColorOf('(fabric)_gobelin_bed.bmp'), [53, 33, 20])
  })

  void it('matches the name without case, the way the data directory does', () => {
    assert.deepEqual(flatColorOf('(FABRIC)_GOBELIN_BED.BMP'), [53, 33, 20])
  })

  void it('gives nothing for a texture the table does not know', () => {
    assert.equal(flatColorOf('jorge-[stone].jpg'), undefined)
  })
})

void describe('wireframeLineColorOf', () => {
  void it('gives the inverse hue of a dark texture, with a light line', () => {
    // 53, 33, 20 is a dark brown: the line is its light blue-lilac inverse
    const flat = flatHslOf([53, 33, 20])
    const line = hslOf(wireframeLineColorOf('(fabric)_gobelin_bed.bmp'))

    assert.ok(hueDistanceOf(line.h, flat.h + 0.5) < 1e-4)
    assert.ok(Math.abs(line.l - 0.78) < 1e-4)
    assert.ok(line.s >= 0.45 - 1e-4)
  })

  void it('gives the inverse hue of a light texture, with a dark line', () => {
    // 163, 148, 126 is a light cloth: the line is its dark blue-grey inverse
    const flat = flatHslOf([163, 148, 126])
    const line = hslOf(wireframeLineColorOf('[fabric]_human_observatory1.bmp'))

    assert.ok(hueDistanceOf(line.h, flat.h + 0.5) < 1e-4)
    assert.ok(Math.abs(line.l - 0.22) < 1e-4)
    assert.ok(line.s >= 0.45 - 1e-4)
  })

  void it('keeps the line coloured on a face of little colour', () => {
    // a grey stone has almost no hue of its own, and the line still takes a tint of the inverse
    const line = hslOf(wireframeLineColorOf('[stone]_human_wall1.bmp'))

    assert.ok(line.s >= 0.45 - 1e-4)
  })

  void it('gives the white line of the dark faces for a texture the table does not know', () => {
    // the blank level's own texture is one of these: there is no flat colour to invert
    assert.deepEqual(wireframeLineColorOf('jorge-[stone].jpg'), [1, 1, 1])
  })

  void it('gives a white line for a face without a texture name', () => {
    assert.deepEqual(wireframeLineColorOf(undefined), [1, 1, 1])
  })
})

void describe('the flat colours registered at runtime', () => {
  afterEach(() => {
    clearRegisteredFlatColors()
  })

  void it('knows which textures the table of the game has', () => {
    assert.equal(hasGameFlatColor('(fabric)_gobelin_bed.bmp'), true)
    assert.equal(hasGameFlatColor('a-custom-wall.jpg'), false)
  })

  void it('reads the registered colour of a texture the table does not know', () => {
    registerFlatColor('a-custom-wall.jpg', [200, 120, 40])

    assert.deepEqual(flatColorOf('a-custom-wall.jpg'), [200, 120, 40])
  })

  void it('takes the registered colour of a game texture over the table', () => {
    // a level may bring its own file of a name the game knows: the colour of the file on the screen wins
    registerFlatColor('(fabric)_gobelin_bed.bmp', [10, 20, 30])

    assert.deepEqual(flatColorOf('(fabric)_gobelin_bed.bmp'), [10, 20, 30])
  })

  void it('gives the line of a registered texture from its own colour', () => {
    const flat = flatHslOf([200, 120, 40])

    registerFlatColor('a-custom-wall.jpg', [200, 120, 40])

    const line = hslOf(wireframeLineColorOf('a-custom-wall.jpg'))

    assert.ok(hueDistanceOf(line.h, flat.h + 0.5) < 1e-4)
  })

  void it('forgets the registered colours when it is cleared', () => {
    registerFlatColor('a-custom-wall.jpg', [200, 120, 40])
    clearRegisteredFlatColors()

    assert.equal(flatColorOf('a-custom-wall.jpg'), undefined)
  })
})
