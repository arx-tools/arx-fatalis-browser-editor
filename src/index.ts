import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { FTS } from 'arx-convert'
import type { ArxFTS } from 'arx-convert/types'
import { BoxGeometry, DirectionalLight, Mesh, MeshPhongMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { downloadBinaryAs, zipBuffers } from './download.js'
import { canvas, downloadBtn, isLoading, isWindowFocused } from './ui/ui.js'

// --------------------

async function wait(delayInMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, delayInMs)
  })
}

async function getFTS(level: number): Promise<ArxFTS> {
  console.log(`downloading level ${level} fts...`)

  const response = await fetch(
    `https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis/level${level}/fast.fts`,
  )
  if (!response.ok) {
    const errorResponse = await response.text()
    throw new Error(`Failed to load level ${level}: ${errorResponse}`)
  }

  console.log(`finished downloading level ${level} fts`)

  await wait(100)

  console.log(`unpacking level ${level} fts...`)

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

  console.log(`finished unpacking level ${level} fts`)

  return fts
}

async function saveFTS(fts: ArxFTS, level: number): Promise<ArrayBuffer> {
  console.log(`packing level ${level} fts...`)

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

  console.log(`finished packing level ${level} fts`)

  return packedFts
}

function changeStuff(fts: ArxFTS, level: number): void {
  console.log(`modifying level ${level} fts...`)
  for (const polygon of fts.polygons) {
    polygon.vertices[0].y = polygon.vertices[0].y - 10
  }

  console.log(`finished modifying level ${level} fts`)
}

// --------------------

const level = 11

isLoading.currentValue = true

const fts = await getFTS(level)

isLoading.currentValue = false

downloadBtn.addEventListener('click', async () => {
  isLoading.currentValue = true

  console.log('downloading')

  const packedFts = await saveFTS(fts, level)

  const zip = await zipBuffers({
    [`/game/graph/levels/level${level}/fast.fts`]: packedFts,
  })

  downloadBinaryAs('mod.zip', zip, 'application/zip')

  isLoading.currentValue = false
})

// --------------------

const scene = new Scene()

function createBox(color: number, offsetX: number): Mesh {
  const material = new MeshPhongMaterial({ color })
  const geometry = new BoxGeometry(1, 1, 1)
  const cube = new Mesh(geometry, material)

  cube.position.x = offsetX

  return cube
}

const meshes = [createBox(0x88_44_aa, -2), createBox(0x44_aa_88, 0), createBox(0xaa_88_44, 2)]
meshes.forEach((mesh) => {
  scene.add(mesh)
})

const color = 0xff_ff_ff
const intensity = 3
const light = new DirectionalLight(color, intensity)
light.position.set(-1, 2, 4)
scene.add(light)

// --------------------

const renderer = new WebGLRenderer({ antialias: true, canvas })
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

const fov = 75
const aspect = canvas.clientWidth / canvas.clientHeight
const near = 0.1
const far = 10
const camera = new PerspectiveCamera(fov, aspect, near, far)

camera.position.z = 5

renderer.render(scene, camera)

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

function render(timeInMs: number): void {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }

  renderer.render(scene, camera)

  if (isWindowFocused.currentValue === true) {
    requestAnimationFrame(render)
  }
}

requestAnimationFrame(render)

isWindowFocused.addEventListener('change', (event: CustomEventInit<{ oldValue: boolean; currentValue: boolean }>) => {
  if (event.detail?.currentValue === true) {
    requestAnimationFrame(render)
  }
})
