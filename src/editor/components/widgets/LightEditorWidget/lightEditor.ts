import { ArxLightFlags, type ArxColor, type ArxLight } from 'arx-convert/types'
import { MathUtils } from 'three'

/**
 * How close two numbers of a light must be to count as the same.
 *
 * @remarks
 * The light of an LLF is a list of floats, and the editor writes them back: a number the author did not touch keeps the
 * value the file had, so a selection of lights that came from the same file compares equal. The tolerance is loose enough
 * for a round trip of a float32 and tight enough that a value the author typed is a difference.
 */
const LIGHT_FIELD_TOLERANCE = 1e-6

/**
 * Which editable field of a light differs in a selection.
 *
 * @remarks
 * The fields are grouped the way the widget edits them: one colour picker, one intensity, the two falloff radii, the
 * flags, the flicker colour and the advanced `ex*` numbers. The **position** is not one of them: the move is the gizmo's
 * (TODO 244), and two lights at different places can be edited together.
 */
export type LightMismatch = 'colour' | 'intensity' | 'falloff' | 'flags' | 'flicker' | 'advanced'

/**
 * The order the mismatches are read in, and the sentence of the widget.
 */
const LIGHT_MISMATCH_ORDER: readonly LightMismatch[] = [
  'colour',
  'intensity',
  'falloff',
  'flags',
  'flicker',
  'advanced',
]

/**
 * The part of a light the widget edits, or a reason it can not edit a selection.
 *
 * @remarks
 * `empty` is nothing selected, `ready` is one light — or many that share every editable field —, and `mismatch` is many
 * lights the widget can not edit together. The ready selection carries the **indices** it edits and the light they share:
 * the widget writes its fields from that one, and a step writes the same values to every index.
 */
export type LightSelection =
  | { readonly kind: 'empty' }
  | { readonly kind: 'mismatch'; readonly reasons: readonly LightMismatch[] }
  | { readonly kind: 'ready'; readonly indices: readonly number[]; readonly light: ArxLight }

/**
 * Compares two numbers of a light.
 *
 * @param one The first number.
 * @param other The second one.
 *
 * @returns True when they are within {@link LIGHT_FIELD_TOLERANCE}.
 */
function sameNumber(one: number, other: number): boolean {
  return Math.abs(one - other) < LIGHT_FIELD_TOLERANCE
}

/**
 * Compares the colour of two lights.
 *
 * @remarks
 * The alpha is not edited (a light of the LLF is opaque), so the three channels are what the widget shows and a step
 * writes.
 *
 * @param one The first colour.
 * @param other The second one.
 *
 * @returns True when the three channels are the same.
 */
function sameColor(one: ArxColor, other: ArxColor): boolean {
  return sameNumber(one.r, other.r) && sameNumber(one.g, other.g) && sameNumber(one.b, other.b)
}

/**
 * Tells whether a field of two lights differs.
 *
 * @param reason The group of the field.
 * @param one The first light.
 * @param other The second one.
 *
 * @returns True when the field differs.
 */
function differsIn(reason: LightMismatch, one: ArxLight, other: ArxLight): boolean {
  switch (reason) {
    case 'colour': {
      return !sameColor(one.color, other.color)
    }

    case 'intensity': {
      return !sameNumber(one.intensity, other.intensity)
    }

    case 'falloff': {
      return !sameNumber(one.fallStart, other.fallStart) || !sameNumber(one.fallEnd, other.fallEnd)
    }

    case 'flags': {
      return one.flags !== other.flags
    }

    case 'flicker': {
      return !sameColor(one.exFlicker, other.exFlicker)
    }

    case 'advanced': {
      return (
        !sameNumber(one.exRadius, other.exRadius) ||
        !sameNumber(one.exFrequency, other.exFrequency) ||
        !sameNumber(one.exSize, other.exSize) ||
        !sameNumber(one.exSpeed, other.exSpeed) ||
        !sameNumber(one.exFlareSize, other.exFlareSize)
      )
    }
  }
}

/**
 * Tells whether the editable fields of two lights are the same.
 *
 * @param one The first light.
 * @param other The second one.
 *
 * @returns True when the widget can write one step for both.
 */
export function sameLightEditableFields(one: ArxLight, other: ArxLight): boolean {
  return LIGHT_MISMATCH_ORDER.every((reason) => {
    return !differsIn(reason, one, other)
  })
}

/**
 * Reads the selection: one light, many lights that share every editable field, or why not.
 *
 * @remarks
 * A selected index the level does not have is skipped (an undo of a delete may move the indices before the selection is
 * dropped), and a repeated one is read once. The position is left out of the comparison: the move is the gizmo's.
 *
 * @param lights The lights of the level, in the order of the LLF.
 * @param indices The selected lights, by their index in that list.
 *
 * @returns What the widget can do with the selection.
 */
