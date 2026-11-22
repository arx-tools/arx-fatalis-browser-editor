import {
  ArxLightFlags,
  ArxPolygonFlags,
  type ArxColor,
  type ArxFTS,
  type ArxLight,
  type ArxLLF,
  type ArxPolygon,
  type ArxVector3,
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
   * The light of the `Flat` profile, from 0 (dark) to 1 (the brightest), in steps of 0.1 on the widget.
   *
   * @remarks
   * The flat light is one grey for every corner: the slider of the widget sets it, and 0 and 1 are the old darkness and
   * maximum brightness.
   */
  readonly flatLuminosity?: number
  /**
   * The value of the colours of the `TextureRainbow` profile, from 0 (black) to 1 (the full colour of the hue).
   *
   * @remarks
   * The profile draws a hue per texture container, and this is the value of every one of them: the slider of the widget
   * sets it, so a darker level keeps the colours of the containers, just darker.
   *
   * @default 1
   */
  readonly rainbowLuminosity?: number
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
 * @param luminosity The value of the colours, from 0 (black) to 1 (the full colour of the hue).
 *
 * @returns The palette, one colour per entry.
 */
function bakeTextureRainbow(fts: ArxFTS, llf: ArxLLF, luminosity: number): ArxColor[] {
  const containers = fts.textureContainers
  const count = containers.length
  const colorOfContainer = new Map<number, ArxColor>()

  for (const [index, container] of containers.entries()) {
    let hue = 0

    if (count > 1) {
      hue = (240 * index) / (count - 1)
    }

    colorOfContainer.set(container.id, hsvToRgb(hue, RAINBOW_SATURATION, luminosity))
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
 * The size of a cell of the light grid, in the units of the level.
 *
 * @remarks
 * A corner reads the lights of its own cell and the ones that reach too far to be put in cells: on a level of a city a
 * cell of this size holds a few lights, against the five hundred a bake of the level reads.
 */
const LIGHT_CELL_SIZE = 512

/**
 * The number of cells a light may be registered in.
 *
 * @remarks
 * A light that reaches over a big part of the level would be in thousands of cells, and a corner would read it almost
 * everywhere: it goes to the list of the whole level instead.
 */
const LIGHT_CELL_LIMIT = 4096

/**
 * The fewest lights a bake reads before the grid is worth its lookups.
 */
const LIGHT_GRID_MINIMUM = 16

/**
 * The cells of the lights of a level.
 */
type LightGrid = {
  /**
   * The lights of the cells, by the hash of the coordinates of a cell.
   *
   * @remarks
   * The lights are in the order of the level, and a cell merged with the list of the whole level keeps that order: a
   * corner sums the same lights in the same order wherever it reads them from, so the bake of the whole level and the
   * bake of the corners of an edit give the same palette.
   */
  readonly cells: ReadonlyMap<number, readonly number[]>
  /**
   * The lights that reach too far to be put in cells, in the order of the level.
   */
  readonly everywhere: readonly number[]
}

/**
 * The grid of a level, and the lights it was built from.
 */
type LightGridCache = {
  /**
   * The grid itself.
   */
  readonly grid: LightGrid
  /**
   * The lights of the bake at the build, of which the grid holds the places and the reaches.
   */
  readonly lights: readonly ArxLight[]
}

/**
 * The hash of a cell of the grid.
 *
 * @remarks
 * Two cells may share a hash: the grid then holds the lights of both, and the bake tests them and leaves the ones out
 * that do not reach. A collision costs a few tests, never a light.
 *
 * @param x The cell on the first axis.
 * @param y The cell on the second one.
 * @param z The cell on the third one.
 *
 * @returns The number the cells are stored under.
 */
function cellHashOf(x: number, y: number, z: number): number {
  return (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ Math.imul(z, 83_492_791)) >>> 0
}

/**
 * The cell of a corner of the level.
 *
 * @param position The corner, in the frame of the scene.
 *
 * @returns The number its cell is stored under.
 */
function cellHashOfPosition(position: Vector3): number {
  return cellHashOf(
    Math.floor(position.x / LIGHT_CELL_SIZE),
    Math.floor(position.y / LIGHT_CELL_SIZE),
    Math.floor(position.z / LIGHT_CELL_SIZE),
  )
}

/**
 * Builds the grid of the lights of a bake.
 *
 * @param lights The lights of the bake, with their position in the frame of the scene.
 *
 * @returns The grid, or `undefined` when the bake reads too few lights for it to pay off.
 */
function buildLightGridOf(
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
): LightGrid | undefined {
  if (lights.length < LIGHT_GRID_MINIMUM) {
    return undefined
  }

  const cells = new Map<number, number[]>()
  const everywhere: number[] = []

  /**
   * Puts a light into one cell of the grid.
   *
   * @param x The cell on the first axis.
   * @param y The cell on the second one.
   * @param z The cell on the third one.
   * @param index The light, by its index in the bake.
   */
  function addToCellOf(x: number, y: number, z: number, index: number): void {
    const hash = cellHashOf(x, y, z)
    let cell = cells.get(hash)

    if (cell === undefined) {
      cell = []
      cells.set(hash, cell)
    }

    // two cells may share a hash, and a light that covers both comes twice: the repeats of a light are side by side,
    // because the walk fills the cells of a light in one go
    if (cell.at(-1) !== index) {
      cell.push(index)
    }
  }

  for (const [index, { light, position }] of lights.entries()) {
    const reach = light.fallEnd

    if (reach <= 0) {
      continue
    }

    const firstX = Math.floor((position.x - reach) / LIGHT_CELL_SIZE)
    const lastX = Math.floor((position.x + reach) / LIGHT_CELL_SIZE)
    const firstY = Math.floor((position.y - reach) / LIGHT_CELL_SIZE)
    const lastY = Math.floor((position.y + reach) / LIGHT_CELL_SIZE)
    const firstZ = Math.floor((position.z - reach) / LIGHT_CELL_SIZE)
    const lastZ = Math.floor((position.z + reach) / LIGHT_CELL_SIZE)
    const count = (lastX - firstX + 1) * (lastY - firstY + 1) * (lastZ - firstZ + 1)

    if (count > LIGHT_CELL_LIMIT) {
      everywhere.push(index)

      continue
    }

    for (let x = firstX; x <= lastX; x = x + 1) {
      for (let y = firstY; y <= lastY; y = y + 1) {
        for (let z = firstZ; z <= lastZ; z = z + 1) {
          addToCellOf(x, y, z, index)
        }
      }
    }
  }

  return { cells, everywhere }
}

/**
 * Tells whether two lists of lights stand where the grid was built.
 *
 * @remarks
 * The place and the reach of every light are what the cells hold. The colour and the intensity of a
 * light do not move it, so a drag of them keeps the grid of the level.
 *
 * @param one The lights the grid was built from.
 * @param other The lights of the bake now.
 *
 * @returns True when the two lists place the same lights the same way.
 */
function placesEveryLightOf(one: readonly ArxLight[], other: readonly ArxLight[]): boolean {
  if (one.length !== other.length) {
    return false
  }

  for (const [index, light] of one.entries()) {
    const candidate = other[index]

    if (
      candidate?.position.x !== light.position.x ||
      candidate?.position.y !== light.position.y ||
      candidate?.position.z !== light.position.z ||
      candidate?.fallEnd !== light.fallEnd
    ) {
      return false
    }
  }

  return true
}

/**
 * The grids of the levels, by their lighting.
 */
const lightGrids = new WeakMap<ArxLLF, LightGridCache>()

/**
 * Reads the grid of a level, and builds it when it is missing or stale.
 *
 * @param llf The lighting of the level: the cache is keyed by it.
 * @param lights The lights of the bake, with their position in the frame of the scene.
 *
 * @returns The grid, or `undefined` when the bake reads too few lights for it to pay off.
 */
function lightGridOf(
  llf: ArxLLF,
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
): LightGrid | undefined {
  if (lights.length < LIGHT_GRID_MINIMUM) {
    return undefined
  }

  const placed = lights.map((entry) => {
    return entry.light
  })
  const cached = lightGrids.get(llf)

  if (cached !== undefined && placesEveryLightOf(cached.lights, placed)) {
    return cached.grid
  }

  const grid = buildLightGridOf(lights)

  if (grid === undefined) {
    return undefined
  }

  lightGrids.set(llf, { grid, lights: placed })

  return grid
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
 *
 * @remarks
 * The two vectors are the corner, and a walk writes them for every corner it bakes: the bake of a level builds one of
 * these and moves it from corner to corner, so the loop does not allocate a new context for each of the hundred thousand
 * corners of a big level.
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
  /**
   * The lights to read for the corner, by their index in {@link CornerBake.lights}, ascending.
   *
   * @remarks
   * The grid of the lights writes the list for every corner, and the bake of the whole level keeps the whole list: the
   * two are the same order, so the sum of the corner is the same. The array is reused from corner to corner, and only
   * {@link CornerBake.candidateCount} of its entries are the lights of the corner.
   */
  readonly candidates: number[]
  /**
   * How many entries of {@link CornerBake.candidates} are the lights of the corner.
   */
  candidateCount: number
}

/**
 * Fills the lights of the corner from the grid.
 *
 * @remarks
 * The cell of the corner and the lights that reach everywhere are two ascending lists: this merges them, so a corner
 * sums its lights in the order of the level. Two cells may share a hash, and the same light may be in both of them: the
 * merge drops the repeats, or the light would be counted twice. A corner whose cell holds no light and whose level has
 * no light that reaches everywhere reads nothing, and the bake gives it the floor of the profile.
 *
 * @param context The bake of the walk.
 * @param grid The grid of the lights of the level.
 */
function fillCandidatesOf(context: BakeContext, grid: LightGrid): void {
  const { corner } = context
  const { candidates } = corner
  const cell = grid.cells.get(cellHashOfPosition(corner.position))
  const { everywhere } = grid
  // one past the last light: the merge reads the end of a list as a light that never comes
  const none = corner.lights.length
  let one = 0
  let other = 0
  let at = 0

  while (one < (cell?.length ?? 0) || other < everywhere.length) {
    let fromCell = none

    if (cell !== undefined) {
      fromCell = cell[one] ?? none
    }

    const fromEverywhere = everywhere[other] ?? none

    if (fromCell <= fromEverywhere) {
      candidates[at] = fromCell
      one = one + 1
    } else {
      candidates[at] = fromEverywhere
      other = other + 1
    }

    at = at + 1
  }

  context.corner.candidateCount = at
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
 * @param options What the bake of the corner reads, with the corner in {@link CornerBake.position} and its normal in
 * {@link CornerBake.normal}.
 * @param doubleSided Whether the face is drawn from both sides, so the normal turned away still takes the light.
 *
 * @returns The colour, with the ambient floor of the profile.
 */
function bakeCornerOf(options: CornerBake, doubleSided: boolean): ArxColor {
  let red = 0
  let green = 0
  let blue = 0

  for (let slot = 0; slot < options.candidateCount; slot = slot + 1) {
    const entry = options.lights[options.candidates[slot] ?? 0]

    if (entry === undefined) {
      continue
    }

    const { light, position } = entry
    // the squared distance rejects the light before the square root and the divisions: a corner of a big level is out
    // of the reach of most of its lights, and the full bake is half a second of this loop
    const alongX = position.x - options.position.x
    const alongY = position.y - options.position.y
    const alongZ = position.z - options.position.z
    const squaredX = alongX * alongX
    const squaredY = alongY * alongY
    const squaredZ = alongZ * alongZ
    const distanceSquared = squaredX + squaredY + squaredZ
    const reach = light.fallEnd * light.fallEnd

    if (distanceSquared === 0 || distanceSquared > reach) {
      continue
    }

    const distance = Math.sqrt(distanceSquared)

    options.toLight.set(alongX, alongY, alongZ).divideScalar(distance)

    let cosine = options.normal.dot(options.toLight)

    if (doubleSided) {
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
 * The scene of the level, and the corner a walk of the bake moves.
 */
type BakeContext = {
  /**
   * The corner every step of the walk writes before it bakes it.
   */
  readonly corner: CornerBake
  /**
   * The grid of the lights, when the walk fills the lights of a corner from it.
   */
  readonly grid: LightGrid | undefined
}

/**
 * Reads what a bake of the lights needs, once.
 *
 * @remarks
 * The full bake and the bake of the corners a light reaches share this: the lights, the blockers, the factor and the
 * floor of the profile. The modes that do not read the lights (`MaxBrightness`, `CompleteDarkness`, `TextureRainbow`,
 * `Flat`) have no context: their palette is not the light of the level.
 *
 * @param lights The lights of the bake, with their position in the frame of the scene.
 * @param options The profile of the bake and what it reads.
 * @param grid The grid of the lights, when the bake reads only the ones a corner needs.
 *
 * @returns What the bake of a corner reads, or `undefined` when the mode does not read the lights.
 */
function bakeContextOf(
  lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>,
  options: LightingOptions,
  grid?: LightGrid,
): BakeContext | undefined {
  const modesWithoutLights: readonly LightingCalculatorMode[] = [
    'MaxBrightness',
    'CompleteDarkness',
    'TextureRainbow',
    'Flat',
  ]

  if (modesWithoutLights.includes(options.mode)) {
    return undefined
  }

  const shadows = options.shadows ?? true
  let blockers: Mesh[] = []
  let factor = GLOBAL_LIGHT_FACTOR

  if (shadows && options.occluders !== undefined && options.mode === 'Realistic') {
    blockers = [...options.occluders]
  }

  if (options.mode === 'Realistic') {
    factor = 1
  }

  const raycaster = new Raycaster()
  raycaster.firstHitOnly = true

  const candidates = lights.keys().toArray()

  return {
    grid,
    corner: {
      position: new Vector3(),
      normal: new Vector3(),
      lights,
      candidates,
      candidateCount: candidates.length,
      blockers,
      raycaster,
      factor,
      ambient: ambientOf(options.mode, options.ambientFloor ?? 0),
      toLight: new Vector3(),
    },
  }
}

/**
 * Moves the corner of a bake to one corner of a face.
 *
 * @remarks
 * The frame is the editor's: the FTS vertices are absolute and the scene position shifts them into the frame of the
 * lights, and both the position and the normal are mirrored the way the mesh is.
 *
 * @param context The corner of the walk.
 * @param scenePosition The position of the scene of the level, which the corners are shifted by.
 * @param polygon The face the corner belongs to.
 * @param index The position of the corner in the face, from zero.
 */
function moveCornerOf(context: BakeContext, scenePosition: ArxVector3, polygon: ArxPolygon, index: number): void {
  const vertex = polygon.vertices[index]
  const { corner } = context

  corner.position.set(-vertex.x + scenePosition.x, -vertex.y + scenePosition.y, vertex.z - scenePosition.z)

  const normal = normalOfCorner(polygon, index)

  corner.normal.set(-normal.x, -normal.y, normal.z).normalize()
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
    return bakeTextureRainbow(fts, llf, MathUtils.clamp(options.rainbowLuminosity ?? 1, 0, 1))
  }

  if (options.mode === 'Flat') {
    const level = MathUtils.clamp(options.flatLuminosity ?? 1, 0, 1)
    const value = Math.round(level * 255)

    return llf.colors.map(() => {
      return { r: value, g: value, b: value, a: 255 }
    })
  }

  const lights = collectLights(llf)
  const grid = lightGridOf(llf, lights)
  const context = bakeContextOf(lights, options, grid)
  const scenePosition = fts.header.mScenePosition
  const colors: ArxColor[] = llf.colors.map(() => {
    return { r: 0, g: 0, b: 0, a: 255 }
  })

  if (context === undefined) {
    return colors
  }

  for (const polygon of fts.polygons) {
    const doubleSided = (polygon.flags & ArxPolygonFlags.DoubleSided) !== 0

    for (let index = 0; index < colorCountOf(polygon); index = index + 1) {
      const colorIndex = polygon.vertices[index].llfColorIdx

      if (colorIndex !== undefined) {
        moveCornerOf(context, scenePosition, polygon, index)

        if (grid !== undefined) {
          fillCandidatesOf(context, grid)
        }

        colors[colorIndex] = bakeCornerOf(context.corner, doubleSided)
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

/**
 * The corners of a level the partial bake reads, one entry per corner of its geometry.
 */
export type CornerSpots = {
  /**
   * The position of every corner, three channels each, in the frame of the scene.
   */
  readonly positions: Float32Array
  /**
   * The normal of every corner, three channels each, in the frame of the scene.
   */
  readonly normals: Float32Array
  /**
   * Whether the face of the corner is drawn from both sides, so its normal turned away still takes the light.
   */
  readonly doubleSided: Uint8Array
  /**
   * The palette entry of every corner, or `-1` when the corner takes no colour from the palette.
   */
  readonly paletteIndexes: Int32Array
}

/**
 * Bakes the palette entries of some corners of the level.
 *
 * @remarks
 * The light editor writes a light on every frame of a drag, and the palette has to follow it: the full bake would be
 * half a second on a big level, so this one bakes only the corners the edit reached (see `cornersWithin` in the editor:
 * the corners the light **before** the edit and the light **after** it reach, because a light that shrinks or moves
 * away has to give its old corners back to the other lights).
 *
 * The colour of an entry is the one the full bake would write: every corner is baked from **all** the lights of the
 * level, with the same math and in the same order ({@link bakeCornerOf}), and the lights a corner can not take are
 * filtered out by the grid of the level ({@link LightGrid}).
 *
 * The modes that do not read the lights (`MaxBrightness`, `CompleteDarkness`, `TextureRainbow`, `Flat`) give an empty
 * map: their palette is not the light of the level.
 *
 * @param llf The lighting of the level: the lights and the palette.
 * @param options The profile of the bake and what it reads.
 * @param spots The corners of the level, in the frame of the scene.
 * @param entries The corners to bake, by their entry in the spots.
 *
 * @returns The new colour of every affected palette entry, by its index in the palette.
 */
export function bakeLlfColorsAt(
  llf: ArxLLF,
  options: LightingOptions,
  spots: CornerSpots,
  entries: readonly number[],
): Map<number, ArxColor> {
  const colors = new Map<number, ArxColor>()
  const lights = collectLights(llf)
  const grid = lightGridOf(llf, lights)
  const context = bakeContextOf(lights, options, grid)

  if (context === undefined) {
    return colors
  }

  const { corner } = context

  for (const entry of entries) {
    const index = spots.paletteIndexes[entry] ?? -1

    if (index < 0) {
      continue
    }

    const at = entry * 3

    corner.position.set(spots.positions[at] ?? 0, spots.positions[at + 1] ?? 0, spots.positions[at + 2] ?? 0)
    corner.normal.set(spots.normals[at] ?? 0, spots.normals[at + 1] ?? 0, spots.normals[at + 2] ?? 0).normalize()

    if (grid !== undefined) {
      fillCandidatesOf(context, grid)
    }

    colors.set(index, bakeCornerOf(corner, spots.doubleSided[entry] === 1))
  }

  return colors
}
