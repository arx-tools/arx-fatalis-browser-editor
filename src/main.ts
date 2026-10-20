import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { DLF, FTS, LLF } from 'arx-convert'
import { isQuad } from 'arx-convert/utils'
import { ArxLightFlags, type ArxColor, type ArxDLF, type ArxFTS, type ArxLLF, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Color as ThreeColor,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PointLight,
  Ray,
  Scene,
  type Side,
  Timer,
  Triangle,
  Vector3,
  WebGLRenderer,
} from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createApp, watch } from 'vue'
import './style.scss'
import flatColorsByFilename from './assets/flat-colors.json'
import { downloadBinaryAs, zipBuffers } from './download.js'
import { registerDownloadHandler } from './download-handler.js'
import type { LightingCalculatorMode } from './ui/ui.js'
import { mountUi } from './ui/ui-app.js'
import {
  ambientFloor,
  anchorsVisible,
  cameraInfo,
  cameraInfoVisible,
  cameraLightVisible,
  canvas,
  currentLevelId,
  downloadCompleted,
  downloadProgress,
  isComputingLighting,
  isDirty,
  isDownloading,
  isLoading,
  lightingCalculatorMode,
  lightsVisible,
  LeftMouseButton,
  meshVisible,
  MiddleMouseButton,
  mouseLocked,
  mousePressed,
  mouseUnlocked,
  portalsVisible,
  RightMouseButton,
  selectionConnectDistance,
  shadows,
  updateMouseButtonState,
  updateMouseButtonStates,
  wireframeVisible,
} from './ui/ui.js'
import { isDoubleSided, isNoDraw, isTransparent, wait } from './functions.js'
import { Color } from './Color.js'
import { isValidOriginalArxLevelId } from './constants.js'
import { Logger } from './ui/Logger.js'
import { Exception } from './ui/Exception.js'
import { arxPolygonsToMesh, arxVector3toVector3, srgbToLinear } from './arx-threejs-format-converters.js'
import { buildExportFts, buildExportLlf, buildTriangleToPolygonMap, type SourcePolygon } from './fts-export.js'
import { createPolygonWireframe } from './geometry/createWireframe.js'
import { bakeLlfColors } from './lighting/bake.js'
import { removeTriangles } from './geometry/removeTriangles.js'
import { createTriangle as renderTriangle } from './geometry/renderTriangle.js'
import App from './App.vue'

Mesh.prototype.raycast = acceleratedRaycast

const logger = new Logger(document.querySelector('#logs') as HTMLDivElement)

const headerApp = createApp(App)
headerApp.use(FloatingVue)
headerApp.mount('#app')

mountUi()

// --------------------

async function getFTS(level: number): Promise<ArxFTS> {
  const line1 = logger.log(`- [fts]: loading level ${level} fts...`)

  const response = await fetch(
    `https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis/level${level}/fast.fts`,
  )
  if (!response.ok) {
    const errorResponse = await response.text()
    throw new Error(`Failed to download level ${level} fts: ${errorResponse}`)
  }

  logger.log('done', line1)

  await wait(100)

  const line2 = logger.log(`- [fts]: unpacking level ${level} fts...`)

  const packedFts = await response.arrayBuffer()
  const headerSize = getHeaderSize(packedFts, 'fts')

  await wait(100)

  const [header, body] = sliceArrayBufferAt(packedFts, headerSize.total)

  await wait(100)

  const explodedBody = explode(body)
  await wait(100)

  const unpackedFts = concatArrayBuffers([header, explodedBody])

  await wait(100)

  const fts = FTS.load(unpackedFts)

  logger.log('done', line2)

  return fts
}

async function getLLF(level: number): Promise<ArxLLF> {
  const line1 = logger.log(`- [llf]: loading level ${level} llf...`)

  const response = await fetch(
    `https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis/level${level}/level${level}.llf`,
  )
  if (!response.ok) {
    const errorResponse = await response.text()
    throw new Error(`Failed to download level ${level} llf: ${errorResponse}`)
  }

  logger.log('done', line1)

  await wait(100)

  const line2 = logger.log(`- [llf]: unpacking level ${level} llf...`)

  const packedLlf = await response.arrayBuffer()
  const headerSize = getHeaderSize(packedLlf, 'llf')

  await wait(100)

  const [header, body] = sliceArrayBufferAt(packedLlf, headerSize.total)

  await wait(100)

  const explodedBody = explode(body)
  await wait(100)

  const unpackedLlf = concatArrayBuffers([header, explodedBody])

  await wait(100)

  const llf = LLF.load(unpackedLlf)

  logger.log('done', line2)

  return llf
}

async function getDLF(level: number): Promise<ArxDLF> {
  const line1 = logger.log(`- [dlf]: loading level ${level} dlf...`)

  const response = await fetch(
    `https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis/level${level}/level${level}.dlf`,
  )
  if (!response.ok) {
    const errorResponse = await response.text()
    throw new Error(`Failed to download level ${level} dlf: ${errorResponse}`)
  }

  logger.log('done', line1)

  await wait(100)

  const line2 = logger.log(`- [dlf]: unpacking level ${level} dlf...`)

  const packedDlf = await response.arrayBuffer()
  const headerSize = getHeaderSize(packedDlf, 'dlf')

  await wait(100)

  const [header, body] = sliceArrayBufferAt(packedDlf, headerSize.total)

  await wait(100)

  const explodedBody = explode(body)
  await wait(100)

  const unpackedDlf = concatArrayBuffers([header, explodedBody])

  await wait(100)

  const dlf = DLF.load(unpackedDlf)

  logger.log('done', line2)

  return dlf
}

async function saveFTS(fts: ArxFTS, level: number): Promise<ArrayBuffer> {
  const line1 = logger.log(`[fts]: packing level ${level} fts...`)

  await wait(100)

  console.time('FTS.save')
  const unpackedFts = FTS.save(fts) // 1739ms
  console.timeEnd('FTS.save')

  await wait(100)

  console.time('getHeaderSize')
  const headerSize = getHeaderSize(unpackedFts, 'fts') // 0ms
  console.timeEnd('getHeaderSize')

  await wait(100)

  console.time('sliceArrayBufferAt')
  const [header, body] = sliceArrayBufferAt(unpackedFts, headerSize.total) // 5ms
  console.timeEnd('sliceArrayBufferAt')

  await wait(100)

  console.time('implode')
  const implodedBody = implode(body, 'binary', 'large') // 14308ms in firefox, 9521ms in chrome
  console.timeEnd('implode')

  await wait(100)

  console.time('concatArrayBuffers')
  const packedFts = concatArrayBuffers([header, implodedBody]) // 3ms
  console.timeEnd('concatArrayBuffers')

  await wait(100)

  logger.log('done', line1)

  return packedFts
}

async function saveLLF(llf: ArxLLF, level: number): Promise<ArrayBuffer> {
  const line1 = logger.log(`[llf]: packing level ${level} llf...`)

  await wait(100)

  console.time('LLF.save')
  const unpackedLlf = LLF.save(llf)
  console.timeEnd('LLF.save')

  await wait(100)

  console.time('getHeaderSize')
  const headerSize = getHeaderSize(unpackedLlf, 'llf')
  console.timeEnd('getHeaderSize')

  await wait(100)

  console.time('sliceArrayBufferAt')
  const [header, body] = sliceArrayBufferAt(unpackedLlf, headerSize.total)
  console.timeEnd('sliceArrayBufferAt')

  await wait(100)

  console.time('implode')
  const implodedBody = implode(body, 'binary', 'large')
  console.timeEnd('implode')

  await wait(100)

  console.time('concatArrayBuffers')
  const packedLlf = concatArrayBuffers([header, implodedBody])
  console.timeEnd('concatArrayBuffers')

  await wait(100)

  logger.log('done', line1)

  return packedLlf
}

async function saveDLF(dlf: ArxDLF, level: number): Promise<ArrayBuffer> {
  const line1 = logger.log(`[dlf]: packing level ${level} dlf...`)

  await wait(100)

  console.time('DLF.save')
  const unpackedDlf = DLF.save(dlf)
  console.timeEnd('DLF.save')

  await wait(100)

  console.time('getHeaderSize')
  const headerSize = getHeaderSize(unpackedDlf, 'dlf')
  console.timeEnd('getHeaderSize')

  await wait(100)

  console.time('sliceArrayBufferAt')
  const [header, body] = sliceArrayBufferAt(unpackedDlf, headerSize.total)
  console.timeEnd('sliceArrayBufferAt')

  await wait(100)

  console.time('implode')
  const implodedBody = implode(body, 'binary', 'large')
  console.timeEnd('implode')

  await wait(100)

  console.time('concatArrayBuffers')
  const packedDlf = concatArrayBuffers([header, implodedBody])
  console.timeEnd('concatArrayBuffers')

  await wait(100)

  logger.log('done', line1)

  return packedDlf
}

// --------------------

isLoading.value = 'loading'

const levelSearchParams = new URLSearchParams(globalThis.location.search)
const levelId = Number.parseInt(levelSearchParams.get('levelIdx') ?? levelSearchParams.get('level') ?? '11', 10)
if (!isValidOriginalArxLevelId(levelId)) {
  isLoading.value = 'rejected'

  if (levelId === 9) {
    throw new Exception(`Invalid level ID "9", Arx Fatalis doesn't have a level 9.`, logger)
  } else {
    throw new Exception(`Invalid level ID "${levelId}"`, logger)
  }
}

