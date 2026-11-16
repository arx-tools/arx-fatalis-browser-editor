import {
  ArxLightFlags,
  ArxPolygonFlags,
  type ArxColor,
  type ArxFTS,
  type ArxLight,
  type ArxLLF,
  type ArxPolygon,
} from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { MathUtils, type Mesh, Raycaster, Vector3 } from 'three'
// eslint-disable-next-line import-x/no-unassigned-import -- the `firstHitOnly` option of the raycaster is typed by it
import 'three-mesh-bvh'
import { arxVector3toVector3 } from './meshes.ts'
import type { LightingCalculatorMode } from './types.ts'

/**
 * How the palette of the level is baked from its lights.
 */
export type LightingOptions = {
  /**
   * The profile of the bake.
   *
   * @remarks
   * `Arx` is the game-like look (the static lights only, a factor of 0.85 and an ambient floor of 23), `Realistic`
   * follows the Fred profile (the static lights, a factor of 1, its own ambient floor and an occlusion test when
   * shadows are on). The semidynamic lights, the torches among them, stay out of both: the game lights them up at
   * runtime. The other modes are for checking the level.
   */
  readonly mode: LightingCalculatorMode
  /**
   * The meshes that block the light of a vertex, for the `Realistic` profile.
   *
   * @remarks
   * Without them a light reaches every vertex the angle lets it: the `Arx` look, which is what the game's own palette
   * was made of. The level's solid mesh is the one the editor passes.
   */
  readonly occluders?: readonly Mesh[]
  /**
   * The lowest value of a baked colour, from 0 to 255.
   *
   * @remarks
   * The `Realistic` profile has no floor by default, so a shadowed vertex goes to black; the game's own palette never
   * goes below 23. The `Arx` profile uses 23 whatever this says.
   *
   * @default 0
   */
  readonly ambientFloor?: number
  /**
   * Whether the `Realistic` profile tests the way of the light against the occluders.
   *
   * @default true
   */
  readonly shadows?: boolean
}

/**
 * The ambient floor of the game-like profile: 9% of white, the floor of the game's own palette (Danae).
 */
const AMBIENT = Math.round(0.09 * 255)

/**
 * The global factor of the game-like profile (Danae); the realistic profile uses one.
 */
const GLOBAL_LIGHT_FACTOR = 0.85

/**
 * The saturation of the `TextureRainbow` palette: 100% looked too harsh on the screen.
 */
const RAINBOW_SATURATION = 0.75

/**
 * The number of colours a polygon owns in the palette: one per corner, so three or four.
 *
 * @param polygon The face to read.
 *
 * @returns The number of its corners in the palette.
 */
function colorCountOf(polygon: ArxPolygon): number {
  if (isQuad(polygon)) {
    return 4
  }

  return 3
}

/**
 * The normal of one corner of a face.
 *
 * @remarks
 * A face may carry a normal for every corner (the curved ones do); otherwise the first three corners take the face's
 * normal and the fourth one the second normal, the way the renderer reads them.
 *
 * @param polygon The face whose corners are read.
 * @param index The position of the corner in the face, from zero.
 *
 * @returns The direction the face points at that corner, as the file gave it.
 */
function normalOfCorner(polygon: ArxPolygon, index: number): ArxPolygon['norm'] {
  const baked = polygon.normals?.[index]

  if (baked !== undefined) {
    return baked
  }

  if (index < 3) {
    return polygon.norm
  }

  return polygon.norm2
}

/**
 * The falloff of a light at a distance: one inside its full radius, then a line down to zero at its end.
 *
 * @param light The light to read.
 * @param distance How far the corner is from it.
 *
 * @returns The factor of the falloff, or `undefined` when the light does not reach the corner.
 */
function falloffOf(light: ArxLight, distance: number): number | undefined {
  if (distance <= light.fallStart) {
    return 1
  }

  const factor = (light.fallEnd - distance) / (light.fallEnd - light.fallStart)

  if (factor <= 0) {
    return undefined
  }

  return factor
}

/**
 * Turns a hue, a saturation and a value into a colour of 0..255.
 *
 * @param hue The hue, in degrees.
 * @param saturation The saturation, from 0 to 1.
 * @param value The brightness, from 0 to 1.
 *
 * @returns The colour.
 */