export function lightSelectionOf(lights: readonly ArxLight[], indices: Iterable<number>): LightSelection {
  const found: Array<{ readonly index: number; readonly light: ArxLight }> = []
  const seen = new Set<number>()

  for (const index of indices) {
    if (seen.has(index)) {
      continue
    }

    const light = lights[index]

    if (light === undefined) {
      continue
    }

    seen.add(index)
    found.push({ index, light })
  }

  const [first, ...rest] = found

  if (first === undefined) {
    return { kind: 'empty' }
  }

  const reasons = LIGHT_MISMATCH_ORDER.filter((reason) => {
    return rest.some((candidate) => {
      return differsIn(reason, candidate.light, first.light)
    })
  })

  if (reasons.length > 0) {
    return { kind: 'mismatch', reasons }
  }

  return {
    kind: 'ready',
    indices: found.map((entry) => {
      return entry.index
    }),
    light: first.light,
  }
}

/**
 * The words of the mismatches, in the order the widget shows them.
 */
const LIGHT_MISMATCH_LABELS: Record<LightMismatch, string> = {
  colour: 'mismatching colours',
  intensity: 'mismatching intensities',
  falloff: 'mismatching falloffs',
  flags: 'mismatching flags',
  flicker: 'mismatching flickers',
  advanced: 'mismatching advanced fields',
}

/**
 * The sentence of the widget for a selection it can not edit.
 *
 * @param reasons The mismatches, in the order the widget shows them.
 *
 * @returns The message, like `Can't edit lights on selection: mismatching colours, mismatching intensities`.
 */
export function lightMismatchMessageOf(reasons: readonly LightMismatch[]): string {
  const parts = reasons.map((reason) => {
    return LIGHT_MISMATCH_LABELS[reason]
  })

  return `Can't edit lights on selection: ${parts.join(', ')}`
}

/**
 * A colour of the picker: the hue in degrees, and the saturation and lightness in percent.
 *
 * @remarks
 * The light of the LLF is RGB, and the widget shows its three sliders in HSL: the hue is a full turn (0..360), and the
 * saturation and the lightness are 0..100. The conversion goes through the same three sliders, so a colour the author
 * picks is the colour the light takes.
 */
export type LightHsl = {
  /**
   * The hue, in degrees, from 0 to 360.
   */
  readonly h: number
  /**
   * The saturation, in percent, from 0 to 100.
   */
  readonly s: number
  /**
   * The lightness, in percent, from 0 to 100.
   */
  readonly l: number
}

/**
 * The light of the three HSL sliders, as a colour of the LLF.
 *
 * @param hsl The three sliders.
 *
 * @returns The colour, with the channels rounded to whole bytes.
 */
export function colorOfHsl(hsl: LightHsl): ArxColor {
  const h = ((hsl.h % 360) + 360) % 360
  const s = MathUtils.clamp(hsl.s, 0, 100) / 100
  const l = MathUtils.clamp(hsl.l, 0, 100) / 100
  const doubledLightness = 2 * l
  const distanceFromOne = Math.abs(doubledLightness - 1)
  const oneMinusDistance = 1 - distanceFromOne
  const chroma = oneMinusDistance * s
  const sector = h / 60
  const sectorHalf = sector % 2
  const halfDistance = Math.abs(sectorHalf - 1)
  const inverseHalfDistance = 1 - halfDistance
  const second = chroma * inverseHalfDistance
  const halfChroma = chroma / 2
  const base = l - halfChroma
  let red = 0
  let green = 0
  let blue = 0

  if (sector < 1) {
    red = chroma
    green = second
  } else if (sector < 2) {
    red = second
    green = chroma
  } else if (sector < 3) {
    green = chroma
    blue = second
  } else if (sector < 4) {
    green = second
    blue = chroma
  } else if (sector < 5) {
    red = second
    blue = chroma
  } else {
    red = chroma
    blue = second
  }

  return {
    r: Math.round((red + base) * 255),
    g: Math.round((green + base) * 255),
    b: Math.round((blue + base) * 255),
    a: 255,
  }
}

/**
 * The three HSL sliders of a colour of the LLF.
 *
 * @param color The colour.
 *
 * @returns The hue in degrees, and the saturation and lightness in percent.
 */
export function hslOfColor(color: ArxColor): LightHsl {
  const red = MathUtils.clamp(color.r, 0, 255) / 255
  const green = MathUtils.clamp(color.g, 0, 255) / 255
  const blue = MathUtils.clamp(color.b, 0, 255) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  let hue = 0

  if (delta > 0) {
    if (max === red) {
      const ratio = (green - blue) / delta

      hue = 60 * (ratio % 6)
    } else if (max === green) {
      const ratio = (blue - red) / delta

      hue = 60 * (ratio + 2)
    } else {
      const ratio = (red - green) / delta

      hue = 60 * (ratio + 4)
    }
  }

  if (hue < 0) {
    hue = hue + 360
  }

  let saturation = 0

  if (delta > 0) {
    const doubledLightness = 2 * lightness
    const distanceFromOne = Math.abs(doubledLightness - 1)
    const oneMinusDistance = 1 - distanceFromOne

    saturation = delta / oneMinusDistance
  }

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  }
}