currentLevelId.value = levelId

const line1 = logger.log('loading level data...')
const [fts, llf, dlf] = await Promise.all([getFTS(levelId), getLLF(levelId), getDLF(levelId)])

/**
 * The flat/average color of the game textures, keyed by the texture container id of the FTS. The
 * palette of the LLF is the baked *light*, this is the *albedo* the light has to be multiplied
 * with - the `textureContainerId -> filename -> average color` table comes from the game's
 * `data.pak` (see `.infos/experiments/editor-lighting/`).
 */
const flatColors = new Map<number, [number, number, number]>()
const flatColorsByContainerId = flatColorsByFilename as unknown as Record<string, [number, number, number]>
for (const container of fts.textureContainers) {
  const flatColor = flatColorsByContainerId[container.filename]
  if (flatColor !== undefined) {
    flatColors.set(container.id, flatColor)
  }
}
logger.log('done', line1)

isLoading.value = 'fulfilled'

/**
 * The Download button of the header starts the export right away, with the settings the screen shows
 * (the lighting mode, the minimum light level and the shadows switch of the settings panel).
 */
export async function handleDownloadButtonClick(): Promise<void> {
  await startDownload({
    mode: lightingCalculatorMode.value,
    ambientFloor: ambientFloor.value,
    shadows: shadows.value,
  })
}
type DownloadSettings = {
  mode: LightingCalculatorMode
  ambientFloor: number
  shadows: boolean
}

export async function startDownload(settings: DownloadSettings): Promise<void> {
  if (isLoading.value !== 'fulfilled' || isDownloading.value) {
    return
  }

  isDownloading.value = true
  downloadCompleted.value = false
  downloadProgress.value = 0

  try {
    // M1: the surviving polygons and the LLF palette filtered to them; the DLF is saved as it was
    // opened (the editor does not handle entities yet)
    const exportFts = buildExportFts(fts, deletedPolygons)
    // the palette cache is keyed by the settings, so the dialog reuses the display's bake when they match
    const exportPalette =
      settings.mode === 'Realistic'
        ? await getRealisticPalette(settings.ambientFloor, settings.shadows)
        : settings.mode === 'TextureRainbow'
          ? await getRainbowPalette()
          : undefined
    const exportLlf = buildExportLlf(
      fts,
      llf,
      deletedPolygons,
      settings.mode,
      meshes,
      settings.ambientFloor,
      settings.shadows,
      exportPalette,
    )

    // the steps are sequential so the progress can follow them: 20 / 40 / 60 / 80 / 100
    const line1 = logger.log('packing level data...')
    downloadProgress.value = 20

    const packedFts = await saveFTS(exportFts, levelId)
    downloadProgress.value = 40

    const packedLlf = await saveLLF(exportLlf, levelId)
    downloadProgress.value = 60

    const packedDlf = await saveDLF(dlf, levelId)
    downloadProgress.value = 80

    logger.log('done', line1)

    const line2 = logger.log('zipping files...')

    const zip = await zipBuffers({
      [`/game/graph/levels/level${levelId}/fast.fts`]: packedFts,
      [`/graph/levels/level${levelId}/level${levelId}.llf`]: packedLlf,
      [`/graph/levels/level${levelId}/level${levelId}.dlf`]: packedDlf,
    })

    logger.log('done', line2)

    downloadProgress.value = 100

    downloadBinaryAs('mod.zip', zip, 'application/zip')

    // let the 100% be visible for a moment, then show the green check until the next download
    await wait(300)
    downloadCompleted.value = true
  } finally {
    isDownloading.value = false
  }
}

registerDownloadHandler(() => {
  void handleDownloadButtonClick()
})

// --------------------

const scene = new Scene()
const timer = new Timer()

timer.connect(document)


// --------------------

const offset = arxVector3toVector3(fts.header.mScenePosition)

/**
 * How the level is lit on screen, driven by the `lightingCalculatorMode` - the same key the
 * generator's `.env` will have, and the key the URL and the select above the canvas use.
 *
 * - `Arx` (the default) and `Realistic`: the `dynamic` display. The baked LLF color (the light
 *   multiplied by the texture albedo) is the base and the `SemiDynamic` lights around the camera
 *   are added on top of it as point lights, exactly like the game does at runtime. The
 *   `Realistic` will show the computed (shadowed) palette once the M3a lighting bake exists -
 *   until then it looks the same as `Arx`.
 * - `MaxBrightness`: an unlit white material, the `MaxBrightness` mode of the generator (useful
 *   for checking edits to a mesh). A level with an empty LLF falls back to this.
 * - `CompleteDarkness`: an unlit black material, the `CompleteDarkness` mode of the generator.
 *
 * The albedo of the mesh comes from the game's texture averages (`flatColors`), because the editor
 * does not load the textures yet - this is what makes the level look like the game's untextured
 * (flat color) mode instead of a white clay render.
 */
type DisplayLightingMode = 'dynamic' | 'maxBrightness' | 'completeDarkness' | 'rainbow'

/** the `lightingCalculatorMode` (.env) mapped to how the level is displayed */
function getDisplayLightingMode(): DisplayLightingMode {
  if (llf.colors.length === 0) {
    return 'maxBrightness'
  }

  switch (lightingCalculatorMode.value) {
    case 'MaxBrightness':
      return 'maxBrightness'
    case 'CompleteDarkness':
      return 'completeDarkness'
    case 'TextureRainbow':
      return 'rainbow'
    case 'Arx':
    case 'Realistic':
      return 'dynamic'
  }
}

/**
 * How many point lights the dynamic mode may add. The hard limit is
 * `(MAX_FRAGMENT_UNIFORM_VECTORS - 16) / 4`, which is 252 lights with the smallest limit seen in
 * the wild (1024) - but that already includes the camera light, and the shader cost grows with
 * every light, so stay well below it.
 */
const maxDynamicLights = 64

function getVertexColors(): ArxColor[] | undefined {
  // the palette is the light of the level; the max brightness / complete darkness display modes
  // ignore the vertex colors, the dynamic (Arx/Realistic) uses them
  if (llf.colors.length === 0) {
    return undefined
  }

  return llf.colors
}

const vertexColors = getVertexColors()

/**
 * The `baked` attribute is the **final** baked color (the LLF light multiplied by the texture
 * albedo), which is not a light color the material can multiply - it is what the game shows.
 *
 * - in the `dynamic` mode the `MeshLambertMaterial` keeps the albedo (`color` attribute) as the
 *   diffuse and the baked color is added to `totalEmissiveRadiance`, so the semi-dynamic point
 *   lights add **on top of** the baked base (the game does the same at runtime),
 * - in the `baked` mode the `MeshBasicMaterial` is unlit and `diffuseColor.rgb` is replaced with
 *   the baked color.
 */
function addBakedColorToShader(material: MeshLambertMaterial | MeshBasicMaterial, target: 'emissive' | 'diffuse'): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 baked;\nvarying vec3 vBaked;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBaked = baked;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBaked;')

    if (target === 'emissive') {
      const emissiveDeclaration = 'vec3 totalEmissiveRadiance = emissive;'

      if (!shader.fragmentShader.includes(emissiveDeclaration)) {
        console.warn('[lighting] the Lambert fragment shader changed, the baked light is not applied')
        return
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        emissiveDeclaration,
        'vec3 totalEmissiveRadiance = emissive + vBaked;',
      )
      return
    }

    const colorChunk = '#include <color_fragment>'

    if (!shader.fragmentShader.includes(colorChunk)) {
      console.warn('[lighting] the basic fragment shader changed, the baked light is not applied')
      return
    }

    shader.fragmentShader = shader.fragmentShader.replace(colorChunk, 'diffuseColor.rgb = vBaked;')
  }
}

function createMaterial(
  options: {
    color: number
    side?: Side
    transparent?: boolean
    opacity?: number
  },
  displayMode: DisplayLightingMode,
): MeshBasicMaterial | MeshLambertMaterial {
  if (displayMode === 'dynamic') {
    // the baked color is the base of the lighting (the light is already in the vertices), the
    // semi-dynamic point lights add to it
    const material = new MeshLambertMaterial({
      ...options,
      color: Color.white.getHex(),
      vertexColors: vertexColors !== undefined,
    })

    if (vertexColors !== undefined) {
      addBakedColorToShader(material, 'emissive')
    }

    return material
  }

  if (displayMode === 'maxBrightness') {
    return new MeshBasicMaterial({ ...options, color: Color.white.getHex() })
  }

  if (displayMode === 'rainbow') {
    // the baked attribute is the colour (one hue per texture), and it is the *emissive* base so the
    // camera light ([F]) still adds to it - a Lambert surface without the semi-dynamic light pool
    const material = new MeshLambertMaterial({ ...options, color: Color.white.getHex() })
    addBakedColorToShader(material, 'emissive')

    return material
  }

  // CompleteDarkness: the baked attribute is zeroed by `applyLightingCalculatorMode`, so the only
  // light on the lambert surface is the camera light ([F]) - the darkest the editor can show
  const material = new MeshLambertMaterial({ ...options, color: Color.white.getHex(), vertexColors: vertexColors !== undefined })

  if (vertexColors !== undefined) {
    addBakedColorToShader(material, 'emissive')
  }

  return material
}

type MaterialOptions = {
  color: number
  side?: Side
  transparent?: boolean
  opacity?: number
  depthWrite?: boolean
}

