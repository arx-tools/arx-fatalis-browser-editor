import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import {
  COLOR_LEGACY_FLAG,
  FIX_FLARE_SIZE_FLAG,
  LIGHT_FLAGS,
  colorOfHsl,
  conditionalLightFlagsOf,
  fieldsOfLight,
  hasLightFlag,
  hslOfColor,
  lightMismatchMessageOf,
  lightSelectionOf,
  lightWithFieldsOf,
  sameLightEditableFields,
  showsFireOf,
  showsFlareOf,
  showsFlickerOf,
  withLightFlag,
} from '../../../../../src/editor/components/widgets/LightEditorWidget/lightEditor.ts'

/**
 * A light of the test, with every field of an LLF light.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 10, y: 20, z: 30 },
    color: { r: 255, g: 128, b: 0, a: 255 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 255 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: ArxLightFlags.None,
    ...overrides,
  }
}

void describe('lightSelectionOf', () => {
  void it('reads nothing from no selection', () => {
    assert.deepEqual(lightSelectionOf([light()], []), { kind: 'empty' })
  })

  void it('skips an index the level does not have', () => {
    assert.deepEqual(lightSelectionOf([light()], [3]), { kind: 'empty' })
    assert.deepEqual(lightSelectionOf([], [0]), { kind: 'empty' })
  })

  void it('reads one light, with its index', () => {
    const one = light()
    const selection = lightSelectionOf([light(), one], [1])

    assert.deepEqual(selection, { kind: 'ready', indices: [1], light: one })
  })

  void it('reads the same light twice once', () => {
    const selection = lightSelectionOf([light()], [0, 0])

    assert.deepEqual(selection, { kind: 'ready', indices: [0], light: light() })
  })

  void it('reads lights that share every editable field, wherever they stand', () => {
    const first = light()
    const selection = lightSelectionOf([first, light({ position: { x: 100, y: 200, z: 300 } })], [0, 1])

    assert.deepEqual(selection, { kind: 'ready', indices: [0, 1], light: first })
  })

  void it('reads a color that differs', () => {
    const selection = lightSelectionOf([light(), light({ color: { r: 0, g: 0, b: 0, a: 255 } })], [0, 1])

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['color'] })
  })

  void it('reads an intensity that differs', () => {
    const selection = lightSelectionOf([light(), light({ intensity: 2 })], [0, 1])

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['intensity'] })
  })

  void it('reads a falloff that differs', () => {
    assert.deepEqual(lightSelectionOf([light(), light({ fallStart: 50 })], [0, 1]), {
      kind: 'mismatch',
      reasons: ['falloff'],
    })
    assert.deepEqual(lightSelectionOf([light(), light({ fallEnd: 300 })], [0, 1]), {
      kind: 'mismatch',
      reasons: ['falloff'],
    })
  })

  void it('reads flags that differ', () => {
    const selection = lightSelectionOf([light(), light({ flags: ArxLightFlags.SemiDynamic })], [0, 1])

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['flags'] })
  })

  void it('reads a flicker that differs', () => {
    const selection = lightSelectionOf([light(), light({ exFlicker: { r: 63, g: 63, b: 63, a: 255 } })], [0, 1])

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['flicker'] })
  })

  void it('reads a fire field that differs', () => {
    assert.deepEqual(lightSelectionOf([light(), light({ exRadius: 50 })], [0, 1]), {
      kind: 'mismatch',
      reasons: ['fire'],
    })
    assert.deepEqual(lightSelectionOf([light(), light({ exSpeed: 0.5 })], [0, 1]), {
      kind: 'mismatch',
      reasons: ['fire'],
    })
  })

  void it('reads a flare field that differs', () => {
    assert.deepEqual(lightSelectionOf([light(), light({ exFlareSize: 2 })], [0, 1]), {
      kind: 'mismatch',
      reasons: ['flare'],
    })
  })

  void it('reads every mismatch in the order of the widget', () => {
    const selection = lightSelectionOf(
      [
        light(),
        light({
          color: { r: 0, g: 0, b: 0, a: 255 },
          intensity: 2,
          fallStart: 50,
          flags: ArxLightFlags.SemiDynamic,
          exFlicker: { r: 63, g: 63, b: 63, a: 255 },
          exRadius: 10,
          exFlareSize: 2,
        }),
      ],
      [0, 1],
    )

    assert.deepEqual(selection, {
      kind: 'mismatch',
      reasons: ['color', 'intensity', 'falloff', 'flags', 'flicker', 'fire', 'flare'],
    })
  })

  void it('keeps the tolerance of the numbers', () => {
    const close = lightSelectionOf([light(), light({ intensity: 1 + 1e-7 })], [0, 1])
    const far = lightSelectionOf([light(), light({ intensity: 1 + 1e-5 })], [0, 1])

    assert.equal(close.kind, 'ready')
    assert.deepEqual(far, { kind: 'mismatch', reasons: ['intensity'] })
  })

  void it('reads a selection where one index is gone', () => {
    const selection = lightSelectionOf([light()], [0, 5])

    assert.deepEqual(selection, { kind: 'ready', indices: [0], light: light() })
  })
})

void describe('sameLightEditableFields', () => {
  void it('leaves the position out', () => {
    assert.equal(sameLightEditableFields(light(), light({ position: { x: 1, y: 2, z: 3 } })), true)
  })

  void it('tells a color apart', () => {
    assert.equal(sameLightEditableFields(light(), light({ color: { r: 1, g: 128, b: 0, a: 255 } })), false)
  })
})

void describe('lightMismatchMessageOf', () => {
  void it('writes the reasons in the words of the widget', () => {
    assert.equal(
      lightMismatchMessageOf(['color', 'intensity']),
      "Can't edit lights on selection: mismatching colors, mismatching intensities",
    )
  })

  void it('writes one reason', () => {
    assert.equal(lightMismatchMessageOf(['fire']), "Can't edit lights on selection: mismatching fire fields")
  })

  void it('writes the fire and the flare apart', () => {
    assert.equal(
      lightMismatchMessageOf(['fire', 'flare']),
      "Can't edit lights on selection: mismatching fire fields, mismatching flare size",
    )
  })
})

void describe('colorOfHsl', () => {
  void it('reads the six corners of the wheel', () => {
    assert.deepEqual(colorOfHsl({ h: 0, s: 100, l: 50 }), { r: 255, g: 0, b: 0, a: 255 })
    assert.deepEqual(colorOfHsl({ h: 120, s: 100, l: 50 }), { r: 0, g: 255, b: 0, a: 255 })
    assert.deepEqual(colorOfHsl({ h: 240, s: 100, l: 50 }), { r: 0, g: 0, b: 255, a: 255 })
  })

  void it('reads white, black and a gray', () => {
    assert.deepEqual(colorOfHsl({ h: 0, s: 0, l: 100 }), { r: 255, g: 255, b: 255, a: 255 })
    assert.deepEqual(colorOfHsl({ h: 0, s: 0, l: 0 }), { r: 0, g: 0, b: 0, a: 255 })
    assert.deepEqual(colorOfHsl({ h: 0, s: 0, l: 50 }), { r: 128, g: 128, b: 128, a: 255 })
  })

  void it('keeps the hue in the turn', () => {
    assert.deepEqual(colorOfHsl({ h: 360, s: 100, l: 50 }), colorOfHsl({ h: 0, s: 100, l: 50 }))
    assert.deepEqual(colorOfHsl({ h: -120, s: 100, l: 50 }), colorOfHsl({ h: 240, s: 100, l: 50 }))
  })
})

void describe('hslOfColor', () => {
  void it('reads the hue of the three primaries', () => {
    assert.deepEqual(hslOfColor({ r: 255, g: 0, b: 0, a: 255 }), { h: 0, s: 100, l: 50 })
    assert.deepEqual(hslOfColor({ r: 0, g: 255, b: 0, a: 255 }), { h: 120, s: 100, l: 50 })
    assert.deepEqual(hslOfColor({ r: 0, g: 0, b: 255, a: 255 }), { h: 240, s: 100, l: 50 })
  })

  void it('reads a gray without a saturation', () => {
    assert.deepEqual(hslOfColor({ r: 128, g: 128, b: 128, a: 255 }), { h: 0, s: 0, l: 50 })
    assert.deepEqual(hslOfColor({ r: 255, g: 255, b: 255, a: 255 }), { h: 0, s: 0, l: 100 })
    assert.deepEqual(hslOfColor({ r: 0, g: 0, b: 0, a: 255 }), { h: 0, s: 0, l: 0 })
  })

  void it('comes back from the picker, within the rounding of the sliders', () => {
    const color = { r: 181, g: 109, b: 73, a: 255 }
    const back = colorOfHsl(hslOfColor(color))

    assert.ok(Math.abs(back.r - color.r) <= 3)
    assert.ok(Math.abs(back.g - color.g) <= 3)
    assert.ok(Math.abs(back.b - color.b) <= 3)
  })
})

void describe('fieldsOfLight', () => {
  void it('reads the editable fields, without the position', () => {
    const fields = fieldsOfLight(light())

    assert.deepEqual(fields.color, { r: 255, g: 128, b: 0, a: 255 })
    assert.equal(fields.intensity, 1)
    assert.equal(fields.fallStart, 100)
    assert.equal(fields.fallEnd, 200)
    assert.equal('position' in fields, false)
  })
})

void describe('lightWithFieldsOf', () => {
  void it('writes the fields and keeps the position of the light', () => {
    const base = light({ position: { x: 4, y: 5, z: 6 } })
    const fields = { ...fieldsOfLight(light()), intensity: 3, fallEnd: 400 }
    const written = lightWithFieldsOf(base, fields)

    assert.equal(written.intensity, 3)
    assert.equal(written.fallEnd, 400)
    assert.deepEqual(written.position, { x: 4, y: 5, z: 6 })
    assert.notEqual(written.color, fields.color)
  })
})

void describe('the flags of the widget', () => {
  void it('shows the eight flags the engine reads, and not the dead ones', () => {
    assert.equal(LIGHT_FLAGS.length, 8)
    assert.deepEqual(
      LIGHT_FLAGS.map((flag) => {
        return flag.bit
      }),
      [
        ArxLightFlags.SemiDynamic,
        ArxLightFlags.Extinguishable,
        ArxLightFlags.StartExtinguished,
        ArxLightFlags.SpawnFire,
        ArxLightFlags.SpawnSmoke,
        ArxLightFlags.Flare,
        ArxLightFlags.Fireplace,
        ArxLightFlags.NoIgnit,
      ],
    )

    const bits = new Set(
      LIGHT_FLAGS.map((flag) => {
        return flag.bit
      }),
    )

    assert.equal(bits.has(ArxLightFlags.Off), false)
    assert.equal(bits.has(ArxLightFlags.NoCasted), false)
  })

  void it('shows the color legacy with the fire, and the fix flare size with the flare', () => {
    assert.equal(COLOR_LEGACY_FLAG.bit, ArxLightFlags.ColorLegacy)
    assert.equal(FIX_FLARE_SIZE_FLAG.bit, ArxLightFlags.FixFlareSize)
  })

  void it('brings the color legacy with the fire, and the fix flare size with the flare', () => {
    assert.deepEqual(conditionalLightFlagsOf(0), [])
    assert.deepEqual(conditionalLightFlagsOf(ArxLightFlags.SpawnFire), [COLOR_LEGACY_FLAG])
    assert.deepEqual(conditionalLightFlagsOf(ArxLightFlags.SpawnSmoke), [COLOR_LEGACY_FLAG])
    assert.deepEqual(conditionalLightFlagsOf(ArxLightFlags.Flare), [FIX_FLARE_SIZE_FLAG])
    assert.deepEqual(conditionalLightFlagsOf(ArxLightFlags.SpawnFire | ArxLightFlags.Flare), [
      COLOR_LEGACY_FLAG,
      FIX_FLARE_SIZE_FLAG,
    ])
  })

  void it('tells which groups of the fields the flags bring', () => {
    assert.equal(showsFlickerOf(ArxLightFlags.SemiDynamic), true)
    assert.equal(showsFlickerOf(ArxLightFlags.SpawnFire), false)
    assert.equal(showsFireOf(ArxLightFlags.SpawnFire), true)
    assert.equal(showsFireOf(ArxLightFlags.SpawnSmoke), true)
    assert.equal(showsFireOf(ArxLightFlags.SemiDynamic), false)
    assert.equal(showsFlareOf(ArxLightFlags.Flare), true)
    assert.equal(showsFlareOf(ArxLightFlags.SpawnFire), false)
  })

  void it('reads a flag', () => {
    assert.equal(hasLightFlag(light({ flags: ArxLightFlags.SemiDynamic }), ArxLightFlags.SemiDynamic), true)
    assert.equal(hasLightFlag(light(), ArxLightFlags.SemiDynamic), false)
  })

  void it('sets and clears a flag without touching the original', () => {
    const base = light()
    const set = withLightFlag(base, ArxLightFlags.SpawnFire, true)
    const cleared = withLightFlag(set, ArxLightFlags.SpawnFire, false)

    assert.equal(hasLightFlag(set, ArxLightFlags.SpawnFire), true)
    assert.equal(hasLightFlag(cleared, ArxLightFlags.SpawnFire), false)
    assert.equal(hasLightFlag(base, ArxLightFlags.SpawnFire), false)
    assert.notEqual(set.position, base.position)
  })
})
