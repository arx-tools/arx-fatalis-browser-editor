import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxDLF, ArxFTS, ArxLLF } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  type Face,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  type Side,
  Timer,
  Triangle,
  Vector3,
  WebGLRenderer,
} from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { acceleratedRaycast } from 'three-mesh-bvh'
import { createApp, watch } from 'vue'
import './style.scss'
import { downloadBinaryAs, zipBuffers } from './download.js'
import {
  cameraLightVisible,
  canvas,
  isLoading,
  LeftMouseButton,
  MiddleMouseButton,
  mouseLocked,
  mousePressed,
  mouseUnlocked,
  RightMouseButton,
  uiTitle,
  updateMouseButtonState,
  updateMouseButtonStates,
  wireframeVisible,
} from './ui/ui.js'
import { areFacesEqual, isDoubleSided, isNoDraw, isTransparent, wait } from './functions.js'
import { Color } from './Color.js'
import { isValidOriginalArxLevelId } from './constants.js'
import { Logger } from './ui/Logger.js'
import { Exception } from './ui/Exception.js'
import { arxPolygonsToMesh, arxVector3toVector3 } from './arx-threejs-format-converters.js'
import { removeFaces } from './geometry/removeFaces.js'
import { createWireframe } from './geometry/createWireframe.js'
import { createTriangle as renderTriangle } from './geometry/renderTriangle.js'
import { getVerticesByFace } from './geometry/getVerticesByFace.js'
import { getNormalsByFace } from './geometry/getNormalByFace.js'
import App from './App.vue'

Mesh.prototype.raycast = acceleratedRaycast

const logger = new Logger(document.querySelector('#logs') as HTMLDivElement)

createApp(App).mount('#app')

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

const levelId = Number.parseInt(new URLSearchParams(globalThis.location.search).get('level') ?? '11', 10)
if (!isValidOriginalArxLevelId(levelId)) {
  isLoading.value = 'rejected'

  uiTitle.value = `Invalid level ID "${levelId}"`

  if (levelId === 9) {
    throw new Exception(`Invalid level ID "9", Arx Fatalis doesn't have a level 9.`, logger)
  } else {
    throw new Exception(`Invalid level ID "${levelId}"`, logger)
  }
}

uiTitle.value = `Arx Fatalis Level ${levelId} (loading)`

const line1 = logger.log('loading level data...')
const [fts, llf, dlf] = await Promise.all([getFTS(levelId), getLLF(levelId), getDLF(levelId)])
logger.log('done', line1)

uiTitle.value = `Arx Fatalis Level ${levelId}`

isLoading.value = 'fulfilled'

export async function handleDownloadButtonClick(): Promise<void> {
  if (isLoading.value === 'loading' || isLoading.value === 'rejected') {
    return
  }

  isLoading.value = 'loading'

  // TODO: generate fts, llf and dlf from scene

  const line1 = logger.log('packing level data...')

  const [packedFts, packedLlf, packedDlf] = await Promise.all([
    saveFTS(fts, levelId),
    saveLLF(llf, levelId),
    saveDLF(dlf, levelId),
  ])

  logger.log('done', line1)

  const line2 = logger.log('zipping files...')

  const zip = await zipBuffers({
    [`/game/graph/levels/level${levelId}/fast.fts`]: packedFts,
    [`/graph/levels/level${levelId}/level${levelId}.llf`]: packedLlf,
    [`/graph/levels/level${levelId}/level${levelId}.dlf`]: packedDlf,
  })

  logger.log('done', line2)

  downloadBinaryAs('mod.zip', zip, 'application/zip')

  isLoading.value = 'fulfilled'
}

// --------------------

const scene = new Scene()
const timer = new Timer()

timer.connect(document)

const raycaster = new Raycaster()

// --------------------

const offset = arxVector3toVector3(fts.header.mScenePosition)