type MeshGroup = {
  options: MaterialOptions
  material: MeshBasicMaterial | MeshLambertMaterial
  entries: SourcePolygon[]
  mesh: Mesh
}

function createMeshGroup(
  options: MaterialOptions,
  predicate: (polygon: ArxPolygon) => boolean,
): MeshGroup {
  const material = createMaterial(options, getDisplayLightingMode())
  const entries: SourcePolygon[] = fts.polygons
    .map((polygon, sourceIndex) => {
      return { polygon, sourceIndex }
    })
    .filter(({ polygon }) => {
      return predicate(polygon)
    })

  const mesh = arxPolygonsToMesh(
    entries.map(({ polygon }) => polygon),
    material,
    offset,
    vertexColors,
    flatColors,
  )

  return { options, material, entries, mesh }
}

/**
 * The textures that are **invisible** in the game: `alpha.bmp` is a black image used as a colour
 * key (the black pixels are transparent, `ArxLibertatis` hardcodes `#000`), so the polygons with it
 * are invisible surfaces. They still have to be selectable (the cursor outline and the selection
 * highlight are separate objects), so they get their own group with `opacity: 0`.
 */
const invisibleContainerIds = new Set(
  fts.textureContainers.filter((container) => /alpha/i.test(container.filename)).map((container) => container.id),
)

/** the polygons that have been deleted in the editor - the export drops them */
const deletedPolygons = new Set<number>()

const isVisiblePolygon = (polygon: ArxPolygon): boolean => {
  return !invisibleContainerIds.has(polygon.textureContainerId)
}

const meshGroups: MeshGroup[] = [
  createMeshGroup({ color: Color.white.getHex() }, (polygon) => {
    return isVisiblePolygon(polygon) && !isTransparent(polygon.flags) && !isDoubleSided(polygon.flags) && !isNoDraw(polygon.flags)
  }),
  createMeshGroup({ color: Color.white.getHex(), side: DoubleSide }, (polygon) => {
    return isVisiblePolygon(polygon) && !isTransparent(polygon.flags) && isDoubleSided(polygon.flags) && !isNoDraw(polygon.flags)
  }),
  // the water: it must not write depth, otherwise it hides the overlays that are drawn after it
  createMeshGroup(
    { color: Color.white.getHex(), transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false },
    (polygon) => {
      return isVisiblePolygon(polygon) && isTransparent(polygon.flags) && !isNoDraw(polygon.flags)
    },
  ),
  // the invisible (alpha.bmp) surfaces: opacity 0, but they stay raycastable (DoubleSide, so the
  // cursor finds them from both directions) - the selection highlight shows where they are
  createMeshGroup(
    { color: Color.white.getHex(), transparent: true, opacity: 0, side: DoubleSide, depthWrite: false },
    (polygon) => {
      return !isVisiblePolygon(polygon) && !isNoDraw(polygon.flags)
    },
  ),
]

const meshes: Mesh[] = meshGroups.map(({ mesh }) => mesh)

/** the baked attribute of each group as loaded - the Arx display restores it after a mode switch */
const originalBakedColors = new Map<Mesh, Float32Array>()
for (const { mesh } of meshGroups) {
  const attribute = mesh.geometry.getAttribute('baked')
  if (attribute !== undefined) {
    originalBakedColors.set(mesh, (attribute.array as Float32Array).slice())
  }
}

/**
 * Recomputes the `baked` attribute of every group from the `Realistic` bake (the shadowed palette).
 * The attribute follows the FTS polygons' vertex order (3 per triangle, 4 for a quad), and the
 * final value is the light multiplied by the flat texture albedo, sRGB -> linear.
 */
/**
 * The last `Realistic` palette. Switching between the display modes (`Arx` / `Realistic`) must not
 * re-bake it: the level and the lights do not change, so the result is the same. The cache key holds
 * everything the bake reads from the settings; a light edit (the future light editor) has to call
 * `invalidateRealisticPalette()`.
 */
let realisticPaletteCache: { key: string; palette: ArxColor[] } | undefined
let rainbowPaletteCache: ArxColor[] | undefined

export function invalidateRealisticPalette(): void {
  realisticPaletteCache = undefined
}

async function getRealisticPalette(ambientFloorValue: number, shadowsValue: boolean): Promise<ArxColor[]> {
  const key = `${ambientFloorValue}|${shadowsValue}`

  if (realisticPaletteCache?.key === key) {
    return realisticPaletteCache.palette
  }

  // the bake is a synchronous, CPU heavy loop - let the browser paint the throbber and disable the
  // controls that would start another bake before it starts
  isComputingLighting.value = true
  await wait(50)

  try {
    const line = logger.log('computing lighting...')
    const palette = bakeLlfColors(fts, llf, 'Realistic', meshes, ambientFloorValue, shadowsValue)
    logger.log('done', line)

    realisticPaletteCache = { key, palette }

    return palette
  } finally {
    isComputingLighting.value = false
  }
}

async function applyRealisticBakedColors(): Promise<void> {
  const palette = await getRealisticPalette(ambientFloor.value, shadows.value)

  for (const group of meshGroups) {
    const attribute = group.mesh.geometry.getAttribute('baked')

    if (attribute === undefined) {
      continue
    }

    const array = attribute.array as Float32Array
    let index = 0

    for (const { polygon } of survivingEntries(group)) {
      const flat = flatColors.get(polygon.textureContainerId) ?? [255, 255, 255]

      // the geometry of a quad is made of two triangles: (a, b, c) and (c, b, d) - see
      // `arxPolygonsToMesh()` - so the baked attribute needs **six** values per quad, in that order.
      // Writing four (the LLF's palette order) shifts every following vertex and every polygon gets
      // the colour of its neighbour.
      const vertexOrder = isQuad(polygon) ? [0, 1, 2, 2, 1, 3] : [0, 1, 2]

      for (const vertexIndex of vertexOrder) {
        const colorIndex = polygon.vertices[vertexIndex].llfColorIdx
        const color = colorIndex === undefined ? undefined : palette[colorIndex]

        if (color !== undefined) {
          array[index * 3] = srgbToLinear((color.r / 255) * (flat[0] / 255))
          array[index * 3 + 1] = srgbToLinear((color.g / 255) * (flat[1] / 255))
          array[index * 3 + 2] = srgbToLinear((color.b / 255) * (flat[2] / 255))
        }

        index++
      }
    }

    attribute.needsUpdate = true
  }
}

async function getRainbowPalette(): Promise<ArxColor[]> {
  if (rainbowPaletteCache !== undefined) {
    return rainbowPaletteCache
  }

  isComputingLighting.value = true
  await wait(50)

  try {
    const line = logger.log('computing the texture colours...')
    const palette = bakeLlfColors(fts, llf, 'TextureRainbow', meshes, ambientFloor.value, shadows.value)
    logger.log('done', line)

    rainbowPaletteCache = palette

    return palette
  } finally {
    isComputingLighting.value = false
  }
}

/**
 * Writes the palette into the `baked` attribute. The albedo of the texture is multiplied in, exactly
 * like the `Realistic` mode does (and like the game multiplies the vertex light with its textures):
 * with the pure `hsv(h, 1, 1)` colours the editor looked much brighter than the reference
 * screenshots of the prototype (S≈1.0/V≈1.0 vs S≈0.86/V≈0.5 on the average albedo).
 */
async function applyRainbowBakedColors(): Promise<void> {
  const palette = await getRainbowPalette()

  for (const group of meshGroups) {
    const attribute = group.mesh.geometry.getAttribute('baked')

    if (attribute === undefined) {
      continue
    }

    const array = attribute.array as Float32Array
    let index = 0

    for (const { polygon } of survivingEntries(group)) {
      const flat = flatColors.get(polygon.textureContainerId) ?? [255, 255, 255]
      const vertexOrder = isQuad(polygon) ? [0, 1, 2, 2, 1, 3] : [0, 1, 2]

      for (const vertexIndex of vertexOrder) {
        const colorIndex = polygon.vertices[vertexIndex].llfColorIdx
        const color = colorIndex === undefined ? undefined : palette[colorIndex]

        if (color !== undefined) {
          array[index * 3] = srgbToLinear((color.r / 255) * (flat[0] / 255))
          array[index * 3 + 1] = srgbToLinear((color.g / 255) * (flat[1] / 255))
          array[index * 3 + 2] = srgbToLinear((color.b / 255) * (flat[2] / 255))
        }

        index++
      }
    }

    attribute.needsUpdate = true
  }
}

function setBakedColors(mesh: Mesh, values: Float32Array | 0 | undefined): void {
  if (values === undefined) {
    return
  }

  const attribute = mesh.geometry.getAttribute('baked')

  if (attribute === undefined) {
    return
  }

  const array = attribute.array as Float32Array

  if (values === 0) {
    array.fill(0)
  } else {
    array.set(values)
  }

  attribute.needsUpdate = true
}

function survivingEntries(group: MeshGroup): SourcePolygon[] {
  return group.entries.filter(({ sourceIndex }) => {
    return !deletedPolygons.has(sourceIndex)
  })
}

let triangleToPolygonByMesh = new Map<Mesh, Uint32Array>()

function updateTriangleToPolygonMap(): void {
  triangleToPolygonByMesh = new Map(
    meshGroups.map((group): [Mesh, Uint32Array] => {
      return [group.mesh, buildTriangleToPolygonMap(survivingEntries(group))]
    }),
  )
}

