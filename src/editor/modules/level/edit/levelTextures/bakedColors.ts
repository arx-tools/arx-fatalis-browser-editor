import { ArxPolygonFlags, type ArxColor, type ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, Color, SRGBColorSpace } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import { blendModeOf, isWater } from '../../../../../generator/polygons.ts'
import { flatLightOf } from '../lightingFlat.ts'

/**
 * What the walk of the corners of the solid mesh tells about one corner.
 *
 * @param polygon The face the corner belongs to.
 * @param corner Which corner of it, in the order the face stores them.
 * @param at The first channel of the corner in the `color` attribute.
 * @param lit Whether the palette lights the face (a blended or a water face is white).
 */
type CornerVisit = (polygon: ArxPolygon, corner: number, at: number, lit: boolean) => void

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
   * @param corner Which corner of it, in the order the face stores them.
   * @param lit Whether the palette lights the face.
   */
  function step(polygon: ArxPolygon, corner: number, lit: boolean): void {
    visit(polygon, corner, at, lit)
    at = at + 3
  }

  for (const polygon of map.polygons) {
    const lit = blendModeOf(polygon) === 'opaque' && !isWater(polygon)

    step(polygon, 0, lit)
    step(polygon, 1, lit)
    step(polygon, 2, lit)

    if (isQuad(polygon)) {
      // the renderer walks a quad `a, b, c` and `c, b, d`
      step(polygon, 2, lit)
      step(polygon, 1, lit)
      step(polygon, 3, lit)
    }
  }

  return at
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
 * The corners of the solid mesh of a level, one entry per corner of the `color` attribute.
 *
 * @remarks
 * The bake of a light edit needs the place, the normal and the palette entry of every corner, and the level has all of
 * them already: the geometry carries the place and the normal (the paint built it from the polygons, in the same frame
 * the bake works in), and the polygons carry the palette entry and the flags. This index puts them side by side once, so
 * an edit reads its corners without walking the polygons of the level again.
 */
export type BakedCorners = {
  /**
   * The position of every corner, three channels each, in the frame of the scene.
   */
  readonly positions: Float32Array
  /**
   * The normal of every corner, three channels each, in the frame of the scene.
   */
  readonly normals: Float32Array
  /**
   * The palette entry of every corner, or `-1` when the corner takes no colour from the palette.
   */
  readonly paletteIndexes: Int32Array
  /**
   * Whether the palette lights the corner: a corner of a blended or a water face is white on the mesh.
   */
  readonly lit: Uint8Array
  /**
   * Whether the face of the corner is drawn from both sides, so its normal turned away still takes the light.
   */
  readonly doubleSided: Uint8Array
  /**
   * How many corners the index holds.
   */
  readonly count: number
}

/**
 * A sphere a light edit reaches.
 *
 * @remarks
 * The two states of a light an edit touched give two spheres: the corners the light **used to** reach have to go back
 * to the light of the other lamps, and the ones it reaches now take it.
 */
export type LightSphere = {
  /**
   * The position of the light in the frame of the scene.
   */
  readonly x: number
  readonly y: number
  readonly z: number
  /**
   * How far it reaches, the `fallEnd` of the light.
   */
  readonly radius: number
}

/**
 * The index of the corners of a level, and the attributes it was built from.
 */
type CachedCorners = BakedCorners & {
  /**
   * The position attribute the places of the index are.
   */
  readonly position: BufferAttribute
  /**
   * Its version at the build: a moved corner is another index.
   */
  readonly positionVersion: number
  /**
   * The normal attribute the normals of the index are.
   */
  readonly normal: BufferAttribute
  /**
   * Its version at the build.
   */
  readonly normalVersion: number
}

/**
 * The indexes of the levels, by the value of the map.
 */
const cornerIndexes = new WeakMap<ArxMap, CachedCorners>()

/**
 * Builds the index of the corners of a level.
 *
 * @param map The level to read.
 *
 * @returns The index, or `undefined` when the polygons and the geometry of the level do not line up.
 */
function buildCornersOf(map: ArxMap): CachedCorners | undefined {
  const geometry = map.solidMeshes[0]?.geometry

  if (geometry === undefined) {
    return undefined
  }

  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')

  if (!(position instanceof BufferAttribute) || !(normal instanceof BufferAttribute)) {
    return undefined
  }

  const positions = position.array
  const normals = normal.array

  if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array)) {
    return undefined
  }

  const { count } = position
  const paletteIndexes = new Int32Array(count)
  const lit = new Uint8Array(count)
  const doubleSided = new Uint8Array(count)
  const at = walkCornersOf(map, (polygon, corner, offset, lights) => {
    const entry = offset / 3
    const colorIndex = polygon.vertices[corner].llfColorIdx

    paletteIndexes[entry] = colorIndex ?? -1

    // the arrays start at zero: only the ones that light the corner are written
    if (lights) {
      lit[entry] = 1
    }

    if ((polygon.flags & ArxPolygonFlags.DoubleSided) !== 0) {
      doubleSided[entry] = 1
    }
  })

  if (at !== count * 3 || positions.length !== count * 3 || normals.length !== count * 3) {
    return undefined
  }

  return {
    positions,
    normals,
    paletteIndexes,
    lit,
    doubleSided,
    count,
    position,
    positionVersion: position.version,
    normal,
    normalVersion: normal.version,
  }
}