function hsvToRgb(hue: number, saturation: number, value: number): ArxColor {
  const chroma = value * saturation
  const sector = (hue / 60) % 2
  const second = chroma * (1 - Math.abs(sector - 1))
  const offset = value - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) {
    red = chroma
    green = second
  } else if (hue < 120) {
    red = second
    green = chroma
  } else if (hue < 180) {
    green = chroma
    blue = second
  } else if (hue < 240) {
    green = second
    blue = chroma
  } else if (hue < 300) {
    red = second
    blue = chroma
  } else {
    red = chroma
    blue = second
  }

  return {
    r: Math.round((red + offset) * 255),
    g: Math.round((green + offset) * 255),
    b: Math.round((blue + offset) * 255),
    a: 255,
  }
}

/**
 * The `TextureRainbow` palette: every corner takes a hue from the container of its texture.
 *
 * @remarks
 * The containers of the FTS are in the order the textures were added to the level, so the first ones are red (the
 * oldest) and the last ones blue (the newest): a place whose textures are late was added later, which makes the late
 * edits visible. It is a check mode, not a look for the game.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level.
 *
 * @returns The palette, one colour per entry.
 */
function bakeTextureRainbow(fts: ArxFTS, llf: ArxLLF): ArxColor[] {
  const containers = fts.textureContainers
  const count = containers.length
  const colorOfContainer = new Map<number, ArxColor>()

  for (const [index, container] of containers.entries()) {
    let hue = 0

    if (count > 1) {
      hue = (240 * index) / (count - 1)
    }

    colorOfContainer.set(container.id, hsvToRgb(hue, RAINBOW_SATURATION, 1))
  }

  const fallback: ArxColor = { r: 255, g: 255, b: 255, a: 255 }
  const colors: ArxColor[] = llf.colors.map(() => {
    return { ...fallback }
  })

  for (const polygon of fts.polygons) {
    const color = colorOfContainer.get(polygon.textureContainerId) ?? fallback

    for (let index = 0; index < colorCountOf(polygon); index = index + 1) {
      const colorIndex = polygon.vertices[index].llfColorIdx

      if (colorIndex !== undefined && colorIndex < colors.length) {
        colors[colorIndex] = { ...color }
      }
    }
  }

  return colors
}

/**
 * The lights a profile bakes.
 *
 * @remarks
 * Both profiles bake only the static lights, which is what the game's own palette was made of: a torch is a semidynamic
 * light, and the game lights it up at runtime (2026-11-16, the owner's decision: the realistic profile does not put
 * them into the palette either, then the game does not double them). The profiles differ in the factor (the game's 0.85
 * against the true 1) and in the options of the realistic one (the ambient floor, the shadows).
 *
 * @param llf The lighting of the level.
 *
 * @returns The lights, with their position in the scene's frame.
 */
function collectLights(llf: ArxLLF): Array<{ light: ArxLight; position: Vector3 }> {
  return llf.lights
    .filter((light) => {
      return (light.flags & ArxLightFlags.SemiDynamic) === 0
    })
    .map((light) => {
      return { light, position: arxVector3toVector3(light.position) }
    })
}

/**
 * The lowest value of a baked colour for a profile.
 *
 * @param mode The profile of the bake.
 * @param ambientFloor The setting of the realistic profile.
 *
 * @returns The floor, from 0 to 255.
 */
function ambientOf(mode: LightingCalculatorMode, ambientFloor: number): number {
  if (mode === 'Realistic') {
    return MathUtils.clamp(Math.round(ambientFloor), 0, 255)
  }

  return AMBIENT
}

/**
 * Tells whether a scene object blocks the way of the light.
 *
 * @param raycaster The raycaster of the bake, with its first-hit option on.
 * @param blockers The meshes of the level.
 * @param from The position of the light.
 * @param direction The unit vector from the corner to the light.
 *
 * @returns True when a mesh is between the two.
 */
function isOccluded(raycaster: Raycaster, blockers: Mesh[], from: Vector3, direction: Vector3): boolean {
  raycaster.set(from, direction.clone().negate())

  return raycaster.intersectObjects(blockers, false).length > 0
}

/**
 * What the bake of one corner reads.
 */