updateTriangleToPolygonMap()

// TODO: add noDraw polygons

// --------------------

scene.add(...meshes)

let wireframeLines: LineSegments[] | undefined
let wireframeDirty = true

function createWireframeLines(): LineSegments[] {
  return meshGroups.map((group) => {
    const wireframe = createPolygonWireframe(
      survivingEntries(group).map(({ polygon }) => polygon),
      offset,
    )
    wireframe.renderOrder = 5
    return wireframe
  })
}

/** built lazily, and only rebuilt on the next show after a deletion while it was hidden */
function ensureWireframeLines(): LineSegments[] {
  if (wireframeLines === undefined || wireframeDirty) {
    wireframeLines = createWireframeLines()
    wireframeDirty = false
  }

  return wireframeLines
}

watch(wireframeVisible, (value) => {
  if (value) {
    scene.add(...ensureWireframeLines())
  } else if (wireframeLines !== undefined) {
    scene.remove(...wireframeLines)
  }
})

if (wireframeVisible.value === true) {
  scene.add(...ensureWireframeLines())
}

// --------------------

/**
 * Debug overlays: the anchors of the pathfinding graph (links in green, the anchors as little blue
 * vertical ticks), the portal quads between the rooms (cyan) and a small colored gizmo at every LLF
 * light. They are built once from the FTS/LLF data and only toggled by the checkboxes, so there is
 * no per-frame work. The overlays are **depth tested** (they do not show through opaque geometry),
 * but they have a high `renderOrder` (8/9) and the transparent materials do not write depth, so a
 * semi transparent surface (the water of level 12) is drawn *before* them and does not hide them -
 * the graph still stops at the opaque walls. The `Mesh` switch turns the geometry off entirely, then
 * the overlays are visible everywhere (no `depthTest: false` anywhere).
 */
function ftsPositionToThree(position: ArxVector3): Vector3 {
  return arxVector3toVector3(position).sub(offset)
}

const anchorsGroup = new Group()

if (fts.anchors.length > 0) {
  const anchorLinkPositions: number[] = []
  const anchorTickPositions: number[] = []

  fts.anchors.forEach((anchor, index) => {
    const from = ftsPositionToThree(anchor.data.position)

    // the FTS anchor has a `height` (always -165 in the original levels, arx-convert does not
    // expose it because it is uniform) - the game's Pathfinding debug view draws the anchor as a
    // vertical line of this height, which is about the eye height of the player
    anchorTickPositions.push(from.x, from.y, from.z, from.x, from.y + 165, from.z)

    for (const linkedIndex of anchor.linkedAnchors) {
      if (linkedIndex <= index || linkedIndex >= fts.anchors.length) {
        continue
      }

      const to = ftsPositionToThree(fts.anchors[linkedIndex].data.position)
      anchorLinkPositions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  })

  const anchorLinksGeometry = new BufferGeometry()
  anchorLinksGeometry.setAttribute('position', new BufferAttribute(new Float32Array(anchorLinkPositions), 3))
  const anchorLinks = new LineSegments(
    anchorLinksGeometry,
    new LineBasicMaterial({ color: 0x35d84a, transparent: true, opacity: 0.9 }),
  )
  anchorLinks.renderOrder = 8

  const anchorTicksGeometry = new BufferGeometry()
  anchorTicksGeometry.setAttribute('position', new BufferAttribute(new Float32Array(anchorTickPositions), 3))
  const anchorTicks = new LineSegments(
    anchorTicksGeometry,
    new LineBasicMaterial({ color: 0x4b7cff, transparent: true, opacity: 0.9 }),
  )
  anchorTicks.renderOrder = 8

  anchorsGroup.add(anchorLinks, anchorTicks)
}

anchorsGroup.visible = anchorsVisible.value
scene.add(anchorsGroup)

const portalsGroup = new Group()

if (fts.portals.length > 0) {
  const portalPositions: number[] = []

  for (const portal of fts.portals) {
    const vertices = portal.polygon.vertices.map(({ position }) => ftsPositionToThree(position))

    // the stored vertex order is a "Z" (0, 1, 2, 3), the perimeter is 0-1-3-2 - with the stored
    // order the last two edges would be the diagonals of the quad
    for (const [fromIndex, toIndex] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      const from = vertices[fromIndex]
      const to = vertices[toIndex]
      portalPositions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  }

  const portalGeometry = new BufferGeometry()
  portalGeometry.setAttribute('position', new BufferAttribute(new Float32Array(portalPositions), 3))
  const portalLines = new LineSegments(
    portalGeometry,
    new LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9 }),
  )
  portalLines.renderOrder = 8
  portalsGroup.add(portalLines)
}

portalsGroup.visible = portalsVisible.value
scene.add(portalsGroup)

let lightGizmos: InstancedMesh | undefined

if (llf.lights.length > 0) {
  const gizmos = new InstancedMesh(
    new OctahedronGeometry(20, 0),
    new MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.9 }),
    llf.lights.length,
  )

  const dummy = new Object3D()
  const color = new ThreeColor()

  llf.lights.forEach((light, index) => {
    dummy.position.copy(arxVector3toVector3(light.position))
    dummy.updateMatrix()
    gizmos.setMatrixAt(index, dummy.matrix)

    color.setHex(Color.fromArxColor(light.color).getHex())
    gizmos.setColorAt(index, color)
  })

  gizmos.instanceMatrix.needsUpdate = true

  if (gizmos.instanceColor !== null) {
    gizmos.instanceColor.needsUpdate = true
  }

  gizmos.renderOrder = 9
  gizmos.visible = lightsVisible.value
  scene.add(gizmos)

  lightGizmos = gizmos
}

watch(anchorsVisible, (value) => {
  anchorsGroup.visible = value
})

// the `Mesh` switch: the geometry (all mesh groups) can be hidden, then the wireframe and the
// overlays are visible everywhere without any `depthTest: false`
function updateMeshVisibility(): void {
  for (const { mesh } of meshGroups) {
    mesh.visible = meshVisible.value
  }
}

updateMeshVisibility()

watch(meshVisible, updateMeshVisibility)

watch(portalsVisible, (value) => {
  portalsGroup.visible = value
})

watch(lightsVisible, (value) => {
  if (lightGizmos !== undefined) {
    lightGizmos.visible = value
  }
})

// --------------------

/**
 * The Arx light model is **not** inverse-square: a light is at full strength until `fallStart`,
 * then fades linearly to zero at `fallEnd` (`ArxLibertatis/src/scene/Light.cpp`, `GetColorz()` and
 * `CALC_DLIGHT`), and the LLF `colors` were baked with exactly this formula (the old
 * `arx-level-generator` repeats it in `calculateDanaeVertexColor()`).
 *
 * three.js has no such falloff, but `decay = 0` (no distance falloff) with `distance = fallEnd`
 * (the cutoff) is close: the smooth cutoff is ~1 until `fallStart` - which is usually around
 * `fallEnd / 2` - and then falls to 0, very much like the linear ramp.
 *
 * The intensity is converted to three's physical unit: the Arx formula multiplies
 * `dot(normal, lightDirection) * intensity * GLOBAL_LIGHT_FACTOR` into the vertex color, and
 * three's Lambert BRDF divides the irradiance by π, so `intensity = arx.intensity * 0.85 * π`.
 */
const ARX_GLOBAL_LIGHT_FACTOR = 0.85

/**
 * The baked LLF color already contains the contribution of every static light of the level, so
 * the dynamic point lights would count those lights twice. They are added with this fraction of
 * their true intensity: enough to see where a light is and how far it reaches, but not enough to
 * blow out the baked base. Set it to 1 once the editor handles lights that are not baked yet.
 */
const dynamicLightIntensityScale = 0.25

/**
 * A fixed pool of point lights, refilled with the lights closest to the camera. The size of the
 * pool never changes: the number of point lights is baked into the shader, so adding or removing
 * one would re-link the program. An unused slot has `intensity = 0`.
 *
 * Never add one point light per LLF light: level 2 has 553 of them, which is 2228 fragment uniform
 * vectors, and the shader stops linking above `MAX_FRAGMENT_UNIFORM_VECTORS` (1024 on many
 * windows/angle drivers) - that is what made the mesh disappear on 13 of the 23 levels.
 */
const dynamicLights: PointLight[] = []

for (let i = 0; i < maxDynamicLights; i++) {
  dynamicLights.push(new PointLight(Color.white.getHex(), 0, 0, 0))
}

let dynamicLightsVisible = false

function setDynamicLightsVisible(visible: boolean): void {
  if (visible === dynamicLightsVisible) {
    return
  }

  dynamicLightsVisible = visible

  if (visible) {
    scene.add(...dynamicLights)
  } else {
    scene.remove(...dynamicLights)
  }
}

setDynamicLightsVisible(usesDynamicLightPool())

const cameraLight = new PointLight(Color.white.getHex(), 10_000)

watch(cameraLightVisible, (value) => {
  if (value) {
    scene.add(cameraLight)
  } else {
    scene.remove(cameraLight)
  }
})

if (cameraLightVisible.value === true) {
  scene.add(cameraLight)
}

// --------------------

const renderer = new WebGLRenderer({ antialias: true, canvas })
renderer.setClearColor(Color.white.darken(90).getHex())
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

renderer.autoClear = false

const fov = 75
const aspect = canvas.clientWidth / canvas.clientHeight
const near = 0.1
const far = 10_000
const camera = new PerspectiveCamera(fov, aspect, near, far)

