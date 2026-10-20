import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { DLF, FTS, LLF } from 'arx-convert'
import { isQuad } from 'arx-convert/utils'
import { ArxLightFlags, type ArxColor, type ArxDLF, type ArxFTS, type ArxLLF, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  CanvasTexture,
  OrthographicCamera,
  Sprite,
  SpriteMaterial,
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
  cameraInfoVisible,
  cameraLightVisible,
  canvas,
  currentLevelId,
  downloadCompleted,
  downloadProgress,
  isComputingAnchors,
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
  setupCanvasResizer,
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
import {
  buildExportAnchors,
  buildExportFts,
  buildExportLlf,
  buildTriangleToPolygonMap,
  type AnchorGraph,
  type SourcePolygon,
} from './fts-export.js'
import { validateAnchors } from './generator/anchor-generator.js'
import type { AnchorWorkerResponse } from './generator/anchor-worker.js'
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

    // the anchors are recomputed from the surviving geometry (like the palette): the deleted
    // polygons took their anchors with them, and the links between the remaining ones change too
    // the anchors are recomputed from the surviving geometry (like the palette). The editor may
    // already show them (the Anchors overlay), then the cached graph is reused instead of running
    // the generator twice
    const exportFtsWithAnchors = buildExportAnchors(exportFts, {}, await ensureAnchorGraph())
    downloadProgress.value = 10
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

    const packedFts = await saveFTS(exportFtsWithAnchors, levelId)
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
scene.add(anchorsGroup)

/**
 * Rebuilds the anchors' overlay from a graph. `requestFrame` is false for the initial call: this
 * module runs before the render loop exists, and `requestRender()` would touch its state too early.
 */
function renderAnchorGraph(
  anchors: ReadonlyArray<{ position: { x: number; y: number; z: number }; linkedAnchors: number[] }>,
  requestFrame = true,
): void {
  for (const child of [...anchorsGroup.children]) {
    anchorsGroup.remove(child)
    const withGeometry = child as unknown as { geometry?: BufferGeometry }
    withGeometry.geometry?.dispose()
  }

  const anchorLinkPositions: number[] = []
  const anchorTickPositions: number[] = []

  anchors.forEach((anchor, index) => {
    const from = ftsPositionToThree(anchor.position)

    // the anchor of the format has a `height` (always -165 in the original levels, arx-convert does
    // not expose it because it is uniform) - the game's Pathfinding debug view draws the anchor as a
    // vertical line of this height, which is about the eye height of the player
    anchorTickPositions.push(from.x, from.y, from.z, from.x, from.y + 165, from.z)

    for (const linkedIndex of anchor.linkedAnchors) {
      if (linkedIndex <= index || linkedIndex >= anchors.length) {
        continue
      }

      const to = ftsPositionToThree(anchors[linkedIndex].position)
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
  anchorsGroup.visible = anchorsVisible.value

  if (requestFrame) {
    requestRender()
  }
}

// until the generator runs, the anchors of the opened file are shown (they are stale, but they are
// something to start from)
renderAnchorGraph(
  fts.anchors.map((anchor) => {
    return { position: anchor.data.position, linkedAnchors: anchor.linkedAnchors }
  }),
  false,
)

/**
 * The generated anchor graph of the **surviving** polygons and the `geometryVersion` it belongs to.
 * Every polygon change bumps the version, so `ensureAnchorGraph()` knows when the cached graph is
 * stale.
 */
let anchorGraph: AnchorGraph | undefined
let anchorGraphVersion = -1
let geometryVersion = 0
let anchorGeneration: Promise<AnchorGraph> | undefined

/** the debounce of the regeneration after a polygon change (ms) */
const ANCHOR_REGENERATION_DELAY = 700

let anchorRegenerationTimer: ReturnType<typeof setTimeout> | undefined

const anchorWorker = new Worker(new URL('./generator/anchor-worker.ts', import.meta.url), { type: 'module' })

/** the polygons the export would write: everything except the deleted ones */
function survivingPolygons(): ArxPolygon[] {
  return fts.polygons.filter((_polygon, sourceIndex) => {
    return !deletedPolygons.has(sourceIndex)
  })
}

/**
 * Generates the anchor graph of the current geometry in a **worker** (it takes seconds on a real
 * level, so it cannot block the editor) and caches it for the current `geometryVersion`. Concurrent
 * calls share the same promise.
 */
async function generateAnchorGraph(): Promise<AnchorGraph> {
  if (anchorGeneration !== undefined) {
    return anchorGeneration
  }

  const version = geometryVersion

  anchorGeneration = (async () => {
    const polygons = survivingPolygons()
    const positions = new Float32Array(polygons.length * 12)
    const normals = new Float32Array(polygons.length * 3)
    const flags = new Uint32Array(polygons.length)
    const areas = new Float32Array(polygons.length)

    polygons.forEach((polygon, index) => {
      const usedVertices = isQuad(polygon) ? 4 : 3
      const vertexOffset = index * 12

      for (let vertex = 0; vertex < 4; vertex++) {
        // a triangle repeats its last vertex in the 4th slot, the generator ignores it
        const source = polygon.vertices[Math.min(vertex, usedVertices - 1)]
        positions[vertexOffset + vertex * 3] = source.x
        positions[vertexOffset + vertex * 3 + 1] = source.y
        positions[vertexOffset + vertex * 3 + 2] = source.z
      }

      normals[index * 3] = polygon.norm.x
      normals[index * 3 + 1] = polygon.norm.y
      normals[index * 3 + 2] = polygon.norm.z
      flags[index] = polygon.flags
      areas[index] = polygon.area
    })

    const line = logger.log('generating anchors...')
    isComputingAnchors.value = true

    try {
      const response = await new Promise<AnchorWorkerResponse>((resolve, reject) => {
        anchorWorker.onmessage = (event: MessageEvent<AnchorWorkerResponse>) => {
          resolve(event.data)
        }

        anchorWorker.onerror = (event) => {
          reject(new Error(event.message))
        }

        anchorWorker.postMessage({ positions, normals, flags, areas, options: {} })
      })

      if (!response.ok) {
        throw new Error(response.message)
      }

      const graph: AnchorGraph = { anchors: response.anchors, cellAnchors: new Map(response.cellAnchors) }
      const problems = validateAnchors(graph)

      if (problems.length > 0) {
        throw new Error(`the generated anchor graph is invalid: ${problems.slice(0, 3).join(', ')}`)
      }

      anchorGraph = graph
      anchorGraphVersion = version

      const links = graph.anchors.reduce((sum, anchor) => sum + anchor.linkedAnchors.length, 0) / 2
      logger.log(`done (${graph.anchors.length} anchors, ${links} links)`, line)

      if (anchorsVisible.value) {
        renderAnchorGraph(graph.anchors)
      }

      return graph
    } finally {
      isComputingAnchors.value = false
      anchorGeneration = undefined
      requestRender()
    }
  })()

  return anchorGeneration
}

/**
 * The anchor graph of the current geometry: the cached one when it is fresh, a new one otherwise.
 * The export uses this too, so a graph that is already shown in the editor is not generated twice.
 */
async function ensureAnchorGraph(): Promise<AnchorGraph> {
  if (anchorGraph !== undefined && anchorGraphVersion === geometryVersion) {
    return anchorGraph
  }

  return generateAnchorGraph()
}

/** bumps the geometry version and regenerates the graph when the overlay is on (debounced) */
function onGeometryChanged(): void {
  geometryVersion++

  if (!anchorsVisible.value) {
    return
  }

  clearTimeout(anchorRegenerationTimer)
  anchorRegenerationTimer = setTimeout(() => {
    void ensureAnchorGraph()
  }, ANCHOR_REGENERATION_DELAY)
}

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

  // the overlay shows the **generated** graph, so the first time it is switched on the worker has
  // to run (and the export can reuse the result)
  if (value) {
    void ensureAnchorGraph()
  }
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

// `preserveDrawingBuffer` keeps the last frame readable: without it the browser clears the drawing
// buffer after compositing, so the browser's own "Save image as" (a right click on the canvas, which
// reads the canvas instead of re-rendering) saved a blank white png - the first complaint came from
// firefox. The frame is still only drawn on demand, so the cost of keeping the buffer is paid per
// rendered frame, not per second.
const renderer = new WebGLRenderer({ antialias: true, canvas, preserveDrawingBuffer: true })
renderer.setClearColor(Color.white.darken(90).getHex())
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

renderer.autoClear = false

/**
 * The position/rotation overlay is **drawn into the canvas** (a sprite with a 2d canvas texture in an
 * own orthographic scene), not a DOM element: the browser's "Save image as" reads the canvas only,
 * so a DOM overlay was missing from the saved picture. The text is rendered by a 2d context, which
 * gives the same look as the old `#camera-info` div.
 */
const hudCanvas = document.createElement('canvas')
const hudContext = hudCanvas.getContext('2d') as CanvasRenderingContext2D
const hudTexture = new CanvasTexture(hudCanvas)
const hudSprite = new Sprite(
  new SpriteMaterial({ map: hudTexture, depthTest: false, depthWrite: false, transparent: true }),
)
const hudScene = new Scene()
hudScene.add(hudSprite)
/** pixel space, y up (the renderer's drawing buffer is in css pixels here) */
const hudCamera = new OrthographicCamera(0, 1, 1, 0, -10, 10)

const HUD_PADDING = 4
const HUD_MARGIN = 8
const HUD_LINE_HEIGHT = 17
const HUD_FONT = '12px monospace'
const HUD_BACKGROUND = 'rgba(0, 0, 0, 0.55)'

/** the last text of the overlay, so the texture is only redrawn when something changed */
let hudText = ''

function updateHudLayout(): void {
  const width = hudCanvas.width
  const height = hudCanvas.height
  const bufferWidth = renderer.domElement.width
  const bufferHeight = renderer.domElement.height

  hudCamera.left = 0
  hudCamera.right = bufferWidth
  hudCamera.top = bufferHeight
  hudCamera.bottom = 0
  hudCamera.updateProjectionMatrix()

  hudSprite.scale.set(width, height, 1)
  hudSprite.position.set(HUD_MARGIN + width / 2, bufferHeight - HUD_MARGIN - height / 2, 0)
}

/** draws the two lines of the overlay into the hud canvas (the sprite shows it) */
function drawHud(lines: string[]): void {
  hudContext.font = HUD_FONT

  const textWidth = Math.max(...lines.map((line) => hudContext.measureText(line).width))
  hudCanvas.width = Math.ceil(textWidth + HUD_PADDING * 2)
  hudCanvas.height = lines.length * HUD_LINE_HEIGHT + HUD_PADDING * 2

  // the context resets when the canvas is resized
  hudContext.font = HUD_FONT
  hudContext.textBaseline = 'middle'

  hudContext.fillStyle = HUD_BACKGROUND
  hudContext.beginPath()
  hudContext.roundRect(0, 0, hudCanvas.width, hudCanvas.height, 3)
  hudContext.fill()

  hudContext.fillStyle = 'white'

  lines.forEach((line, index) => {
    hudContext.fillText(line, HUD_PADDING, HUD_PADDING + HUD_LINE_HEIGHT * (index + 0.5))
  })

  hudTexture.needsUpdate = true
  updateHudLayout()
}

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
  const text = [
    `position ${position.x.toFixed(2)} ${position.y.toFixed(2)} ${position.z.toFixed(2)}`,
    `rotation ${pitch.toFixed(2)} ${yaw.toFixed(2)} 0.00`,
  ].join('\n')

  if (text === hudText) {
    return
  }

  hudText = text
  drawHud(text.split('\n'))
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

watch(cameraInfoVisible, (value) => {
  // the sprite keeps its last texture, so it has to be hidden separately
  hudSprite.visible = value
  requestRender()

  if (value) {
    hudText = ''
    updateCameraInfo()
  }
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

// the visibility toggles and the lighting settings change the scene from the ui, not from an input
// event on this element, so they request a frame too
watch(
  [wireframeVisible, meshVisible, anchorsVisible, portalsVisible, lightsVisible, cameraLightVisible, lightingCalculatorMode, ambientFloor, shadows],
  requestRender,
)

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

/**
 * The surface line test: beside the shared vertices, two polygons are also connected when
 * a straight line between them can be drawn **on the surface**. The line is sampled at this interval
 * (game units) and every sample has to find a polygon around it - a hole or the edge of the mesh
 * breaks the line, so the drag stops there instead of jumping over the gap.
 */
const SURFACE_LINE_TEST_STEP = 10

/**
 * How far the surface line test looks above and below a sample point, along the surface normal. The
 * two surfaces are not exactly coplanar (the whole point of the test: their seams are apart), so the
 * sample can be a few units off the polygons - but a missing floor is much further than this.
 */
const SURFACE_LINE_TEST_TOLERANCE = 8

/** the selection is polygon based: a quad is one unit, both of its triangles are highlighted */
/**
 * Draws the selection as **one** mesh: a flood fill can select a few thousand polygons (the biggest
 * connected same texture area of the original levels is ~1800), and one draw call per polygon would
 * make that unusable. The geometries of the polygons are concatenated into a single position buffer.
 */
function updateHighlightOfSelectedPolygons(): void {
  requestRender()

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

  onGeometryChanged()

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
  requestRender()
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

/**
 * Adds one polygon to the selection of the current drag and puts its vertices into the grid, so the
 * next move can connect to it. Returns false when it was already selected (or does not exist).
 */
function addPolygonToSelection(polygonIndex: number): boolean {
  if (selectedPolygons.has(polygonIndex)) {
    return false
  }

  const polygon = fts.polygons[polygonIndex]

  if (polygon === undefined) {
    return false
  }

  selectedPolygons.add(polygonIndex)
  addVerticesToSelectionGrid(getUsedVerticesOf(polygon))

  return true
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

/** a point on the mesh surface and the plane normal of the polygon it belongs to */
type SurfacePoint = { point: Vector3; normal: Vector3 }

/**
 * The last point of the surface that the current drag accepted: it starts at the polygon under the
 * cursor on the press, then follows the polygon under the cursor on every move. The surface line
 * test measures from here, so the drag only has to bridge one gap at a time - exactly like the
 * shared vertex rule, which also connects to what the drag has selected so far, not to its start.
 */
let lastSelectionSurfacePoint: SurfacePoint | undefined

/** the plane normal of an arx polygon in three.js coordinates */
function getPolygonNormal(polygon: ArxPolygon): Vector3 {
  const normal = arxVector3toVector3(polygon.norm)

  if (normal.lengthSq() > 1e-8) {
    return normal.normalize()
  }

  // the original data contains zero normals: derive the plane from the triangle itself
  const [a, b, c] = polygon.vertices.slice(0, 3).map((vertex) => arxVector3toVector3(vertex))
  const derived = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))

  return derived.lengthSq() > 1e-8 ? derived.normalize() : new Vector3(0, 1, 0)
}

/**
 * The polygons that a straight line between two surface points crosses - or `undefined` when the
 * line is broken, i.e. a sample finds no polygon around itself (a hole or the edge of the mesh).
 *
 * The line is a straight 3D line, not a walk on the surface: two separate but coplanar (or nearly
 * coplanar) surfaces have a straight line between them even when their vertices are not shared,
 * which is exactly the case the shared vertex rule rejects. Every sample looks along the
 * surface normal of the start point, so it finds the polygon whether the line is a little above or
 * below it - and it fails on a hole, because there the line has nothing within the tolerance.
 *
 * A minimum of two steps keeps one sample in the middle even for a very short line, so a small hole
 * cannot be skipped by sampling.
 */
function getPolygonsAlongSurfaceLine(from: SurfacePoint, to: Vector3): number[] | undefined {
  const distance = from.point.distanceTo(to)

  if (distance === 0) {
    return []
  }

  // at least two steps keeps one sample in the middle even for a very short line, so a small hole
  // cannot be skipped by the sampling
  const steps = Math.max(2, Math.ceil(distance / SURFACE_LINE_TEST_STEP))
  const sample = new Vector3()
  const ray = new Ray()
  const polygonIndices = new Set<number>()

  for (let step = 1; step < steps; step++) {
    sample.lerpVectors(from.point, to, step / steps)

    // start the ray above the sample and look back through it: this catches the surface both when
    // the sample is a little above and when it is a little below it
    ray.origin.copy(sample).addScaledVector(from.normal, SURFACE_LINE_TEST_TOLERANCE)
    ray.direction.copy(from.normal).negate()

    const [hit] = collectRayHits(ray, DoubleSide, SURFACE_LINE_TEST_TOLERANCE * 2)

    if (hit === undefined) {
      return undefined
    }

    polygonIndices.add(hit.polygonIndex)
  }

  return [...polygonIndices]
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

/**
 * True when the drag started on empty space (no polygon under the cursor at the press): the gesture
 * must not select anything then, even if it flies over selectable polygons later on. Set on
 * mousedown, cleared on mouseup.
 */
let dragStartedWithoutPolygon = false

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
    updateHudLayout()
  }

  const delta = timer.getDelta()

  controls.update(delta)

  updateCameraUrl()

  renderer.clear()
  renderer.render(scene, camera)
  renderer.render(hudScene, hudCamera)
  viewHelper.render(renderer)
}

/**
 * three.js does **not** decide when to draw: whatever the loop asks for is rendered. Until now
 * `setAnimationLoop(animate)` rendered the whole scene ~60 times a second even when nothing moved,
 * which is a lot of GPU time on a 150 000 polygon level (and a warm laptop). The loop now stops
 * after `RENDER_IDLE_TIMEOUT` ms without a request - the tail covers the throttled work (the camera
 * url/info update, the dynamically loaded palettes, the light pool) - and every input or state
 * change starts it again through `requestRender()`.
 */
const RENDER_IDLE_TIMEOUT = 800
let lastRenderRequestAt = performance.now()
let animationLoopRunning = false

/** asks for a frame (the next few frames, see `RENDER_IDLE_TIMEOUT`) - safe to call often */
function requestRender(): void {
  lastRenderRequestAt = performance.now()

  if (!animationLoopRunning) {
    animationLoopRunning = true
    renderer.setAnimationLoop(animate)
  }
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

  if (!controls.isLocked && performance.now() - lastRenderRequestAt > RENDER_IDLE_TIMEOUT) {
    animationLoopRunning = false
    renderer.setAnimationLoop(null)
  }
}

requestRender()
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

setupCanvasResizer(requestRender)

document.addEventListener('keydown', onKeyDown, false)
document.addEventListener('keyup', onKeyUp, false)

// every user input may change the picture (the movement, the cursor, the selection, a hotkey), so
// they all keep the render loop alive
for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'wheel']) {
  document.addEventListener(type, requestRender, { capture: true, passive: true })
}

globalThis.addEventListener('resize', requestRender)

document.addEventListener(
  'mousedown',
  (event) => {
    if (!controls.isLocked) {
      return
    }

    updateMouseButtonStates(event)

    pendingSelectionMode = getSelectionModeFromEvent(event)
    dragStartedWithoutPolygon = polygonBeingLookedAt === undefined

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

    dragStartedWithoutPolygon = false

    updateMouseButtonStates(event)

    if (!(mousePressed[LeftMouseButton].oldValue && !mousePressed[LeftMouseButton].currentValue)) {
      return
    }

    // the gesture is over, even if it ended on empty space: the next press starts a new surface line
    selectionDragVertices = undefined
    lastSelectionSurfacePoint = undefined

    if (polygonBeingLookedAt === undefined) {
      return
    }

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

function collectRayHits(
  ray: Ray,
  side?: Side,
  far = SELECTION_RAY_FAR,
): Array<{ polygonIndex: number; distance: number; point: Vector3 }> {
  const hits: Array<{ polygonIndex: number; distance: number; point: Vector3 }> = []

  for (const group of meshGroups) {
    const boundsTree = getBoundsTreeOf(group.mesh)

    if (boundsTree === undefined) {
      continue
    }

    const triangleToPolygon = triangleToPolygonByMesh.get(group.mesh)

    if (triangleToPolygon === undefined) {
      continue
    }

    for (const intersection of boundsTree.raycast(ray, side ?? getMaterialSide(group.mesh), 0, far)) {
      // `intersection.faceIndex` is an internal index of the BVH (it reorders the triangles), the
      // vertex index of the hit triangle is in `face.a` - the same value the raycaster used to give.
      const face = intersection.face

      if (face === undefined || face === null) {
        continue
      }

      const polygonIndex = triangleToPolygon[face.a / 3]

      if (polygonIndex !== undefined) {
        // the point on the surface: the surface line test compares the hit points of the drag
        hits.push({
          polygonIndex,
          distance: intersection.distance,
          point: ray.at(intersection.distance, new Vector3()),
        })
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
/** true while any mouse button is held (a drag selection or a camera move is running) */
function isMouseButtonPressed(): boolean {
  return mousePressed[LeftMouseButton].currentValue || mousePressed[RightMouseButton].currentValue || mousePressed[MiddleMouseButton].currentValue
}

function getPolygonsUnderCameraRay(): Array<{ polygonIndex: number; distance: number; point: Vector3 }> {
  const direction = new Vector3()
  controls.getDirection(direction)

  const ray = new Ray(camera.position, direction)

  // while a mouse button is held (a drag selection is running) the ray hits **both sides**: a stroke
  // of the mesh can face away from the camera while being in the middle of the drag path (a Z shape
  // or a fold), and the drag has to reach it - `DoubleSide` also contains the front facing hits, so
  // one pass is enough
  if (isMouseButtonPressed()) {
    return collectRayHits(ray, DoubleSide)
  }

  // hovering: only the polygons that face the camera, using the material side of every group - the
  // same side the renderer culls with, so what you see is what you pick. The old `DoubleSide`
  // fallback picked geometry that is not on the screen (after deleting a floor, hovering over the
  // hole selected the ceiling above it).
  return collectRayHits(ray)
}

function updatePolygonUnderCursor(): void {
  requestRender()

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

        // the surface line test starts here: the point of the polygon under the cursor and its plane
        const startHit = hits.find((hit) => hit.polygonIndex === polygonIndex) ?? nearestHit
        lastSelectionSurfacePoint = { point: startHit.point.clone(), normal: getPolygonNormal(polygon) }
      } else {
        lastSelectionSurfacePoint = undefined
      }
    }

    if (selectionDragMode === 'replace' || selectionDragMode === 'add') {
      cursorTriangleMaterial.color.set(Color.green.getHex())

      // every polygon under the cursor that is connected to what the drag has selected so far gets
      // added, not only the nearest one: a part of the mesh can be hidden behind another part in
      // screen space (a Z shape seen from below), and the drag should still pick it up. A drag that
      // started on empty space selects nothing at all.
      const candidates = dragStartedWithoutPolygon ? [] : hits.slice(0, SELECTION_CANDIDATE_LIMIT)

      let addedSomething = false

      for (const candidateHit of candidates) {
        const candidate = fts.polygons[candidateHit.polygonIndex]

        if (candidate === undefined || selectedPolygons.has(candidateHit.polygonIndex)) {
          continue
        }

        if (isConnectedToSelection(getUsedVerticesOf(candidate))) {
          addPolygonToSelection(candidateHit.polygonIndex)
          addedSomething = true
        }
      }

      // Shared vertices are only one kind of connection. Two separate surfaces that line up
      // (an unwelded seam, two slabs of a ceiling) do not share a vertex, but a straight line can be
      // drawn between them **on the surface** - as long as it does not cross a hole or the edge of
      // the mesh. That line also covers every polygon it crosses, which is what makes the drag
      // follow the surface instead of jumping over a gap.
      //
      // It runs even when a farther polygon was accepted by the shared vertex rule: the polygon
      // **under the cursor** is the one the drag has to reach, and a farther one must not mask it.
      if (
        !dragStartedWithoutPolygon &&
        lastSelectionSurfacePoint !== undefined &&
        !selectedPolygons.has(nearestHit.polygonIndex)
      ) {
        const polygonsAlongTheLine = getPolygonsAlongSurfaceLine(lastSelectionSurfacePoint, nearestHit.point)

        if (polygonsAlongTheLine !== undefined) {
          for (const polygonIndexAlongTheLine of polygonsAlongTheLine) {
            addPolygonToSelection(polygonIndexAlongTheLine)
          }

          addPolygonToSelection(nearestHit.polygonIndex)
          addedSomething = true
        }
      }

      if (addedSomething) {
        updateHighlightOfSelectedPolygons()
      } else if (polygonIndex !== undefined && !alreadySelected) {
        // no islands: this polygon is not connected to anything selected in this drag
        cursorTriangleMaterial.color.set(Color.yellow.getHex())
      }

      // the drag follows the cursor on the surface: the next surface line is measured from here. Only
      // an accepted (or already selected) polygon counts - over a hole the nearest hit can be a floor
      // of another room, and measuring from there would cut through the level.
      const nearestPolygon = fts.polygons[nearestHit.polygonIndex]

      if (nearestPolygon !== undefined && selectedPolygons.has(nearestHit.polygonIndex)) {
        lastSelectionSurfacePoint = { point: nearestHit.point.clone(), normal: getPolygonNormal(nearestPolygon) }
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
      lastSelectionSurfacePoint = undefined
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