/**
 * How the level is lit on screen. This is **not** the same question as how the lighting is
 * *generated* - see below.
 *
 * The LLF is the **pre-computed vertex lighting** of the level: `llf.colors` is the baked result of
 * `llf.lights`, indexed by `vertex.llfColorIdx`. That is what the game renders, and rendering it
 * needs an **unlit** material, because the light is already in the vertices.
 *
 * - `dynamic` (default): the baked LLF color is the **base color** of the mesh (that is what keeps
 *   the level visible at all) and the lights around the camera are added **on top of it** as point
 *   lights, using the Arx falloff (`fallStart`/`fallEnd`) - the closest thing to "the lights I can
 *   grab and move". It is an approximation: three.js **bakes every light into the shader** (4
 *   uniform vectors each) and a fragment shader may use at most `MAX_FRAGMENT_UNIFORM_VECTORS`
 *   (1024 on many windows/angle drivers), so only `maxDynamicLights` of them can be added - never
 *   all 553 of level 2. The baked color already contains the contribution of every static light,
 *   so the added point lights are a *preview* of where the lights are and how far they reach
 *   (they brighten that area, and close to a light the shaded color can clip to white).
 * - `baked`: the mesh carries `llf.colors` as a `color` attribute and the material is unlit. This is
 *   exactly what the game shows: every light of the level contributes, however far it is.
 * - `flat`: no lighting at all, everything at maximum brightness. This is the `MaxBrightness` mode
 *   of the generator, and it is what a brand new level starts with, before it has any baked
 *   lighting (with an empty LLF the default falls back to `flat`).
 *
 * Add `?lighting=baked` or `?lighting=flat` to the URL.
 *
 * The lighting **generation** modes of the generator - `MaxBrightness`, `CompleteDarkness`, `Arx`
 * and `Realistic` - are a separate axis: they decide what ends up *in* `llf.colors`.
 */
type LightingMode = 'dynamic' | 'baked' | 'flat'

function getLightingMode(): LightingMode {
  const requested = new URLSearchParams(globalThis.location.search).get('lighting')
  if (requested === 'baked') {
    return 'baked'
  }

  if (requested === 'flat') {
    return 'flat'
  }

  // a project without any light or without baked colors (a brand new level) would render black
  if (llf.lights.length === 0 || llf.colors.length === 0) {
    return 'flat'
  }

  return 'dynamic'
}

const lightingMode = getLightingMode()

/**
 * How many point lights the dynamic mode may add. The hard limit is
 * `(MAX_FRAGMENT_UNIFORM_VECTORS - 16) / 4`, which is 252 lights with the smallest limit seen in
 * the wild (1024) - but that already includes the camera light, and the shader cost grows with
 * every light, so stay well below it.
 */
const maxDynamicLights = 64

function getVertexColors(): ArxColor[] | undefined {
  // both `dynamic` and `baked` start from the pre-computed lighting; `flat` does not. An empty LLF
  // (a brand new level) has nothing to show, so it falls back to the type colors of `flat`.
  if (lightingMode === 'flat' || llf.colors.length === 0) {
    return undefined
  }

  return llf.colors
}

const vertexColors = getVertexColors()

/**
 * `MeshLambertMaterial` multiplies the albedo by the incoming light, so a vertex color would only
 * tint the lit areas and would stay black everywhere else. The baked LLF color is a *light*, not
 * an albedo, so it has to be added to the output instead: this patch adds `vColor` to
 * `totalEmissiveRadiance` and removes it from the diffuse color, so the dynamic point lights add
 * **on top of** the baked base instead of being multiplied by it.
 *
 * `vColor` is available because the material has `vertexColors: true`.
 */