camera.position.copy(arxVector3toVector3(dlf.header.player.position))
camera.rotation.y = MathUtils.degToRad(180)

/**
 * The camera state is mirrored into the URL, so a view can be shared: `?positionAt=x,y,z` and
 * `?angle=pitch,yaw,roll`. The values are in the **game coordinate system** (the one `player.pos`
 * uses): the position is `dlf.position + mScenePosition`, the angle is the game rotation in degrees
 * (pitch -90..90, a positive pitch looks down; yaw 0..360; roll is accepted but ignored, the editor
 * has no roll). The order and the three values match the `rotation` line of the game's debug hud,
 * so it can be copied over directly.
 *
 * The conversion follows from the transform of the mesh (see `context/koordinata-rendszer.md` in
 * the .infos repository): the geometry is `M(v - mScenePosition)` with `M(x, y, z) = (-x, -y, z)`,
 * so `three = M(game - s)` and `game = M(three) + s`. For a three camera with a `YXZ` euler,
 * `yaw_game = three_yaw + 180` (three looks towards -Z) and `pitch_game = -three_pitch` (M flips
 * the Y axis).
 */
const scenePosition = fts.header.mScenePosition
const cameraEuler = new Euler(0, 0, 0, 'YXZ')

function gamePositionToThreePosition(x: number, y: number, z: number): Vector3 {
  return new Vector3(scenePosition.x - x, scenePosition.y - y, z - scenePosition.z)
}

function threePositionToGamePosition(position: Vector3): { x: number; y: number; z: number } {
  return {
    x: scenePosition.x - position.x,
    y: scenePosition.y - position.y,
    z: scenePosition.z + position.z,
  }
}

function setCameraAngleFromGameAngle(pitch: number, yaw: number): void {
  // the roll is not wired in: the camera of the editor has no roll
  camera.rotation.set(MathUtils.degToRad(-pitch), MathUtils.degToRad(yaw - 180), 0, 'YXZ')
}

function getGameAngleOfCamera(): { yaw: number; pitch: number } {
  cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ')

  return {
    yaw: (MathUtils.radToDeg(cameraEuler.y) + 180 + 360) % 360,
    pitch: -MathUtils.radToDeg(cameraEuler.x),
  }
}

/** parses `x,y,z` (or `pitch,yaw,roll`); `undefined` when the value is missing or malformed */
function parseNumberTuple(value: string | null, length: number): number[] | undefined {
  if (value === null) {
    return undefined
  }

  const parts = value.split(',').map((part) => {
    return Number.parseFloat(part.trim())
  })

  if (parts.length !== length || parts.some((part) => !Number.isFinite(part))) {
    return undefined
  }

  return parts
}

function applyCameraStateFromUrl(): void {
  const params = new URLSearchParams(globalThis.location.search)

  const position = parseNumberTuple(params.get('positionAt'), 3)
  if (position !== undefined) {
    const [x, y, z] = position
    camera.position.copy(gamePositionToThreePosition(x, y, z))
  }

  const angle = parseNumberTuple(params.get('angle'), 3)
  if (angle !== undefined) {
    const [pitch, yaw] = angle

    // a broken angle should not move the camera; the third value (the roll) is ignored
    if (yaw >= 0 && yaw < 360 && pitch >= -90 && pitch <= 90) {
      setCameraAngleFromGameAngle(pitch, yaw)
    } else {
      console.warn(`[camera] ignoring the angle from the url: ${angle.join(',')}`)
    }
  }
}

/**
 * Shows the camera state in the top left corner of the canvas, in the **game coordinate system**
 * and in the same format as the game's debug hud (`position x y z`, `rotation pitch yaw roll`),
 * so the two can be compared directly. The url uses the same order (`angle=pitch,yaw,roll`).
 */
function updateCameraInfo(): void {
  if (!cameraInfoVisible.value) {
    return
  }

  const position = threePositionToGamePosition(camera.position)
  const { yaw, pitch } = getGameAngleOfCamera()

  cameraInfo.textContent = [
    `position ${position.x.toFixed(2)} ${position.y.toFixed(2)} ${position.z.toFixed(2)}`,
    `rotation ${pitch.toFixed(2)} ${yaw.toFixed(2)} 0.00`,
  ].join('\n')
}

/** how often the camera state is written into the url (ms) */
const cameraUrlUpdateInterval = 250
let lastCameraUrlUpdateAt = Number.NEGATIVE_INFINITY
let lastCameraUrl: string | undefined

/**
 * Writes the camera state into the **current** history entry with `replaceState`: the address bar
 * always shows the current view, but no new history entries are created, so the back button still
 * goes to the page that was open before the editor.
 */
function updateCameraUrl(): void {
  const now = performance.now()
  if (now - lastCameraUrlUpdateAt < cameraUrlUpdateInterval) {
    return
  }

  lastCameraUrlUpdateAt = now

  const position = threePositionToGamePosition(camera.position)
  const { yaw, pitch } = getGameAngleOfCamera()

  updateCameraInfo()

  const params = new URLSearchParams(globalThis.location.search)
  params.set('positionAt', `${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}`)
  params.set('angle', `${pitch.toFixed(2)},${yaw.toFixed(2)},0.00`)

  // the commas are legal in a query string and make the url readable
  const search = params.toString().replaceAll('%2C', ',')
  const url = `${globalThis.location.pathname}?${search}${globalThis.location.hash}`

  if (url === lastCameraUrl) {
    return
  }

  globalThis.history.replaceState(globalThis.history.state, '', url)
  lastCameraUrl = url
}

watch(cameraInfoVisible, () => {
  updateCameraInfo()
})

applyCameraStateFromUrl()
updateCameraUrl()

/** how often the dynamic light pool follows the camera (ms) */
const dynamicLightsUpdateInterval = 250
let lastDynamicLightsUpdateAt = Number.NEGATIVE_INFINITY

/**
 * The `Realistic` palette is baked from **every** light of the level (the static ones and the
 * `SemiDynamic` ones, with occlusion), so the point light pool would count the `SemiDynamic`
 * lights twice. The pool is only used by the `Arx` display, where the palette is the game's
 * original (static only) background lighting - exactly like the game, which adds the
 * `SemiDynamic` lights at runtime.
 */
function usesDynamicLightPool(): boolean {
  // the rainbow mode gets the pool too: the game's UW view still has the semi-dynamic lights (the
  // torches), so without them the editor looks darker than the game at the same spot
  if (lightingCalculatorMode.value === 'TextureRainbow') {
    return true
  }

  return getDisplayLightingMode() === 'dynamic' && lightingCalculatorMode.value !== 'Realistic'
}

/**
 * Refills the fixed point light pool with the `maxDynamicLights` **semi-dynamic** lights closest
 * to the camera, in the Arx falloff of the level (see `ARX_GLOBAL_LIGHT_FACTOR`). The static
 * lights are already baked into the palette, so adding them here would light the level twice -
 * only the `SemiDynamic` lights (the fire of the torches, the extinguishable sources) are added,
 * exactly like the game does at runtime. The `Realistic` display does not use the pool, see
 * `usesDynamicLightPool()`.
 *
 * NOTE: the lights are the plain objects of the LLF, so an editing UI can move one
 * (`light.position = ...`) or change its falloff (`light.fallStart`/`light.fallEnd`) and then call
 * `applyLightingCalculatorMode()` to re-bake the palette. The editing UI itself is not implemented
 * yet.
 */
function updateDynamicLights(): void {
  if (!usesDynamicLightPool()) {
    return
  }

  const now = performance.now()
  if (now - lastDynamicLightsUpdateAt < dynamicLightsUpdateInterval) {
    return
  }

  lastDynamicLightsUpdateAt = now

  const cameraPosition = camera.position

  const nearestLights = llf.lights
    .filter((light) => {
      return (light.flags & ArxLightFlags.SemiDynamic) !== 0
    })
    .map((light) => {
      const position = arxVector3toVector3(light.position)
      return { light, position, distance: position.distanceToSquared(cameraPosition) }
    })
    .toSorted((a, b) => {
      return a.distance - b.distance
    })
    .slice(0, maxDynamicLights)

  dynamicLights.forEach((pointLight, index) => {
    const nearest = nearestLights[index]

    if (nearest === undefined) {
      pointLight.intensity = 0
      return
    }

    const { light, position } = nearest

    pointLight.position.copy(position)
    pointLight.color.setHex(Color.fromArxColor(light.color).getHex())
    pointLight.intensity = light.intensity * ARX_GLOBAL_LIGHT_FACTOR * Math.PI * dynamicLightIntensityScale
    pointLight.distance = light.fallEnd
    pointLight.decay = 0
  })
}

updateDynamicLights()

/** swaps the materials of the three groups and the light pool to the selected display mode */
async function applyLightingCalculatorMode(): Promise<void> {
  const displayMode = getDisplayLightingMode()

  for (const group of meshGroups) {
    const oldMaterial = group.material
    const material = createMaterial(group.options, displayMode)
    group.material = material
    group.mesh.material = material
    oldMaterial.dispose()
  }

  if (displayMode === 'dynamic' && lightingCalculatorMode.value === 'Realistic') {
    await applyRealisticBakedColors()
  } else if (displayMode === 'rainbow') {
    await applyRainbowBakedColors()
  } else {
    for (const { mesh } of meshGroups) {
      setBakedColors(mesh, displayMode === 'completeDarkness' ? 0 : originalBakedColors.get(mesh))
    }
  }

  setDynamicLightsVisible(usesDynamicLightPool())

  if (usesDynamicLightPool()) {
    lastDynamicLightsUpdateAt = Number.NEGATIVE_INFINITY
    updateDynamicLights()
  }
}

