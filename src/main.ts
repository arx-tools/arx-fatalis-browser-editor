import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { DLF, FTS, LLF } from 'arx-convert'
import { isQuad } from 'arx-convert/utils'
import type { ArxColor, ArxDLF, ArxFTS, ArxLLF, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  BufferAttribute,
  BufferGeometry,
  Color as ThreeColor,
  DoubleSide,
  Euler,
  type Face,
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
  anchorsVisible,
  cameraInfo,
  cameraInfoVisible,
  cameraLightVisible,
  canvas,
  currentLevelId,
  isDirty,
  isLoading,
  lightsVisible,
  LeftMouseButton,
  MiddleMouseButton,
  mouseLocked,
  mousePressed,
  mouseUnlocked,
  portalsVisible,
  RightMouseButton,
  updateMouseButtonState,
  updateMouseButtonStates,
  wireframeVisible,
} from './ui/ui.js'
import { isDoubleSided, isNoDraw, isTransparent, wait } from './functions.js'
import { Color } from './Color.js'
import { isValidOriginalArxLevelId } from './constants.js'
import { Logger } from './ui/Logger.js'
import { Exception } from './ui/Exception.js'
import { arxPolygonsToMesh, arxVector3toVector3 } from './arx-threejs-format-converters.js'
import { buildExportFts, buildExportLlf, buildTriangleToPolygonMap, type SourcePolygon } from './fts-export.js'
import { createPolygonWireframe } from './geometry/createWireframe.js'
import { createTriangle as renderTriangle } from './geometry/renderTriangle.js'
import { getVerticesByFace } from './geometry/getVerticesByFace.js'
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

  if (levelId === 9) {
    throw new Exception(`Invalid level ID "9", Arx Fatalis doesn't have a level 9.`, logger)
  } else {
    throw new Exception(`Invalid level ID "${levelId}"`, logger)
  }
}

currentLevelId.value = levelId

const line1 = logger.log('loading level data...')
const [fts, llf, dlf] = await Promise.all([getFTS(levelId), getLLF(levelId), getDLF(levelId)])
logger.log('done', line1)

isLoading.value = 'fulfilled'