type CornerBake = {
  /**
   * The position of the corner in the frame of the scene.
   */
  readonly position: Vector3
  /**
   * The normal of the corner in the frame of the scene.
   */
  readonly normal: Vector3
  /**
   * Whether the face is drawn from both sides, so the normal turned away still takes the light.
   */
  readonly doubleSided: boolean
  /**
   * The lights the profile bakes, with their position in the frame of the scene.
   */
  readonly lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>
  /**
   * The meshes that block the light, for the realistic profile.
   */
  readonly blockers: Mesh[]
  /**
   * The raycaster of the bake.
   */
  readonly raycaster: Raycaster
  /**
   * The factor of the profile on the intensity of a light.
   */
  readonly factor: number
  /**
   * The lowest value of the baked colour.
   */
  readonly ambient: number
  /**
   * The vector the bake reuses for the direction of the light.
   */
  readonly toLight: Vector3
}

/**
 * Tells whether a mesh blocks the light on its way to the corner.
 *
 * @param options What the bake of the corner reads.
 * @param from The position of the light.
 * @param distance How far the corner is from it.
 *
 * @returns True when a blocker stands between the two.
 */
function isBlocked(options: CornerBake, from: Vector3, distance: number): boolean {
  if (options.blockers.length === 0) {
    return false
  }

  options.raycaster.far = distance * 0.99

  return isOccluded(options.raycaster, options.blockers, from, options.toLight)
}

/**
 * Bakes the colour of one corner from the lights.
 *
 * @param options What the bake of the corner reads.
 *
 * @returns The colour, with the ambient floor of the profile.
 */
function bakeCornerOf(options: CornerBake): ArxColor {
  let red = 0
  let green = 0
  let blue = 0

  for (const { light, position } of options.lights) {
    options.toLight.subVectors(position, options.position)

    const distance = options.toLight.length()

    if (distance === 0) {
      continue
    }

    if (distance > light.fallEnd) {
      continue
    }

    options.toLight.divideScalar(distance)

    let cosine = options.normal.dot(options.toLight)

    if (options.doubleSided) {
      cosine = Math.abs(cosine)
    }

    if (cosine <= 0) {
      continue
    }

    if (isBlocked(options, position, distance)) {
      continue
    }

    const falloff = falloffOf(light, distance)

    if (falloff === undefined) {
      continue
    }

    const contribution = cosine * falloff * light.intensity * options.factor
    const redPart = light.color.r * contribution
    const greenPart = light.color.g * contribution
    const bluePart = light.color.b * contribution

    red = red + redPart
    green = green + greenPart
    blue = blue + bluePart
  }

  return {
    r: MathUtils.clamp(Math.round(red), options.ambient, 255),
    g: MathUtils.clamp(Math.round(green), options.ambient, 255),
    b: MathUtils.clamp(Math.round(blue), options.ambient, 255),
    a: 255,
  }
}

/**
 * Bakes the palette of the level from its lights.
 *
 * @remarks
 * The palette is a flat list in the order of the polygons: a face owns three colours (one per corner) or four (the
 * fourth corner of a quad), and every corner reads the entry its `llfColorIdx` names. The bake computes the colour of
 * every corner from the lights of the LLF, so a geometry edit (a new tunnel, a deleted wall) gets a light of its own
 * instead of the placeholder of the step.
 *
 * The frame is the editor's: the FTS vertices are absolute and the LLF lights are scene relative, so the light is
 * `scenePosition + lightPosition` in the game's frame, and the bake mirrors both the way the mesh is mirrored.
 *
 * The `Arx` profile is the game-like one (the static lights, the factor of the game, the ambient floor of the game);
 * the `Realistic` one keeps the semidynamic lights out too, like the game's own palette, and with the true factor and
 * the occlusion test of its shadows it is the brighter, more physical one. The other modes are for checking.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level: the lights and the palette.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The colours of the palette, one for every entry of the lighting.
 */
/**
 * How many corners a chunk of the asynchronous bake computes before it lets the page paint.
 *
 * @remarks
 * The bake of a big level is about half a second of work; a chunk of five thousand corners is a few tens of milliseconds
 * of it, so the spinner of the editor moves between the chunks.
 */
const CHUNK_CORNERS = 5000

/**
 * Lets the page paint before the next chunk of the bake.
 *
 * @returns A promise that resolves on the next turn of the event loop.
 */