watch(lightingCalculatorMode, () => {
  void applyLightingCalculatorMode()
})

// changing the ambient floor or the shadows re-bakes the Realistic palette (both are part of the
// bake, so the exported LLF gets the same values as the display)
watch(ambientFloor, () => {
  void applyLightingCalculatorMode()
})

watch(shadows, () => {
  void applyLightingCalculatorMode()
})

// the URL (`?lightingCalculatorMode=Realistic`) and the select both set the ref, but a watcher
// only fires on *changes* - so without this the mode from the URL was never applied on load: the
// level was shown with the LLF's own palette (the `Arx` look) until the select was touched twice
void applyLightingCalculatorMode()

function resizeRendererToDisplaySize(renderer: WebGLRenderer): boolean {
  const canvas = renderer.domElement
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const needResize = canvas.width !== width || canvas.height !== height
  if (needResize) {
    renderer.setSize(width, height, false)
  }

  return needResize
}

const controls = new PointerLockControls(camera, document.body)
const viewHelper = new ViewHelper(camera, document.body)

const pressedKeys: Record<string, boolean> = {}

const selectedPolygons = new Set<number>()
let polygonBeingLookedAt: number | undefined

const cursorTriangleMaterial = new MeshBasicMaterial({ color: Color.green.getHex() })
const cursorTriangleMesh = new LineSegments(renderTriangle(new Triangle()), cursorTriangleMaterial)

const highlightMaterial = new MeshBasicMaterial({
  color: Color.yellow.getHex(),
  side: DoubleSide,
  transparent: true,
  opacity: 0.35,
})

let highlightOfSelectedPolygons: Mesh[] = []

/** the stored vertex order is a "Z" (0, 1, 2, 3), the perimeter is 0-1-3-2 for a quad */
function getPolygonPerimeter(polygon: ArxPolygon): number[] {
  return isQuad(polygon) ? [0, 1, 3, 2] : [0, 1, 2]
}

function getPolygonVertices(polygon: ArxPolygon): Vector3[] {
  return polygon.vertices.map((vertex) => {
    return arxVector3toVector3(vertex).sub(offset)
  })
}

/**
 * The phantom cursor outline of the polygon under the crosshair: the whole quad (both of its
 * triangles), not just the triangle the raycast hit.
 */