function addBakedLightToEmissive(material: MeshLambertMaterial): void {
  material.onBeforeCompile = (shader) => {
    const colorChunk = '#include <color_fragment>'
    const emissiveDeclaration = 'vec3 totalEmissiveRadiance = emissive;'

    if (!shader.fragmentShader.includes(colorChunk) || !shader.fragmentShader.includes(emissiveDeclaration)) {
      // Three.js changed its Lambert shader: the baked base would silently disappear from the
      // dynamic mode. Keep the mode working (the point lights still render) but say it out loud.
      console.warn('[lighting] the Lambert fragment shader changed, the baked LLF base is not applied')
      return
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(colorChunk, '')
      .replace(emissiveDeclaration, 'vec3 totalEmissiveRadiance = emissive + vColor.rgb;')
  }
}

function createMaterial(options: {
  color: number
  side?: Side
  transparent?: boolean
  opacity?: number
}): MeshBasicMaterial | MeshLambertMaterial {
  if (lightingMode === 'dynamic') {
    // the baked LLF color is the base of the lighting, the point lights of the dynamic mode add to
    // it (see the comment above). The type colors (red for double sided, green for transparent) are
    // an aid of the `flat` mode: they would tint the baked colors of the game, so they are not used
    // here - same as in `baked`.
    const material = new MeshLambertMaterial({
      ...options,
      color: Color.white.getHex(),
      vertexColors: vertexColors !== undefined,
    })

    if (vertexColors !== undefined) {
      addBakedLightToEmissive(material)
    }

    return material
  }

  if (lightingMode === 'baked') {
    // the vertex color is the light, so the material color has to stay white
    return new MeshBasicMaterial({ ...options, color: Color.white.getHex(), vertexColors: vertexColors !== undefined })
  }

  return new MeshBasicMaterial(options)
}

const meshes: Mesh[] = []

const solidSingleSidedMaterial = createMaterial({ color: Color.white.getHex() })
const solidSingleSidedMesh = arxPolygonsToMesh(
  fts.polygons.filter(({ flags }) => {
    return !isTransparent(flags) && !isDoubleSided(flags) && !isNoDraw(flags)
  }),
  solidSingleSidedMaterial,
  offset,
  vertexColors,
)
meshes.push(solidSingleSidedMesh)

const solidDoubleSidedMaterial = createMaterial({
  color: Color.red.lighten(75).getHex(),
  side: DoubleSide,
})
const solidDoubleSidedMesh = arxPolygonsToMesh(
  fts.polygons.filter(({ flags }) => {
    return !isTransparent(flags) && isDoubleSided(flags) && !isNoDraw(flags)
  }),
  solidDoubleSidedMaterial,
  offset,
  vertexColors,
)
meshes.push(solidDoubleSidedMesh)

const transparentMaterial = createMaterial({
  color: Color.green.lighten(75).getHex(),
  transparent: true,
  opacity: 0.5,
  side: DoubleSide,
})
const transparentMesh = arxPolygonsToMesh(
  fts.polygons.filter(({ flags }) => {
    return isTransparent(flags) && !isNoDraw(flags)
  }),
  transparentMaterial,
  offset,
  vertexColors,
)
meshes.push(transparentMesh)

// TODO: add noDraw polygons

// --------------------

scene.add(...meshes)

let wireframeLines: LineSegments[] = meshes.map(({ geometry }) => {
  const wireframe = createWireframe(geometry)
  wireframe.renderOrder = 5
  return wireframe
})

watch(wireframeVisible, (value) => {
  if (value) {
    scene.add(...wireframeLines)
  } else {
    scene.remove(...wireframeLines)
  }
})

if (wireframeVisible.value === true) {
  scene.add(...wireframeLines)
}

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

if (lightingMode === 'dynamic') {
  for (let i = 0; i < maxDynamicLights; i++) {
    const pointLight = new PointLight(Color.white.getHex(), 0, 0, 0)
    scene.add(pointLight)
    dynamicLights.push(pointLight)
  }
}

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
 * `?angle=yaw,pitch`. The values are in the **game coordinate system** (the one `player.pos` uses):
 * the position is `dlf.position + mScenePosition`, the angle is the game yaw and pitch in degrees
 * (yaw 0..360, pitch -90..90, a positive pitch looks down).
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

function setCameraAngleFromGameAngle(yaw: number, pitch: number): void {
  camera.rotation.set(MathUtils.degToRad(-pitch), MathUtils.degToRad(yaw - 180), 0, 'YXZ')
}

function getGameAngleOfCamera(): { yaw: number; pitch: number } {
  cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ')

  return {
    yaw: (MathUtils.radToDeg(cameraEuler.y) + 180 + 360) % 360,
    pitch: -MathUtils.radToDeg(cameraEuler.x),
  }
}

/** parses `x,y,z` (or `yaw,pitch`); `undefined` when the value is missing or malformed */
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

  const angle = parseNumberTuple(params.get('angle'), 2)
  if (angle !== undefined) {
    const [yaw, pitch] = angle

    // a broken angle should not move the camera
    if (yaw >= 0 && yaw < 360 && pitch >= -90 && pitch <= 90) {
      setCameraAngleFromGameAngle(yaw, pitch)
    } else {
      console.warn(`[camera] ignoring the angle from the url: ${angle.join(',')}`)
    }
  }
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

  const params = new URLSearchParams(globalThis.location.search)
  params.set('positionAt', `${position.x.toFixed(1)},${position.y.toFixed(1)},${position.z.toFixed(1)}`)
  params.set('angle', `${yaw.toFixed(2)},${pitch.toFixed(2)}`)

  // the commas are legal in a query string and make the url readable
  const search = params.toString().replaceAll('%2C', ',')
  const url = `${globalThis.location.pathname}?${search}${globalThis.location.hash}`

  if (url === lastCameraUrl) {
    return
  }

  globalThis.history.replaceState(globalThis.history.state, '', url)
  lastCameraUrl = url
}

applyCameraStateFromUrl()
updateCameraUrl()

/** how often the dynamic light pool follows the camera (ms) */
const dynamicLightsUpdateInterval = 250
let lastDynamicLightsUpdateAt = Number.NEGATIVE_INFINITY