async function letThePagePaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * The steps of the bake, one corner at a time.
 *
 * @remarks
 * The synchronous bake consumes it in one go, and the asynchronous one lets the page paint between chunks of it: the
 * two compute the same palette. A corner is one `yield`; the flat (`MaxBrightness`, `CompleteDarkness`) and the
 * rainbow modes return the palette before the first step.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The steps, and at the end the colours of the palette.
 */
function* bakeLlfColorsSteps(fts: ArxFTS, llf: ArxLLF, options: LightingOptions): Generator<void, ArxColor[], void> {
  if (options.mode === 'MaxBrightness') {
    return llf.colors.map(() => {
      return { r: 255, g: 255, b: 255, a: 255 }
    })
  }

  if (options.mode === 'CompleteDarkness') {
    return llf.colors.map(() => {
      return { r: 0, g: 0, b: 0, a: 255 }
    })
  }

  if (options.mode === 'TextureRainbow') {
    return bakeTextureRainbow(fts, llf)
  }

  const scenePosition = fts.header.mScenePosition
  const lights = collectLights(llf)
  const ambient = ambientOf(options.mode, options.ambientFloor ?? 0)
  const shadows = options.shadows ?? true
  let blockers: Mesh[] = []

  if (shadows && options.occluders !== undefined && options.mode === 'Realistic') {
    blockers = [...options.occluders]
  }

  const raycaster = new Raycaster()
  raycaster.firstHitOnly = true

  const colors: ArxColor[] = llf.colors.map(() => {
    return { r: 0, g: 0, b: 0, a: 255 }
  })
  const cornerPosition = new Vector3()
  const cornerNormal = new Vector3()
  const toLight = new Vector3()
  let factor = GLOBAL_LIGHT_FACTOR

  if (options.mode === 'Realistic') {
    factor = 1
  }

  for (const polygon of fts.polygons) {
    const doubleSided = (polygon.flags & ArxPolygonFlags.DoubleSided) !== 0

    for (let index = 0; index < colorCountOf(polygon); index = index + 1) {
      const vertex = polygon.vertices[index]
      const colorIndex = vertex.llfColorIdx

      if (colorIndex !== undefined) {
        const normal = normalOfCorner(polygon, index)

        cornerPosition.set(-vertex.x + scenePosition.x, -vertex.y + scenePosition.y, vertex.z - scenePosition.z)
        cornerNormal.set(-normal.x, -normal.y, normal.z).normalize()
        colors[colorIndex] = bakeCornerOf({
          position: cornerPosition,
          normal: cornerNormal,
          doubleSided,
          lights,
          blockers,
          raycaster,
          factor,
          ambient,
          toLight,
        })
      }

      yield
    }
  }

  return colors
}

/**
 * Bakes the palette of the level from its lights.
 *
 * @remarks
 * The synchronous bake: the tests and any caller that has no page to paint use it. The editor uses
 * {@link bakeLlfColorsInChunks}, so its spinner moves while the palette is computed.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level, with the lights and the palette.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The colours of the palette, one for every entry of the lighting.
 */
export function bakeLlfColors(fts: ArxFTS, llf: ArxLLF, options: LightingOptions): ArxColor[] {
  const steps = bakeLlfColorsSteps(fts, llf, options)
  let step = steps.next()

  while (!step.done) {
    step = steps.next()
  }

  return step.value
}

/**
 * Bakes the palette of the level from its lights, in chunks.
 *
 * @remarks
 * The same palette as {@link bakeLlfColors}, but the page paints between the chunks: the bake of a big level is about
 * half a second, and the editor shows a spinner while it runs. A chunk is {@link CHUNK_CORNERS} corners, then a turn of
 * the event loop.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level, with the lights and the palette.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The colours of the palette, when every chunk is done.
 */
export async function bakeLlfColorsInChunks(fts: ArxFTS, llf: ArxLLF, options: LightingOptions): Promise<ArxColor[]> {
  const steps = bakeLlfColorsSteps(fts, llf, options)
  let step = steps.next()
  let budget = CHUNK_CORNERS

  while (!step.done) {
    budget = budget - 1

    if (budget <= 0) {
      budget = CHUNK_CORNERS
      await letThePagePaint()
    }

    step = steps.next()
  }

  return step.value
}