export async function handleDownloadButtonClick(): Promise<void> {
  if (isLoading.value === 'loading' || isLoading.value === 'rejected') {
    return
  }

  isLoading.value = 'loading'

  // M1: the surviving polygons and the LLF palette filtered to them; the DLF is saved as it was
  // opened (the editor does not handle entities yet)
  const exportFts = buildExportFts(fts, deletedPolygons)
  const exportLlf = buildExportLlf(fts, llf, deletedPolygons)

  const line1 = logger.log('packing level data...')

  const [packedFts, packedLlf, packedDlf] = await Promise.all([
    saveFTS(exportFts, levelId),
    saveLLF(exportLlf, levelId),
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

type MeshGroup = {
  material: MeshBasicMaterial | MeshLambertMaterial
  entries: SourcePolygon[]
  mesh: Mesh
}

function createMeshGroup(
  material: MeshBasicMaterial | MeshLambertMaterial,
  predicate: (flags: ArxPolygon['flags']) => boolean,
): MeshGroup {
  const entries: SourcePolygon[] = fts.polygons
    .map((polygon, sourceIndex) => {
      return { polygon, sourceIndex }
    })
    .filter(({ polygon }) => {
      return predicate(polygon.flags)
    })

  const mesh = arxPolygonsToMesh(
    entries.map(({ polygon }) => polygon),
    material,
    offset,
    vertexColors,
  )

  return { material, entries, mesh }
}

/** the polygons that have been deleted in the editor - the export drops them */
const deletedPolygons = new Set<number>()

const meshGroups: MeshGroup[] = [
  createMeshGroup(createMaterial({ color: Color.white.getHex() }), (flags) => {
    return !isTransparent(flags) && !isDoubleSided(flags) && !isNoDraw(flags)
  }),
  createMeshGroup(createMaterial({ color: Color.red.lighten(75).getHex(), side: DoubleSide }), (flags) => {
    return !isTransparent(flags) && isDoubleSided(flags) && !isNoDraw(flags)
  }),
  createMeshGroup(
    createMaterial({ color: Color.green.lighten(75).getHex(), transparent: true, opacity: 0.5, side: DoubleSide }),
    (flags) => {
      return isTransparent(flags) && !isNoDraw(flags)
    },
  ),
]

const meshes: Mesh[] = meshGroups.map(({ mesh }) => mesh)

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

/**
 * The FTS polygon is the unit of the level data, so deleting any of its triangles deletes the
 * whole polygon; the three merged geometries are rebuilt from the surviving polygons.
 */
function rebuildMeshes(): void {
  for (const group of meshGroups) {
    const entries = survivingEntries(group)
    const rebuilt = arxPolygonsToMesh(
      entries.map(({ polygon }) => polygon),
      group.material,
      offset,
      vertexColors,
    )

    group.mesh.geometry.dispose()
    group.mesh.geometry = rebuilt.geometry
  }

  updateTriangleToPolygonMap()
}

// TODO: add noDraw polygons

// --------------------

scene.add(...meshes)

let wireframeLines: LineSegments[] = meshGroups.map((group) => {
  const wireframe = createPolygonWireframe(
    survivingEntries(group).map(({ polygon }) => polygon),
    offset,
  )
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
 * Debug overlays: the anchors of the pathfinding graph (links in green, the anchors as little blue
 * vertical ticks), the portal quads between the rooms (cyan) and a small colored gizmo at every LLF
 * light. They are built once from the FTS/LLF data and only toggled by the checkboxes, so there is
 * no per-frame work. The anchors and the light gizmos are depth tested (the mesh hides them, as
 * usual), the portals are not (their outlines stay visible through the geometry - that is how the
 * room graph is meant to be read).
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
    new LineBasicMaterial({ color: 0x00ffcc, depthTest: false, transparent: true, opacity: 0.9 }),
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

/** the selection is polygon based: a quad is one unit, both of its triangles are highlighted */
function updateHighlightOfSelectedPolygons(): void {
  if (highlightOfSelectedPolygons.length > 0) {
    scene.remove(...highlightOfSelectedPolygons)
    highlightOfSelectedPolygons.forEach((mesh) => {
      mesh.geometry.dispose()
    })
  }

  highlightOfSelectedPolygons = [...selectedPolygons].map((polygonIndex) => {
    const mesh = new Mesh(createPolygonFillGeometry(fts.polygons[polygonIndex]), highlightMaterial)
    mesh.renderOrder = 7
    return mesh
  })

  if (highlightOfSelectedPolygons.length > 0) {
    scene.add(...highlightOfSelectedPolygons)
  }
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

  rebuildMeshes()

  isDirty.value = true

  if (wireframeVisible.value) {
    scene.remove(...wireframeLines)
  }

  wireframeLines = meshGroups.map((group) => {
    return createPolygonWireframe(
      survivingEntries(group).map(({ polygon }) => polygon),
      offset,
    )
  })

  if (wireframeVisible.value) {
    scene.add(...wireframeLines)
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

document.addEventListener(
  'mousedown',
  (event) => {
    if (!controls.isLocked) {
      return
    }

    updateMouseButtonStates(event)

    const alreadySelected = polygonBeingLookedAt !== undefined && selectedPolygons.has(polygonBeingLookedAt)

    cursorTriangleMaterial.color.set(alreadySelected ? Color.red.getHex() : Color.green.getHex())
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

    const alreadySelected = selectedPolygons.has(polygonBeingLookedAt)

    if (isAddingToSelection === undefined) {
      if (alreadySelected) {
        selectedPolygons.delete(polygonBeingLookedAt)
        cursorTriangleMaterial.color.set(Color.green.getHex())
      } else {
        selectedPolygons.add(polygonBeingLookedAt)
        cursorTriangleMaterial.color.set(Color.red.getHex())
      }

      updateHighlightOfSelectedPolygons()
    } else {
      isAddingToSelection = undefined

      cursorTriangleMaterial.color.set(alreadySelected ? Color.red.getHex() : Color.green.getHex())
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
    polygonBeingLookedAt = undefined
    return
  }

  const mesh = intersectedMeshes[0].object as Mesh
  const face = intersectedMeshes[0].face as Face
  const polygonIndex = triangleToPolygonByMesh.get(mesh)?.[face.a / 3]
  const polygon = polygonIndex === undefined ? undefined : fts.polygons[polygonIndex]

  cursorTriangleMesh.geometry.dispose()

  if (polygon === undefined) {
    // should not happen (the map covers every triangle), but keep the triangle as a fallback
    const [a, b, c] = getVerticesByFace(face, mesh.geometry)
    cursorTriangleMesh.geometry = renderTriangle(new Triangle(a, b, c))
  } else {
    cursorTriangleMesh.geometry = createPolygonOutlineGeometry(polygon)
  }

  scene.add(cursorTriangleMesh)

  polygonBeingLookedAt = polygonIndex

  const alreadySelected = polygonIndex !== undefined && selectedPolygons.has(polygonIndex)

  cursorTriangleMaterial.color.set(alreadySelected ? Color.red.getHex() : Color.green.getHex())

  if (mousePressed[LeftMouseButton].currentValue) {
    if (!mousePressed[LeftMouseButton].oldValue) {
      // left mouse button was pressed
      isAddingToSelection = !alreadySelected
    }

    if (isAddingToSelection) {
      cursorTriangleMaterial.color.set(Color.green.getHex())
      if (polygonIndex !== undefined && !alreadySelected) {
        selectedPolygons.add(polygonIndex)
        updateHighlightOfSelectedPolygons()
      }
    } else {
      cursorTriangleMaterial.color.set(Color.red.getHex())
      if (polygonIndex !== undefined && alreadySelected) {
        selectedPolygons.delete(polygonIndex)
        updateHighlightOfSelectedPolygons()
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