/**
 * Refills the fixed point light pool with the `maxDynamicLights` lights closest to the camera, in
 * the Arx falloff of the level (see `ARX_GLOBAL_LIGHT_FACTOR`). The baked vertex color is the base
 * of the dynamic mode, so these lights are a preview of where the lights are and how far they
 * reach - they are not an independent second lighting pass.
 */
function updateDynamicLights(): void {
  if (lightingMode !== 'dynamic') {
    return
  }

  const now = performance.now()
  if (now - lastDynamicLightsUpdateAt < dynamicLightsUpdateInterval) {
    return
  }

  lastDynamicLightsUpdateAt = now

  const cameraPosition = camera.position

  const nearestLights = llf.lights
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

type FaceOfMesh = { mesh: Mesh; face: Face }

const selectedFaces: FaceOfMesh[] = []
let faceBeingLookedAt: FaceOfMesh | undefined
const cursorTriangleMaterial = new MeshBasicMaterial({ color: Color.green.getHex() })
const cursorTriangleMesh = new LineSegments(renderTriangle(new Triangle()), cursorTriangleMaterial)

let highlightOfSelectedFaces: Mesh[] = []

function updateHighlightOfSelectedFaces(): void {
  if (highlightOfSelectedFaces.length > 0) {
    scene.remove(...highlightOfSelectedFaces)
  }

  highlightOfSelectedFaces = selectedFaces.map(({ face, mesh }) => {
    const vertices = getVerticesByFace(face, mesh.geometry)
    const normals = getNormalsByFace(face, mesh.geometry)

    const geometry = new BufferGeometry()

    geometry.setAttribute(
      'position',
      new BufferAttribute(
        // prettier-ignore
        new Float32Array([
          ...vertices[0].toArray(),
          ...vertices[1].toArray(),
          ...vertices[2].toArray()
        ]),
        3,
      ),
    )

    geometry.setAttribute(
      'normal',
      new BufferAttribute(
        // prettier-ignore
        new Float32Array([
          ...normals[0].toArray(),
          ...normals[1].toArray(),
          ...normals[2].toArray()
        ]),
        3,
      ),
    )

    const material = new MeshBasicMaterial({
      color: Color.yellow.getHex(),
      side: DoubleSide,
      transparent: true,
      opacity: 0.35,
    })

    const triangleMesh = new Mesh(geometry, material)
    triangleMesh.renderOrder = 7 // TODO, ez legyen 5 és 10 között

    return triangleMesh
  })

  if (highlightOfSelectedFaces.length > 0) {
    scene.add(...highlightOfSelectedFaces)
  }
}

/**
 * being relevant when new faces are to be added to or removed from the selectedFaces
 *
 * if the left mouse button is pressed with a face that is already in the selection,
 * that means the face will be removed and all subsequent faces will get removed from selectedFaces
 * otherwise all subsequent faces will be added
 *
 * until the first face is clicked the state is undefined
 */
let isAddingToSelection: boolean | undefined

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

    if (pressedKeys.Delete && selectedFaces.length > 0) {
      const facesByMeshes = new Map<Mesh, Face[]>()

      for (const { mesh, face } of selectedFaces) {
        if (!facesByMeshes.has(mesh)) {
          facesByMeshes.set(mesh, [])
        }

        const facesByMesh = facesByMeshes.get(mesh) as Face[]
        facesByMesh.push(face)
      }

      ;[...facesByMeshes.entries()].forEach(([mesh, faces]) => {
        mesh.geometry = removeFaces(faces, mesh.geometry)
      })

      if (wireframeVisible.value) {
        scene.remove(...wireframeLines)
      }

      wireframeLines = meshes.map(({ geometry }) => {
        return createWireframe(geometry)
      })

      if (wireframeVisible.value) {
        scene.add(...wireframeLines)
      }

      selectedFaces.length = 0
      updateHighlightOfSelectedFaces()
      faceBeingLookedAt = undefined

      cursorTriangleMaterial.color.set(Color.green.getHex())
      scene.remove(cursorTriangleMesh)
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
  if (event.code === 'KeyEsc') {
    controls.unlock()

    updateMouseButtonState(LeftMouseButton, false)
    updateMouseButtonState(RightMouseButton, false)
    updateMouseButtonState(MiddleMouseButton, false)

    return
  }

  pressedKeys[event.code] = true
}

function onKeyUp(event: KeyboardEvent): void {
  pressedKeys[event.code] = false
}

document.addEventListener('keydown', onKeyDown, false)
document.addEventListener('keyup', onKeyUp, false)

function areFaceOfMeshesEqual(a: FaceOfMesh, b: FaceOfMesh): boolean {
  return a.mesh === b.mesh && areFacesEqual(a.face, b.face)
}

document.addEventListener(
  'mousedown',
  (event) => {
    if (!controls.isLocked) {
      return
    }

    updateMouseButtonStates(event)

    const positionInSelection = selectedFaces.findIndex((faceOfMesh) => {
      return areFaceOfMeshesEqual(faceOfMesh, faceBeingLookedAt as FaceOfMesh)
    })

    const alreadySelected = positionInSelection !== -1

    if (alreadySelected) {
      cursorTriangleMaterial.color.set(Color.red.getHex())
    } else {
      cursorTriangleMaterial.color.set(Color.green.getHex())
    }
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

    if (faceBeingLookedAt === undefined) {
      return
    }

    const positionInSelection = selectedFaces.findIndex((faceOfMesh) => {
      return areFaceOfMeshesEqual(faceOfMesh, faceBeingLookedAt as FaceOfMesh)
    })

    const alreadySelected = positionInSelection !== -1

    if (isAddingToSelection === undefined) {
      if (alreadySelected) {
        cursorTriangleMaterial.color.set(Color.green.getHex())
        selectedFaces.splice(positionInSelection, 1)
      } else {
        selectedFaces.push(faceBeingLookedAt)
        cursorTriangleMaterial.color.set(Color.red.getHex())
      }

      updateHighlightOfSelectedFaces()
    } else {
      isAddingToSelection = undefined

      if (alreadySelected) {
        cursorTriangleMaterial.color.set(Color.red.getHex())
      } else {
        cursorTriangleMaterial.color.set(Color.green.getHex())
      }
    }
  },
  false,
)

canvas.addEventListener('click', () => {
  controls.lock()
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

controls.addEventListener('change', () => {
  const lookingAt = new Vector3()
  controls.getDirection(lookingAt)

  raycaster.set(camera.position, lookingAt)

  const intersects = raycaster.intersectObjects(meshes, false)
  const intersectedMeshes = intersects.filter(({ object }) => object instanceof Mesh)

  if (intersectedMeshes.length === 0) {
    scene.remove(cursorTriangleMesh)
    faceBeingLookedAt = undefined
    return
  }

  const mesh = intersectedMeshes[0].object as Mesh
  const face = intersectedMeshes[0].face as Face

  const [a, b, c] = getVerticesByFace(face, mesh.geometry)
  cursorTriangleMesh.geometry = renderTriangle(new Triangle(a, b, c))
  scene.add(cursorTriangleMesh)

  faceBeingLookedAt = { mesh, face }

  const positionInSelection = selectedFaces.findIndex((faceOfMesh) => {
    return areFaceOfMeshesEqual(faceOfMesh, faceBeingLookedAt as FaceOfMesh)
  })

  const alreadySelected = positionInSelection !== -1

  if (alreadySelected) {
    cursorTriangleMaterial.color.set(Color.red.getHex())
  } else {
    cursorTriangleMaterial.color.set(Color.green.getHex())
  }

  if (mousePressed[LeftMouseButton].currentValue) {
    if (!mousePressed[LeftMouseButton].oldValue) {
      // left mouse button was pressed
      isAddingToSelection = !alreadySelected
    }

    if (isAddingToSelection) {
      cursorTriangleMaterial.color.set(Color.green.getHex())
      if (!alreadySelected) {
        selectedFaces.push(faceBeingLookedAt)
        updateHighlightOfSelectedFaces()
      }
    } else {
      cursorTriangleMaterial.color.set(Color.red.getHex())
      if (alreadySelected) {
        selectedFaces.splice(positionInSelection, 1)
        updateHighlightOfSelectedFaces()
      }
    }

    updateMouseButtonState(LeftMouseButton, true)
  } else {
    if (mousePressed[LeftMouseButton].oldValue) {
      // left mouse button was released
      isAddingToSelection = undefined
    }

    updateMouseButtonState(LeftMouseButton, false)
  }
})

// ------------------

// TODO: when saving FTS data use the three.js mesh instead of the loaded FTS data
// TODO: add seedrandom package to the project + migrate "random" functions from arx-level-generator

// TODO: make a GUI level selector (loading image + text)

// TODO: make geometry toggelable so that it would be possible to only have the wireframe rendered

// TODO: test in chrome

// TODO: create some sort of lookup for quads

// TODO: make selection semi-transparent
// TODO: override isAddingToSelection to be false by holding down the right mouse button instead of left

// TODO: add gizmo to the center of the selection
// TODO: allow moving the selected faces with gizmo