/**
 * The fields of a light the widget edits, without the position.
 *
 * @remarks
 * The position is the gizmo's (TODO 244): two lights at different places are edited together, and every light keeps
 * its own. The fields are the whole rest of the light, so a step writes the light back without knowing which field the
 * author touched.
 */
export type LightFields = {
  color: ArxColor
  intensity: number
  fallStart: number
  fallEnd: number
  flags: number
  exFlicker: ArxColor
  exRadius: number
  exFrequency: number
  exSize: number
  exSpeed: number
  exFlareSize: number
}

/**
 * Reads the editable fields of a light.
 *
 * @param light The light of the level.
 *
 * @returns The fields, with colours of their own.
 */
export function fieldsOfLight(light: ArxLight): LightFields {
  return {
    color: { ...light.color },
    intensity: light.intensity,
    fallStart: light.fallStart,
    fallEnd: light.fallEnd,
    flags: light.flags,
    exFlicker: { ...light.exFlicker },
    exRadius: light.exRadius,
    exFrequency: light.exFrequency,
    exSize: light.exSize,
    exSpeed: light.exSpeed,
    exFlareSize: light.exFlareSize,
  }
}

/**
 * Writes the editable fields of a light, keeping its position.
 *
 * @param base The light the position comes from.
 * @param fields The fields the author edited.
 *
 * @returns A light of the level, with the fields of the widget.
 */
export function lightWithFieldsOf(base: ArxLight, fields: LightFields): ArxLight {
  return {
    ...base,
    position: { ...base.position },
    color: { ...fields.color },
    intensity: fields.intensity,
    fallStart: fields.fallStart,
    fallEnd: fields.fallEnd,
    flags: fields.flags,
    exFlicker: { ...fields.exFlicker },
    exRadius: fields.exRadius,
    exFrequency: fields.exFrequency,
    exSize: fields.exSize,
    exSpeed: fields.exSpeed,
    exFlareSize: fields.exFlareSize,
  }
}

/**
 * A flag of a light the widget shows as a checkbox.
 */
export type LightFlagField = {
  /**
   * The bit of `ArxLightFlags`.
   */
  readonly bit: number
  /**
   * The word of the widget.
   */
  readonly label: string
}

/**
 * The flags the widget always shows.
 *
 * @remarks
 * These are the ones the light work needs: the kind of the light (semi-dynamic), what it can do (burn, be doused), the
 * fire and the smoke, and the flare. The rest is in the Advanced group.
 */
export const BASIC_LIGHT_FLAGS: readonly LightFlagField[] = [
  { bit: ArxLightFlags.SemiDynamic, label: 'Semi-dynamic' },
  { bit: ArxLightFlags.Extinguishable, label: 'Extinguishable' },
  { bit: ArxLightFlags.StartExtinguished, label: 'Starts extinguished' },
  { bit: ArxLightFlags.SpawnFire, label: 'Spawn fire' },
  { bit: ArxLightFlags.SpawnSmoke, label: 'Spawn smoke' },
  { bit: ArxLightFlags.Flare, label: 'Flare' },
]

/**
 * The flags of the Advanced group.
 */
export const ADVANCED_LIGHT_FLAGS: readonly LightFlagField[] = [
  { bit: ArxLightFlags.Fireplace, label: 'Fireplace' },
  { bit: ArxLightFlags.NoIgnit, label: 'No ignit' },
  { bit: ArxLightFlags.NoCasted, label: 'No casted' },
  { bit: ArxLightFlags.FixFlareSize, label: 'Fix flare size' },
  { bit: ArxLightFlags.ColorLegacy, label: 'Colour legacy' },
  { bit: ArxLightFlags.Off, label: 'Off' },
]

/**
 * Tells whether a light has a flag.
 *
 * @param light The light of the level.
 * @param bit The bit of `ArxLightFlags`.
 *
 * @returns True when the flag is on.
 */
export function hasLightFlag(light: ArxLight, bit: number): boolean {
  return (light.flags & bit) !== 0
}

/**
 * Toggles a flag of a light.
 *
 * @param light The light of the level.
 * @param bit The bit of `ArxLightFlags`.
 * @param enabled Whether the flag goes on.
 *
 * @returns A light with the flag set, and its vectors of its own.
 */
export function withLightFlag(light: ArxLight, bit: number, enabled: boolean): ArxLight {
  let flags = light.flags & ~bit

  if (enabled) {
    flags = light.flags | bit
  }

  return {
    ...light,
    position: { ...light.position },
    color: { ...light.color },
    exFlicker: { ...light.exFlicker },
    flags,
  }
}
