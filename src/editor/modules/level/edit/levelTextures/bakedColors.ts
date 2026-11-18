import type { ArxColor, ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, Color, SRGBColorSpace } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import { blendModeOf, isWater } from '../../../../../generator/polygons.ts'
import { flatLightOf } from '../lightingFlat.ts'

/**
 * What the walk of the corners of the solid mesh tells about one corner.
 *
 * @param colorIndex The palette entry the corner reads, or `undefined` when it has none.
 * @param at The first channel of the corner in the `color` attribute.
 * @param lit Whether the palette lights the face (a blended or a water face is white).
 */
type CornerVisit = (colorIndex: number | undefined, at: number, lit: boolean) => void

/**
 * Walks the corners of the solid mesh in the order the renderer draws them.
 *
 * @remarks
 * The geometry the paint gives the level is a triangle list, and the corners of a face sit in it the way the renderer
 * walks the face: `a, b, c` for a triangle, and `a, b, c` and `c, b, d` for a quad. The walk is the one place that order
 * lives, so the writers of the attribute can not disagree on it.
 *
 * @param map The level whose mesh is walked.
 * @param visit What to do with one corner.
 *
 * @returns How many channels the walk went through, which is the length the attribute has to have.
 */
function walkCornersOf(map: ArxMap, visit: CornerVisit): number {
  let at = 0

  /**
   * Visits one corner of a face.
   *
   * @param polygon The face the corner belongs to.
   * @param index Which corner of it, in the order the face stores them.
   * @param lit Whether the palette lights the face.
   */
  function corner(polygon: ArxPolygon, index: number, lit: boolean): void {
    visit(polygon.vertices[index].llfColorIdx, at, lit)
    at = at + 3
  }

  for (const polygon of map.polygons) {
    const lit = blendModeOf(polygon) === 'opaque' && !isWater(polygon)

    corner(polygon, 0, lit)
    corner(polygon, 1, lit)
    corner(polygon, 2, lit)

    if (isQuad(polygon)) {
      // the renderer walks a quad `a, b, c` and `c, b, d`
      corner(polygon, 2, lit)
      corner(polygon, 1, lit)
      corner(polygon, 3, lit)
    }
  }

  return at
}

/**
 * How many channels the `color` attribute of the solid mesh of a level has to have.
 *
 * @param map The level to count.
 *
 * @returns Three channels per corner, in the order the renderer draws them.
 */
function channelCountOf(map: ArxMap): number {
  let count = 0

  for (const polygon of map.polygons) {
    if (isQuad(polygon)) {
      count = count + 18
    } else {
      count = count + 9
    }
  }

  return count
}

/**
 * The linear values of a palette colour, the way the attribute carries them.
 *
 * @param entry The colour of the palette, in sRGB.
 *
 * @returns The three channels in the working colour space.
 */
function linearOf(entry: ArxColor): readonly [number, number, number] {
  const color = new Color().setRGB(entry.r / 255, entry.g / 255, entry.b / 255, SRGBColorSpace)

  return [color.r, color.g, color.b]
}

/**
 * Writes the baked light of the level into the `color` attribute of the solid mesh.
 *
 * @remarks
 * The palette of the LLF is the light of the level, corner by corner: the game multiplies the texture of a face with
 * the colour its `llfColorIdx` names. The material of the level is unlit and takes that colour from the geometry, so
 * the editor shows the same light the export writes (and the game draws).
 *
 * The palette is **sRGB**, the renderer works in linear: every entry is turned into linear once, and the corners copy
 * it. A corner without a colour (a face the palette does not reach) is white, which is what a level without a palette
 * shows.
 *
 * A **blended** face does not take the palette: the game sets its vertex colour to `gray(trans)` (the material of the
 * editor carries that colour already), so the corner is white there and the material's colour does the dimming. The
 * water is drawn by a pass of the game of its own, so it is white too.
 *
 * The `color` attribute of the level's geometry is the light of the level, and the bake owns it: a mode that draws
 * something else (the room map) keeps a geometry of its own (see `roomOverlay.ts`) instead of writing this one.
 *
 * The **flat** profile is not read from the palette: its one grey goes on every corner, the levels without a palette
 * (a blank one) included, so its slider moves the whole level and not only the faces the palette reaches.
 *
 * @param map The level whose mesh gets the colours.
 */