/**
 * Reads the index of the corners of a level, and builds it when it is missing or stale.
 *
 * @remarks
 * The index is dropped when the attribute is written again (`writeBakedColors`), because the paint that writes it is
 * what changes the palette entries, the blend of a face or the geometry under the corners. A moved corner is another
 * index too: the geometry bumps the version of its position and normal attribute.
 *
 * @param map The level to read.
 *
 * @returns The index, or `undefined` when the level has no mesh or its polygons and geometry do not line up.
 */
export function bakedCornersOf(map: ArxMap): BakedCorners | undefined {
  const geometry = map.solidMeshes[0]?.geometry
  const cached = cornerIndexes.get(map)

  if (cached !== undefined && geometry !== undefined) {
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')

    if (
      position instanceof BufferAttribute &&
      normal instanceof BufferAttribute &&
      cached.position === position &&
      cached.positionVersion === position.version &&
      cached.normal === normal &&
      cached.normalVersion === normal.version
    ) {
      return cached
    }
  }

  const built = buildCornersOf(map)

  if (built !== undefined) {
    cornerIndexes.set(map, built)
  }

  return built
}

/**
 * The corners of a level that a light edit reaches.
 *
 * @remarks
 * A corner is a hit when one of the spheres of the edit reaches it, the two states of the light or of the lights the
 * edit touched. The walk is over the flat arrays of the geometry, which is what makes it cheap on a level of a city.
 *
 * @param corners The index of the corners.
 * @param spheres The spheres the edit reaches.
 *
 * @returns The entries of the index the spheres reach, in the order of the geometry.
 */
export function cornersWithin(corners: BakedCorners, spheres: readonly LightSphere[]): number[] {
  const reached: number[] = []

  if (spheres.length === 0) {
    return reached
  }

  for (let entry = 0; entry < corners.count; entry = entry + 1) {
    const at = entry * 3
    const x = corners.positions[at] ?? 0
    const y = corners.positions[at + 1] ?? 0
    const z = corners.positions[at + 2] ?? 0

    for (const sphere of spheres) {
      const alongX = x - sphere.x
      const alongY = y - sphere.y
      const alongZ = z - sphere.z
      const squaredX = alongX * alongX
      const squaredY = alongY * alongY
      const squaredZ = alongZ * alongZ
      const distanceSquared = squaredX + squaredY + squaredZ

      if (distanceSquared <= sphere.radius * sphere.radius) {
        reached.push(entry)

        break
      }
    }
  }

  return reached
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
  // the paint that writes the attribute is what the index of the corners describes: it goes with it
  cornerIndexes.delete(map)

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

  const at = walkCornersOf(map, (polygon, corner, offset, lit) => {
    const colorIndex = polygon.vertices[corner].llfColorIdx

    if (lit && colorIndex !== undefined && colorIndex < palette.length) {
      const base = colorIndex * 3

      colors[offset] = table[base]
      colors[offset + 1] = table[base + 1]
      colors[offset + 2] = table[base + 2]
    } else {
      colors[offset] = 1
      colors[offset + 1] = 1
      colors[offset + 2] = 1
    }
  })

  if (at !== colors.length) {
    return
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/**
 * Writes the colour of some corners of the level into the `color` attribute.
 *
 * @remarks
 * The light editor bakes the palette entries its light touches on every frame of a drag, and the mesh has to follow
 * without the paint of the whole level: this writes the corners the edit reached and leaves every other corner of the
 * attribute as it is. A corner of a **blended** or a **water** face is white whatever the palette says (the material
 * dims it), so it is left alone. The **flat** profile does not read the palette either: its grey is already on every
 * corner, and the light of a light does not change it.
 *
 * @param map The level whose mesh takes the colours.
 * @param corners The index of the corners of the level.
 * @param reached The entries of the index to write.
 *
 * @returns True when the attribute was written, false when the level has no attribute to write (it was not painted yet)
 * or the profile is the flat one.
 */
export function writeBakedCornerColors(map: ArxMap, corners: BakedCorners, reached: readonly number[]): boolean {
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

  if (attribute.itemSize !== 3 || attribute.count !== corners.count) {
    return false
  }

  const palette = map.llf.colors
  const table = new Map<number, readonly [number, number, number]>()
  const colors = attribute.array

  for (const entry of reached) {
    if (corners.lit[entry] !== 1) {
      continue
    }

    const index = corners.paletteIndexes[entry] ?? -1

    if (index < 0) {
      continue
    }

    const color = palette[index]

    if (color === undefined) {
      continue
    }

    let linear = table.get(index)

    if (linear === undefined) {
      linear = linearOf(color)
      table.set(index, linear)
    }

    const at = entry * 3

    colors[at] = linear[0]
    colors[at + 1] = linear[1]
    colors[at + 2] = linear[2]
  }

  attribute.needsUpdate = true

  return true
}