function createPolygonOutlineGeometry(polygon: ArxPolygon): BufferGeometry {
  const vertices = getPolygonVertices(polygon)
  const perimeter = getPolygonPerimeter(polygon)
  const positions: number[] = []

  for (let i = 0; i < perimeter.length; i++) {
    const from = vertices[perimeter[i]]
    const to = vertices[perimeter[(i + 1) % perimeter.length]]
    positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

function createPolygonFillGeometry(polygon: ArxPolygon): BufferGeometry {
  const vertices = getPolygonVertices(polygon)
  const triangles = isQuad(polygon)
    ? [
        [0, 1, 2],
        [2, 1, 3],
      ]
    : [[0, 1, 2]]
  const positions: number[] = []

  for (const [a, b, c] of triangles) {
    // prettier-ignore
    positions.push(
      vertices[a].x, vertices[a].y, vertices[a].z,
      vertices[b].x, vertices[b].y, vertices[b].z,
      vertices[c].x, vertices[c].y, vertices[c].z,
    )
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

/** how far the cursor and the selection raycast look (game units) */
const SELECTION_RAY_FAR = 100_000

/** how many of the nearest hits are checked for a connected polygon while dragging */
const SELECTION_CANDIDATE_LIMIT = 32

/** the selection is polygon based: a quad is one unit, both of its triangles are highlighted */
/**
 * Draws the selection as **one** mesh: a flood fill can select a few thousand polygons (the biggest
 * connected same texture area of the original levels is ~1800), and one draw call per polygon would
 * make that unusable. The geometries of the polygons are concatenated into a single position buffer.
 */
function updateHighlightOfSelectedPolygons(): void {
  if (highlightOfSelectedPolygons.length > 0) {
    scene.remove(...highlightOfSelectedPolygons)
    highlightOfSelectedPolygons.forEach((mesh) => {
      mesh.geometry.dispose()
    })
  }

  const positions: number[] = []

  for (const polygonIndex of selectedPolygons) {
    const polygon = fts.polygons[polygonIndex]

    if (polygon === undefined) {
      continue
    }

    const attribute = createPolygonFillGeometry(polygon).getAttribute('position')
    const array = attribute.array as Float32Array

    for (const value of array) {
      positions.push(value)
    }
  }

  if (positions.length === 0) {
    highlightOfSelectedPolygons = []

    return
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  const mesh = new Mesh(geometry, highlightMaterial)
  mesh.renderOrder = 7
  highlightOfSelectedPolygons = [mesh]
  scene.add(mesh)
}

/**
 * The FTS polygon is the unit of the level data: deleting any of its triangles deletes the whole
 * polygon, the three merged geometries are rebuilt from the surviving polygons, and the deleted
 * set is what the download drops from the FTS/LLF.
 */
function deletePolygons(polygonsToDelete: ReadonlySet<number>): void {
  if (polygonsToDelete.size === 0) {
    return
  }

  for (const polygonIndex of polygonsToDelete) {
    deletedPolygons.add(polygonIndex)
  }

  for (const group of meshGroups) {
    const triangleToPolygon = triangleToPolygonByMesh.get(group.mesh)

    if (triangleToPolygon === undefined) {
      continue
    }

    const removedTriangles = new Set<number>()

    for (let triangle = 0; triangle < triangleToPolygon.length; triangle++) {
      if (polygonsToDelete.has(triangleToPolygon[triangle])) {
        removedTriangles.add(triangle)
      }
    }

    if (removedTriangles.size === 0) {
      continue
    }

    const geometry = removeTriangles(group.mesh.geometry, removedTriangles)
    group.mesh.geometry.dispose()
    group.mesh.geometry = geometry
  }

  updateTriangleToPolygonMap()

  isDirty.value = true

  wireframeDirty = true

  if (wireframeVisible.value) {
    if (wireframeLines !== undefined) {
      scene.remove(...wireframeLines)
    }

    scene.add(...ensureWireframeLines())
  }

  selectedPolygons.clear()
  updateHighlightOfSelectedPolygons()
  polygonBeingLookedAt = undefined

  cursorTriangleMaterial.color.set(Color.green.getHex())
  scene.remove(cursorTriangleMesh)
}


/**
 * being relevant when new polygons are to be added to or removed from the selectedPolygons
 *
 * if the left mouse button is pressed with a face that is already in the selection,
 * that means the polygon will be removed and all subsequent polygons will get removed from selectedPolygons
 * otherwise all subsequent polygons will be added
 *
 * until the first polygon is clicked the state is undefined
 */
/**
 * The vertices of the polygons that were selected **during the current drag**, in a grid so a
 * candidate can be tested quickly. A new polygon is only added when one of its vertices is closer
 * than `selectionConnectDistance` to one of them: without this, a fast drag jumps over the gaps of
 * the geometry and selects disconnected "islands" on the other side of the level.
 *
 * The distance is a tolerance instead of an exact match because the level meshes are not welded:
 * their seams are off by less than 0.1 units, and an exact match stops the drag there (the polygons
 * look adjacent). Only the **used** vertices are stored (3 for a triangle, 4 for a quad): the fourth
 * vertex of a triangle is a degenerate placeholder, and about 9 500 polygons of level 0 share the
 * same (0, 0, 0) position - including it would connect the whole level.
 *
 * A simple click (no drag) is not restricted, so a separate selection can still be started elsewhere.
 */
let selectionDragVertices: Map<string, SelectionPoint[]> | undefined

type SelectionPoint = { x: number; y: number; z: number }

/** the grid cell of the selection lookup (game units) */
const SELECTION_GRID_CELL = 4

function getSelectionGridKey(x: number, y: number, z: number): string {
  return `${Math.floor(x / SELECTION_GRID_CELL)}:${Math.floor(y / SELECTION_GRID_CELL)}:${Math.floor(z / SELECTION_GRID_CELL)}`
}

/** the vertices the polygon actually renders (the 4th vertex of a triangle is unused) */
function getUsedVerticesOf(polygon: ArxPolygon): SelectionPoint[] {
  const count = isQuad(polygon) ? 4 : 3

  return polygon.vertices.slice(0, count).map(({ x, y, z }) => {
    return { x, y, z }
  })
}

function addVerticesToSelectionGrid(vertices: SelectionPoint[]): void {
  if (selectionDragVertices === undefined) {
    return
  }

  for (const vertex of vertices) {
    const key = getSelectionGridKey(vertex.x, vertex.y, vertex.z)
    let cell = selectionDragVertices.get(key)

    if (cell === undefined) {
      cell = []
      selectionDragVertices.set(key, cell)
    }

    cell.push(vertex)
  }
}

/** the rounded position of a vertex, the key of the neighbour lookup of the flood fill */
function getVertexKey(vertex: { x: number; y: number; z: number }): string {
  return `${vertex.x.toFixed(2)}:${vertex.y.toFixed(2)}:${vertex.z.toFixed(2)}`
}

/**
 * The polygons grouped by their vertex positions (built lazily, once per level). Two polygons that
 * share a vertex position are neighbours - the same rule the dragged selection uses, so the flood
 * fill follows the welds of the mesh and stops at the seams where the mesh is not welded.
 */
let polygonsByVertexKey: Map<string, number[]> | undefined

function getPolygonsByVertexKey(): Map<string, number[]> {
  if (polygonsByVertexKey !== undefined) {
    return polygonsByVertexKey
  }

  const index = new Map<string, number[]>()

  fts.polygons.forEach((polygon, polygonIndex) => {
    for (const vertex of getUsedVerticesOf(polygon)) {
      const key = getVertexKey(vertex)
      let list = index.get(key)

      if (list === undefined) {
        list = []
        index.set(key, list)
      }

      list.push(polygonIndex)
    }
  })

  polygonsByVertexKey = index

  return index
}

/**
 * Selects the connected polygons that use the **same texture** as the start polygon (a double
 * click). There is no radius limit: the whole connected area is selected (the owner asked for it -
 * a limited fill looked like a broken selection on the castle wall of level 12). The biggest
 * connected same texture area of the original levels is ~1800 polygons, and the highlight is a
 * single merged mesh, so the size is not a problem.
 */
function selectSameTextureArea(startPolygonIndex: number, mode: SelectionMode): void {
  const start = fts.polygons[startPolygonIndex]

  if (start === undefined) {
    return
  }

  const index = getPolygonsByVertexKey()
  const selected = new Set<number>()
  const visited = new Set<number>([startPolygonIndex])
  const queue = [startPolygonIndex]

  while (queue.length > 0) {
    const polygonIndex = queue.pop()

    if (polygonIndex === undefined) {
      break
    }

    const polygon = fts.polygons[polygonIndex]

    if (polygon === undefined) {
      continue
    }

    selected.add(polygonIndex)

    for (const vertex of getUsedVerticesOf(polygon)) {
      for (const neighbour of index.get(getVertexKey(vertex)) ?? []) {
        if (visited.has(neighbour)) {
          continue
        }

        const candidate = fts.polygons[neighbour]

        if (candidate === undefined || candidate.textureContainerId !== start.textureContainerId) {
          continue
        }

        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
  }

  if (mode === 'remove') {
    for (const polygonIndex of selected) {
      selectedPolygons.delete(polygonIndex)
    }
  } else {
    if (mode === 'replace') {
      selectedPolygons.clear()
    }

    for (const polygonIndex of selected) {
      selectedPolygons.add(polygonIndex)
    }
  }

  updateHighlightOfSelectedPolygons()

  const verb = mode === 'remove' ? 'removed' : 'selected'
  logger.log(`${verb} ${selected.size} polygons of the same texture`)
}

/** drops the whole selection (the "clear selection" button and the alt+a hotkey) */
function clearSelection(): void {
  if (selectedPolygons.size === 0) {
    return
  }

  selectedPolygons.clear()
  updateHighlightOfSelectedPolygons()
}

/** the bounding volume hierarchy of the mesh, or undefined when three-mesh-bvh did not build one */
function getBoundsTreeOf(mesh: Mesh): MeshBVH | undefined {
  const boundsTree = mesh.geometry.boundsTree

  return boundsTree instanceof MeshBVH ? boundsTree : undefined
}

/** is any of the vertices closer than `selectionConnectDistance` to a vertex selected in this drag? */
function isConnectedToSelection(vertices: SelectionPoint[]): boolean {
  if (selectionDragVertices === undefined || selectionDragVertices.size === 0) {
    return true
  }

  const distance = Math.min(10, Math.max(0, selectionConnectDistance.value))
  const distanceSquared = distance * distance
  const reach = Math.max(1, Math.ceil(distance / SELECTION_GRID_CELL))

  for (const vertex of vertices) {
    const cellX = Math.floor(vertex.x / SELECTION_GRID_CELL)
    const cellY = Math.floor(vertex.y / SELECTION_GRID_CELL)
    const cellZ = Math.floor(vertex.z / SELECTION_GRID_CELL)

    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dz = -reach; dz <= reach; dz++) {
          const cell = selectionDragVertices.get(`${cellX + dx}:${cellY + dy}:${cellZ + dz}`)

          if (cell === undefined) {
            continue
          }

          for (const other of cell) {
            const x = other.x - vertex.x
            const y = other.y - vertex.y
            const z = other.z - vertex.z

            if (x * x + y * y + z * z <= distanceSquared) {
              return true
            }
          }
        }
      }
    }
  }

  return false
}

/**
 * What the current drag does with the selection: `replace` starts a new one (clearing the previous),
 * `add` (shift) and `remove` (ctrl / cmd) extend it. `undefined` while no drag is in progress.
 */
let selectionDragMode: 'replace' | 'add' | 'remove' | undefined

type SelectionMode = 'replace' | 'add' | 'remove'

/** the mode of the gesture, from the modifiers of the mouse event itself (always up to date) */
function getSelectionModeFromEvent(event: MouseEvent): SelectionMode {
  if (event.ctrlKey || event.metaKey) {
    return 'remove'
  }

  if (event.shiftKey) {
    return 'add'
  }

  return 'replace'
}

/** the mode of the gesture, from the tracked keys (for the camera changes inside a drag) */
function getSelectionMode(): SelectionMode {
  if (pressedKeys.ControlLeft || pressedKeys.ControlRight || pressedKeys.MetaLeft || pressedKeys.MetaRight) {
    return 'remove'
  }

  if (pressedKeys.ShiftLeft || pressedKeys.ShiftRight) {
    return 'add'
  }

  return 'replace'
}

/** the mode of the gesture that is currently pressed down (set on mousedown) */
let pendingSelectionMode: SelectionMode | undefined

/** the modifier keys: their state changes the colour of the cursor outline, no mouse move needed */
function isModifierKey(code: string): boolean {
  return (
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'MetaLeft' ||
    code === 'MetaRight'
  )
}

/** repaints the cursor outline for the current mode (red only when the gesture would remove) */
function updateCursorColor(): void {
  if (polygonBeingLookedAt === undefined) {
    return
  }

  const mode = selectionDragMode ?? getSelectionMode()

  cursorTriangleMaterial.color.set(mode === 'remove' ? Color.red.getHex() : Color.green.getHex())
}

function render(): void {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }

  const delta = timer.getDelta()

  controls.update(delta)

  updateCameraUrl()

  renderer.clear()
  renderer.render(scene, camera)
  viewHelper.render(renderer)
}

function animate(): void {
  timer.update()
  updateDynamicLights()

  if (controls.isLocked) {
    mouseLocked.style.display = 'block'
    mouseUnlocked.style.display = 'none'

    const facing = new Vector3()
    camera.getWorldDirection(facing)

    const direction = new Vector3(0, 0, 0)

    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code

    if (pressedKeys.KeyA || pressedKeys.ArrowLeft) {
      const rotation = new Euler(0, MathUtils.degToRad(90), 0, 'XYZ')
      const sideDirection = facing.clone().applyEuler(rotation)
      sideDirection.y = 0
      direction.add(sideDirection)
    }

    if (pressedKeys.KeyD || pressedKeys.ArrowRight) {
      const rotation = new Euler(0, MathUtils.degToRad(-90), 0, 'XYZ')
      const sideDirection = facing.clone().applyEuler(rotation)
      sideDirection.y = 0
      direction.add(sideDirection)
    }

    if (pressedKeys.KeyW || pressedKeys.ArrowUp) {
      direction.add(facing)
    }

    if (pressedKeys.KeyS || pressedKeys.ArrowDown) {
      direction.add(facing.clone().negate())
    }

    const cameraSpeed = 10
    direction.normalize()

    if (pressedKeys.ShiftLeft || pressedKeys.ShiftRight) {
      direction.multiplyScalar(cameraSpeed / 2)
    } else {
      direction.multiplyScalar(cameraSpeed)
    }

    camera.position.add(direction)
    cameraLight.position.set(camera.position.x, camera.position.y, camera.position.z)

    if (pressedKeys.Delete && selectedPolygons.size > 0) {
      deletePolygons(selectedPolygons)
    }
  } else {
    mouseLocked.style.display = 'none'
    mouseUnlocked.style.display = 'block'
  }

  render()
}

renderer.setAnimationLoop(animate)
cameraLight.position.set(camera.position.x, camera.position.y, camera.position.z)

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === 'Escape') {
    controls.unlock()

    updateMouseButtonState(LeftMouseButton, false)
    updateMouseButtonState(RightMouseButton, false)
    updateMouseButtonState(MiddleMouseButton, false)

    return
  }

  // the escape key belongs to the browser while the pointer is locked (it leaves the lock and the
  // page does not even get the keydown in firefox), so a plain letter key clears the selection
  // without leaving: [c]
  if (event.code === 'KeyC' && selectedPolygons.size > 0) {
    clearSelection()

    return
  }

  pressedKeys[event.code] = true

  if (isModifierKey(event.code)) {
    updateCursorColor()
  }
}

function onKeyUp(event: KeyboardEvent): void {
  pressedKeys[event.code] = false

  if (isModifierKey(event.code)) {
    updateCursorColor()
  }
}

document.addEventListener('keydown', onKeyDown, false)
document.addEventListener('keyup', onKeyUp, false)

document.addEventListener(
  'mousedown',
  (event) => {
    if (!controls.isLocked) {
      return
    }

    updateMouseButtonStates(event)

    pendingSelectionMode = getSelectionModeFromEvent(event)

    cursorTriangleMaterial.color.set(
      pendingSelectionMode === 'remove' ? Color.red.getHex() : Color.green.getHex(),
    )
  },
  false,
)

document.addEventListener(
  'mouseup',
  (event) => {
    if (!controls.isLocked) {
      return
    }

    updateMouseButtonStates(event)

    if (!(mousePressed[LeftMouseButton].oldValue && !mousePressed[LeftMouseButton].currentValue)) {
      return
    }

    if (polygonBeingLookedAt === undefined) {
      return
    }

    selectionDragVertices = undefined

    if (selectionDragMode === undefined) {
      // a plain click: no drag happened, the modifiers decide what it means
      const mode = getSelectionModeFromEvent(event)

      if (mode === 'remove') {
        selectedPolygons.delete(polygonBeingLookedAt)
      } else {
        if (mode === 'replace') {
          selectedPolygons.clear()
        }

        selectedPolygons.add(polygonBeingLookedAt)
      }

      cursorTriangleMaterial.color.set(mode === 'remove' ? Color.red.getHex() : Color.green.getHex())

      updateHighlightOfSelectedPolygons()
    } else {
      selectionDragMode = undefined

      cursorTriangleMaterial.color.set(getSelectionMode() === 'remove' ? Color.red.getHex() : Color.green.getHex())
    }
  },
  false,
)

canvas.addEventListener('click', () => {
  controls.lock()
})

document.addEventListener('dblclick', (event) => {
  if (!controls.isLocked || polygonBeingLookedAt === undefined) {
    return
  }

  selectSameTextureArea(polygonBeingLookedAt, getSelectionModeFromEvent(event))
})

window.addEventListener('blur', () => {
  controls.unlock()

  updateMouseButtonState(LeftMouseButton, false)
  updateMouseButtonState(RightMouseButton, false)
  updateMouseButtonState(MiddleMouseButton, false)
})

// --------------

scene.add(cursorTriangleMesh)

cursorTriangleMesh.renderOrder = 10

/**
 * The intersections of the camera ray with the meshes, nearest first.
 *
 * `side` `undefined` means "follow the viewport": the side of the group's material, exactly what the
 * renderer culls with, so the picker never selects a polygon that is not drawn.
 */
/** the side the renderer culls the mesh with (the editor uses a single material per group) */
function getMaterialSide(mesh: Mesh): Side {
  const material = mesh.material

  if (Array.isArray(material)) {
    const [firstMaterial] = material

    return firstMaterial.side
  }

  return material.side
}

function collectRayHits(ray: Ray, side: Side | undefined): Array<{ polygonIndex: number; distance: number }> {
  const hits: Array<{ polygonIndex: number; distance: number }> = []

  for (const group of meshGroups) {
    const boundsTree = getBoundsTreeOf(group.mesh)

    if (boundsTree === undefined) {
      continue
    }

    const triangleToPolygon = triangleToPolygonByMesh.get(group.mesh)

    if (triangleToPolygon === undefined) {
      continue
    }

    const materialSide = side ?? getMaterialSide(group.mesh)

    for (const intersection of boundsTree.raycast(ray, materialSide, 0, SELECTION_RAY_FAR)) {
      // `intersection.faceIndex` is an internal index of the BVH (it reorders the triangles), the
      // vertex index of the hit triangle is in `face.a` - the same value the raycaster used to give.
      const face = intersection.face

      if (face === undefined || face === null) {
        continue
      }

      const polygonIndex = triangleToPolygon[face.a / 3]

      if (polygonIndex !== undefined) {
        hits.push({ polygonIndex, distance: intersection.distance })
      }
    }
  }

  hits.sort((a, b) => {
    return a.distance - b.distance
  })

  return hits
}

/**
 * The polygons under the camera ray, nearest first.
 *
 * The picker follows the viewport when it can: the first pass uses the side of each material, the
 * same culling the renderer uses, so a polygon that is not drawn is never picked instead of a drawn
 * one. Only when **nothing** is drawn under the cursor the second pass allows the back faces: Arx
 * levels are single sided, so from the "wrong" side of a wall (or out of bounds) the visible
 * geometry is the back of the polygons, and without the fallback those surfaces could not be
 * selected at all.
 *
 * All hits are returned instead of only the nearest one: while dragging, the nearest hit can be a
 * polygon that is not connected to the selection, while the next one is. The caller picks.
 */
function getPolygonsUnderCameraRay(): Array<{ polygonIndex: number; distance: number }> {
  const direction = new Vector3()
  controls.getDirection(direction)

  const ray = new Ray(camera.position, direction)
  const visibleHits = collectRayHits(ray, undefined)

  if (visibleHits.length > 0) {
    return visibleHits
  }

  return collectRayHits(ray, DoubleSide)
}

function updatePolygonUnderCursor(): void {
  const hits = getPolygonsUnderCameraRay()

  if (hits.length === 0) {
    scene.remove(cursorTriangleMesh)
    polygonBeingLookedAt = undefined
    return
  }

  // while adding to the selection prefer the nearest polygon that is connected to the ones selected
  // in this drag, so a polygon that was skipped (not connected) does not hide the connectable one
  const [nearestHit] = hits
  let polygonIndex = nearestHit.polygonIndex

  if (selectionDragMode !== undefined && selectionDragMode !== 'remove' && polygonIndex !== undefined) {
    // only the nearest hits are worth checking (the ray can cross the whole level)
    const connectedHit = hits.slice(0, SELECTION_CANDIDATE_LIMIT).find((hit) => {
      const candidate = fts.polygons[hit.polygonIndex]

      if (candidate === undefined || selectedPolygons.has(hit.polygonIndex)) {
        return false
      }

      return isConnectedToSelection(getUsedVerticesOf(candidate))
    })

    if (connectedHit !== undefined) {
      polygonIndex = connectedHit.polygonIndex
    }
  }

  const polygon = polygonIndex === undefined ? undefined : fts.polygons[polygonIndex]

  cursorTriangleMesh.geometry.dispose()

  if (polygon === undefined) {
    // should not happen (the map covers every triangle)
    scene.remove(cursorTriangleMesh)
    polygonBeingLookedAt = undefined
    return
  }

  cursorTriangleMesh.geometry = createPolygonOutlineGeometry(polygon)

  scene.add(cursorTriangleMesh)

  polygonBeingLookedAt = polygonIndex

  const alreadySelected = polygonIndex !== undefined && selectedPolygons.has(polygonIndex)
  const mode = selectionDragMode ?? getSelectionMode()

  // red only in the "remove" mode: it is the only case where a click takes something away
  cursorTriangleMaterial.color.set(mode === 'remove' ? Color.red.getHex() : Color.green.getHex())

  if (mousePressed[LeftMouseButton].currentValue) {
    if (!mousePressed[LeftMouseButton].oldValue) {
      // left mouse button was pressed
      selectionDragMode = pendingSelectionMode ?? getSelectionMode()
      pendingSelectionMode = undefined

      if (selectionDragMode === 'replace') {
        // a new selection starts here: the previous one is dropped
        selectedPolygons.clear()
        updateHighlightOfSelectedPolygons()
      }

      selectionDragVertices = selectionDragMode === 'remove' ? undefined : new Map()

      if (selectionDragMode !== 'remove' && polygon !== undefined) {
        addVerticesToSelectionGrid(getUsedVerticesOf(polygon))
      }
    }

    if (selectionDragMode === 'replace' || selectionDragMode === 'add') {
      cursorTriangleMaterial.color.set(Color.green.getHex())
      if (polygon !== undefined && polygonIndex !== undefined && !alreadySelected) {
        const vertices = getUsedVerticesOf(polygon)

        if (isConnectedToSelection(vertices)) {
          selectedPolygons.add(polygonIndex)
          addVerticesToSelectionGrid(vertices)

          updateHighlightOfSelectedPolygons()
        } else {
          // no islands: this polygon is not connected to anything selected in this drag
          cursorTriangleMaterial.color.set(Color.yellow.getHex())
        }
      }
    } else {
      cursorTriangleMaterial.color.set(Color.red.getHex())
      if (selectionDragMode === 'remove' && polygonIndex !== undefined && alreadySelected) {
        selectedPolygons.delete(polygonIndex)
        updateHighlightOfSelectedPolygons()
      }
    }

    updateMouseButtonState(LeftMouseButton, true)
  } else {
    if (mousePressed[LeftMouseButton].oldValue) {
      // left mouse button was released
      selectionDragMode = undefined
      selectionDragVertices = undefined
    }

    updateMouseButtonState(LeftMouseButton, false)
  }
}

controls.addEventListener('change', updatePolygonUnderCursor)

// ------------------

// TODO: when saving FTS data use the three.js mesh instead of the loaded FTS data
// TODO: add seedrandom package to the project + migrate "random" functions from arx-level-generator

// TODO: make a GUI level selector (loading image + text)

// TODO: make geometry toggelable so that it would be possible to only have the wireframe rendered

// TODO: test in chrome

// TODO: create some sort of lookup for quads

// TODO: make selection semi-transparent
// TODO: override the drag mode to "remove" by holding down the right mouse button instead of ctrl

// TODO: add gizmo to the center of the selection
// TODO: allow moving the selected faces with gizmo