export function writeBakedColors(map: ArxMap): void {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return
  }

  const { geometry } = mesh
  const positions = geometry.getAttribute('position')
  const flat = flatLightOf(map)

  if (flat !== undefined) {
    const grey = new Color().setRGB(flat, flat, flat, SRGBColorSpace)
    const lights = new Float32Array(positions.count * 3)

    for (let index = 0; index < lights.length; index = index + 3) {
      lights[index] = grey.r
      lights[index + 1] = grey.g
      lights[index + 2] = grey.b
    }

    geometry.setAttribute('color', new BufferAttribute(lights, 3))

    return
  }

  const colors = new Float32Array(positions.count * 3)
  const palette = map.llf.colors
  const table = new Float32Array(palette.length * 3)

  for (const [index, entry] of palette.entries()) {
    const linear = linearOf(entry)
    const base = index * 3

    table[base] = linear[0]
    table[base + 1] = linear[1]
    table[base + 2] = linear[2]
  }

  const at = walkCornersOf(map, (colorIndex, at, lit) => {
    if (lit && colorIndex !== undefined && colorIndex < palette.length) {
      const base = colorIndex * 3

      colors[at] = table[base]
      colors[at + 1] = table[base + 1]
      colors[at + 2] = table[base + 2]
    } else {
      colors[at] = 1
      colors[at + 1] = 1
      colors[at + 2] = 1
    }
  })

  if (at !== colors.length) {
    return
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/**
 * Writes the colours of some palette entries into the `color` attribute of the level.
 *
 * @remarks
 * The light editor bakes the entries its light touches on every frame of a drag (see `bakeLlfColorsAround`), and the
 * mesh has to follow without the paint of the whole level: this is the half that finds the corners of those entries and
 * moves the linear colour of the palette onto them. Every other corner of the attribute keeps what it had.
 *
 * A corner of a **blended** or a **water** face is white whatever the palette says (the material dims it), so it is left
 * alone. The **flat** profile does not read the palette either: its grey is already on every corner, and the light of a
 * light does not change it.
 *
 * @param map The level whose mesh takes the colours.
 * @param colorIndices The palette entries the bake wrote.
 *
 * @returns True when the attribute was written, false when the level has no attribute to write (it was not painted yet)
 * or the profile is the flat one.
 */
export function writeBakedCornerColors(map: ArxMap, colorIndices: ReadonlySet<number>): boolean {
  if (flatLightOf(map) !== undefined) {
    return false
  }

  const geometry = map.solidMeshes[0]?.geometry

  if (geometry === undefined) {
    return false
  }

  const attribute = geometry.getAttribute('color')

  if (!(attribute instanceof BufferAttribute) || !(attribute.array instanceof Float32Array)) {
    return false
  }

  if (attribute.itemSize !== 3 || attribute.count * 3 !== channelCountOf(map)) {
    return false
  }

  const palette = map.llf.colors
  const table = new Map<number, readonly [number, number, number]>()

  for (const index of colorIndices) {
    const entry = palette[index]

    if (entry !== undefined) {
      table.set(index, linearOf(entry))
    }
  }

  if (table.size === 0) {
    return false
  }

  const colors = attribute.array

  walkCornersOf(map, (colorIndex, at, lit) => {
    if (!lit || colorIndex === undefined) {
      return
    }

    const linear = table.get(colorIndex)

    if (linear === undefined) {
      return
    }

    colors[at] = linear[0]
    colors[at + 1] = linear[1]
    colors[at + 2] = linear[2]
  })

  attribute.needsUpdate = true

  return true
}
