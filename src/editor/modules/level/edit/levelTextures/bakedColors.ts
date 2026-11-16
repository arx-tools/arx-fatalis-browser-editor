import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, Color, SRGBColorSpace } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import { blendModeOf, isWater } from '../../../../../generator/polygons.ts'

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
 * @param map The level whose mesh gets the colours.
 */
export function writeBakedColors(map: ArxMap): void {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return
  }

  const { geometry } = mesh
  const positions = geometry.getAttribute('position')

  const colors = new Float32Array(positions.count * 3)
  const palette = map.llf.colors
  const table = new Float32Array(palette.length * 3)
  const color = new Color()

  for (const [index, entry] of palette.entries()) {
    color.setRGB(entry.r / 255, entry.g / 255, entry.b / 255, SRGBColorSpace)

    const base = index * 3

    table[base] = color.r
    table[base + 1] = color.g
    table[base + 2] = color.b
  }

  let at = 0

  /**
   * Writes the colour of one corner of a face.
   *
   * @param polygon The face the corner belongs to.
   * @param corner Which corner of it, in the order the face stores them.
   * @param lit Whether the palette lights the face (a blended or a water face is white).
   */
  function writeCorner(polygon: ArxPolygon, corner: number, lit: boolean): void {
    const colorIndex = polygon.vertices[corner].llfColorIdx

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

    at = at + 3
  }

  for (const polygon of map.polygons) {
    const lit = blendModeOf(polygon) === 'opaque' && !isWater(polygon)

    writeCorner(polygon, 0, lit)
    writeCorner(polygon, 1, lit)
    writeCorner(polygon, 2, lit)

    if (isQuad(polygon)) {
      // the renderer walks a quad `a, b, c` and `c, b, d`
      writeCorner(polygon, 2, lit)
      writeCorner(polygon, 1, lit)
      writeCorner(polygon, 3, lit)
    }
  }

  if (at !== colors.length) {
    return
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}
