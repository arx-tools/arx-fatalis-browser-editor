import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { FTS } from 'arx-convert'
import type { ArxFTS } from 'arx-convert/types'
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Euler,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { isQuad } from 'arx-convert/utils'
import { downloadBinaryAs, zipBuffers } from './download.js'
import { canvas, downloadBtn, isLoading, mouseLocked, mouseUnlocked } from './ui/ui.js'

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
const timer = new Timer()

timer.connect(document)

let offset = new Vector3(fts.polygons[0].vertices[0].x, fts.polygons[0].vertices[0].y, fts.polygons[0].vertices[0].z)
offset = offset.add(new Vector3(50, 10, 50))

fts.polygons.forEach((polygonData) => {
  const material = new MeshPhongMaterial({ color: 0xaa_88_44 })

  // TODO: polygons are mirrored

  if (isQuad(polygonData)) {
    const [a, b, c, d] = polygonData.vertices

    // prettier-ignore
    const vertices = new Float32Array([
      c.x - offset.x, -(c.y - offset.y), c.z - offset.z,
      b.x - offset.x, -(b.y - offset.y), b.z - offset.z,
      a.x - offset.x, -(a.y - offset.y), a.z - offset.z,

      d.x - offset.x, -(d.y - offset.y), d.z - offset.z,
      b.x - offset.x, -(b.y - offset.y), b.z - offset.z,
      c.x - offset.x, -(c.y - offset.y), c.z - offset.z,
    ])

    // prettier-ignore
    const normals = new Float32Array([
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,

      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm2.x, polygonData.norm2.y, polygonData.norm2.z,
    ])

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))

    const polygon = new Mesh(geometry, material)
    scene.add(polygon)
  } else {
    const [a, b, c] = polygonData.vertices

    // prettier-ignore
    const vertices = new Float32Array([
      c.x - offset.x, -(c.y - offset.y), c.z - offset.z,
      b.x - offset.x, -(b.y - offset.y), b.z - offset.z,
      a.x - offset.x, -(a.y - offset.y), a.z - offset.z,
    ])

    // prettier-ignore
    const normals = new Float32Array([
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
      polygonData.norm.x, polygonData.norm.y, polygonData.norm.z,
    ])

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(vertices, 3))
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))

    const polygon = new Mesh(geometry, material)
    scene.add(polygon)
  }
})

const color = 0xff_ff_ff

const light1 = new DirectionalLight(color, 2)
light1.position.set(-1, 2, 4)

const light2 = new AmbientLight(color, 0.1)

scene.add(light1, light2)

// --------------------

const renderer = new WebGLRenderer({ antialias: true, canvas })
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

const fov = 75
const aspect = canvas.clientWidth / canvas.clientHeight
const near = 0.1
const far = 1000
const camera = new PerspectiveCamera(fov, aspect, near, far)

camera.position.z = 500

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

const pressedKeys: Record<string, boolean> = {}

function render(): void {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }

  const delta = timer.getDelta()

  controls.update(delta)

  renderer.render(scene, camera)
}

function animate(): void {
  timer.update()

  if (controls.isLocked) {
    mouseLocked.style.display = 'block'
    mouseUnlocked.style.display = 'none'

    const facing = new Vector3()
    camera.getWorldDirection(facing)

    const direction = new Vector3(0, 0, 0)

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
    direction.multiplyScalar(cameraSpeed)
    camera.position.add(direction)
  } else {
    mouseLocked.style.display = 'none'
    mouseUnlocked.style.display = 'block'
  }

  render()
}

renderer.setAnimationLoop(animate)

function onKeyDown(event: KeyboardEvent): void {
  if (event.code === 'KeyEsc') {
    controls.unlock()
    return
  }

  pressedKeys[event.code] = true
}

function onKeyUp(event: KeyboardEvent): void {
  pressedKeys[event.code] = false
}

document.addEventListener('keydown', onKeyDown, false)
document.addEventListener('keyup', onKeyUp, false)

canvas.addEventListener('click', () => {
  controls.lock()
})
window.addEventListener('blur', () => {
  controls.unlock()
})

// TODO: add gizmo
