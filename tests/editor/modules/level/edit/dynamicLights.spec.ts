import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it, type TestContext } from 'node:test'
import { ArxLightFlags, type ArxColor, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import { BufferAttribute, Color, SRGBColorSpace } from 'three'
import { nextTick } from 'vue'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import {
  isDynamicLightsVisible,
  isStaticLightsVisible,
  registerDynamicLightsView,
  startDynamicLights,
} from '../../../../../src/editor/modules/level/edit/dynamicLights.ts'
import { bumpLevelRevision } from '../../../../../src/editor/modules/level/edit/editing.ts'
import { touchLights } from '../../../../../src/editor/modules/level/edit/lightEditing.ts'
import { writeBakedColors } from '../../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
import { setFlatLight } from '../../../../../src/editor/modules/level/edit/lightingFlat.ts'
import { levelStore } from '../../../../../src/editor/modules/level/edit/levelStore.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * The grey of the palette of the test floor.
 */
const FLOOR_GREY = 128

/**
 * The weight of the torch of the test on a corner of the blank floor.
 */
const TORCH_WEIGHT = (200 / Math.hypot(50, 200, 50)) * 0.85 * 0.5

/**
 * The animation frames the test hands out: the browser's are asynchronous, and the layer is only worth testing when the
 * test decides when a frame runs.
 */
const frames = new Map<number, (now: number) => void>()
let nextHandle = 1

const realRequestAnimationFrame = globalThis.requestAnimationFrame
const realCancelAnimationFrame = globalThis.cancelAnimationFrame

Object.defineProperties(globalThis, {
  requestAnimationFrame: {
    value: (callback: (now: number) => void): number => {
      const handle = nextHandle

      nextHandle = nextHandle + 1
      frames.set(handle, callback)

      return handle
    },
    configurable: true,
    writable: true,
  },
  cancelAnimationFrame: {
    value: (handle: number): void => {
      frames.delete(handle)
    },
    configurable: true,
    writable: true,
  },
})

/**
 * Runs the frame the layer is waiting for, if there is one.
 */
function nextFrame(): void {
  const [handle, callback] = frames.entries().next().value ?? []

  if (handle === undefined || callback === undefined) {
    return
  }

  frames.delete(handle)
  callback(0)
}

/**
 * The linear value of a grey, the way the attribute carries it.
 *
 * @param grey The grey in sRGB, from 0 to 255.
 *
 * @returns The channel in the working colour space.
 */
function linearOf(grey: number): number {
  return new Color().setRGB(grey / 255, grey / 255, grey / 255, SRGBColorSpace).r
}

/**
 * One channel of the first corner of the solid mesh.
 *
 * @param map The level to read.
 *
 * @returns The value of the attribute.
 *
 * @throws When the level has no colour attribute.
 */
function firstColorOf(map: ArxMap): number {
  const attribute = map.solidMeshes[0]?.geometry.getAttribute('color')

  if (!(attribute instanceof BufferAttribute)) {
    throw new TypeError('the level has no colour attribute')
  }

  return attribute.array[0]
}

/**
 * A light of the test.
 *
 * @param position Where the light stands, in the scene of the level.
 *
 * @returns The light, with the fields an LLF light has.
 */
function lightOf(position: ArxVector3): ArxLight {
  return {
    position,
    color: { r: 200, g: 200, b: 200, a: 255 },
    fallStart: 300,
    fallEnd: 400,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 255 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: ArxLightFlags.SemiDynamic,
  }
}

/**
 * A level of one floor tile, with its baked colours and a burning torch above it.
 *
 * @param options The light of the level.
 * @param options.burning Whether the torch burns at all.
 *
 * @returns The map, ready for the layer.
 *
 * @throws When the blank level has no face.
 */
function litFloor(options: { burning?: boolean } = {}): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const colors: ArxColor[] = Array.from({ length: 4 }, () => {
    return { r: FLOOR_GREY, g: FLOOR_GREY, b: FLOOR_GREY, a: 255 }
  })
  const polygon = map.polygons[0]

  if (polygon === undefined) {
    throw new Error('the blank level has no face')
  }

  map.llf.colors = colors
  map.llf.lights = []

  for (const [index, vertex] of polygon.vertices.entries()) {
    vertex.llfColorIdx = index
  }

  if (options.burning !== false) {
    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]
  }

  writeBakedColors(map)

  return map
}

/**
 * What the test counts of the layer.
 */
type Renders = {
  count: number
}

/**
 * A view the test registered.
 */
type RegisteredView = {
  unregister: () => void
}

/**
 * Registers a fake view and turns the layer on.
 *
 * @returns The count of the renders and the function that takes the view out again.
 */
async function startLayer(): Promise<{ renders: Renders; unregister: () => void }> {
  const renders: Renders = { count: 0 }
  const unregister = registerDynamicLightsView(() => {
    renders.count = renders.count + 1
  })

  isDynamicLightsVisible.value = true

  await nextTick()

  return { renders, unregister }
}

/**
 * Turns the layer off and takes the view out.
 *
 * @param view The view the test registered.
 */
async function stopLayer(view: RegisteredView): Promise<void> {
  isDynamicLightsVisible.value = false

  await nextTick()
  view.unregister()
  frames.clear()
}

before(() => {
  startDynamicLights()
})

beforeEach(async () => {
  frames.clear()
  isDynamicLightsVisible.value = false
  isStaticLightsVisible.value = true
  levelStore.map.value = undefined

  await nextTick()
})

after(() => {
  Object.defineProperties(globalThis, {
    requestAnimationFrame: { value: realRequestAnimationFrame, configurable: true, writable: true },
    cancelAnimationFrame: { value: realCancelAnimationFrame, configurable: true, writable: true },
  })
})

void describe('the dynamic light layer', () => {
  void it('draws the light of the level when the switch goes on', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    assert.ok(firstColorOf(map) > linearOf(FLOOR_GREY))
    assert.ok(view.renders.count > 0)

    await stopLayer(view)
  })

  void it('draws a frame on every animation frame', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()
    const before = view.renders.count

    nextFrame()

    assert.ok(view.renders.count > before)

    await stopLayer(view)
  })

  void it('puts the baked colour back when the switch goes off', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    assert.ok(firstColorOf(map) > linearOf(FLOOR_GREY))

    await stopLayer(view)

    assert.ok(Math.abs(firstColorOf(map) - linearOf(FLOOR_GREY)) < 1e-6)
  })

  void it('follows a palette baked again', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    setFlatLight(map, 1)
    writeBakedColors(map)
    bumpLevelRevision()

    await nextTick()

    // the flat light is white, and the torch clamps the corner to white as well
    assert.ok(Math.abs(firstColorOf(map) - linearOf(255)) < 1e-6)

    await stopLayer(view)
  })

  void it('builds the layer again after a moved face', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()
    const before = view.renders.count

    const geometry = map.solidMeshes[0]?.geometry

    if (geometry !== undefined) {
      geometry.getAttribute('position').needsUpdate = true
    }

    bumpLevelRevision()

    await nextTick()

    // the frame of the ticker runs on the stale model: it draws nothing, and the rebuild waits for the timer
    nextFrame()
    t.mock.timers.tick(150)
    await nextTick()

    t.assert.ok(view.renders.count > before)

    await stopLayer(view)
  })

  void it('builds the layer again after a light edit', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()
    const before = view.renders.count

    touchLights()

    await nextTick()
    t.mock.timers.tick(150)
    await nextTick()

    t.assert.ok(view.renders.count > before)

    await stopLayer(view)
  })

  void it('builds when a view arrives after the switch', async () => {
    const map = litFloor()

    levelStore.map.value = map
    isDynamicLightsVisible.value = true

    await nextTick()

    const renders: Renders = { count: 0 }
    const unregister = registerDynamicLightsView(() => {
      renders.count = renders.count + 1
    })

    assert.ok(firstColorOf(map) > linearOf(FLOOR_GREY))
    assert.ok(renders.count > 0)

    unregister()
    isDynamicLightsVisible.value = false

    await nextTick()
  })

  void it('starts no frame for a level without a burning light', async () => {
    const map = litFloor({ burning: false })

    levelStore.map.value = map

    const view = await startLayer()

    assert.equal(frames.size, 0)

    await stopLayer(view)
  })

  void it('takes the last view out of the frame chain', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    view.unregister()

    assert.equal(frames.size, 0)

    isDynamicLightsVisible.value = false

    await nextTick()
  })

  void it('draws the level dark when the static lights go off', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    isDynamicLightsVisible.value = false

    await nextTick()

    assert.ok(Math.abs(firstColorOf(map) - linearOf(FLOOR_GREY)) < 1e-6)

    isStaticLightsVisible.value = false

    await nextTick()

    assert.equal(firstColorOf(map), 0)

    isStaticLightsVisible.value = true

    await nextTick()

    assert.ok(Math.abs(firstColorOf(map) - linearOf(FLOOR_GREY)) < 1e-6)

    await stopLayer(view)
  })

  void it('draws the torch in the dark when the static lights are off', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    isStaticLightsVisible.value = false

    await nextTick()

    const expected = Math.round(TORCH_WEIGHT * 200)

    assert.ok(Math.abs(firstColorOf(map) - linearOf(expected)) < 1e-6)

    isStaticLightsVisible.value = true

    await nextTick()

    assert.ok(firstColorOf(map) > linearOf(expected))

    await stopLayer(view)
  })

  void it('puts nothing back without a level', async () => {
    isDynamicLightsVisible.value = true

    await nextTick()

    isDynamicLightsVisible.value = false

    await nextTick()

    assert.equal(frames.size, 0)
  })

  void it('draws nothing when no switch is off its default', async () => {
    const map = litFloor()

    levelStore.map.value = map

    await nextTick()

    assert.ok(Math.abs(firstColorOf(map) - linearOf(FLOOR_GREY)) < 1e-6)
  })

  void it('draws the dark level again after a bake', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    isDynamicLightsVisible.value = false
    isStaticLightsVisible.value = false

    await nextTick()

    bumpLevelRevision()

    await nextTick()

    assert.equal(firstColorOf(map), 0)

    await stopLayer(view)
  })

  void it('has no geometry to paint on a level without a mesh', async () => {
    const empty = { solidMeshes: [] } as unknown as ArxMap

    levelStore.map.value = empty
    isStaticLightsVisible.value = false

    const renders: Renders = { count: 0 }
    const unregister = registerDynamicLightsView(() => {
      renders.count = renders.count + 1
    })

    await nextTick()

    isDynamicLightsVisible.value = true

    await nextTick()
    bumpLevelRevision()

    await nextTick()

    assert.ok(renders.count > 0)

    unregister()
    isDynamicLightsVisible.value = false
    isStaticLightsVisible.value = true

    await nextTick()
  })

  void it('starts once', () => {
    startDynamicLights()

    assert.equal(frames.size, 0)
  })

  void it('does nothing on an edit while the switch is off', async () => {
    bumpLevelRevision()
    touchLights()

    await nextTick()

    assert.equal(frames.size, 0)
  })

  void it('follows a level that went away', async () => {
    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()
    const before = view.renders.count

    levelStore.map.value = undefined
    nextFrame()

    await nextTick()
    bumpLevelRevision()

    await nextTick()

    assert.equal(view.renders.count, before)

    isDynamicLightsVisible.value = false

    await nextTick()

    view.unregister()
  })

  void it('builds again when the level is gone before the rebuild', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const map = litFloor()

    levelStore.map.value = map

    const view = await startLayer()

    touchLights()

    await nextTick()
    touchLights()

    await nextTick()

    levelStore.map.value = undefined

    await nextTick()
    t.mock.timers.tick(150)

    t.assert.strictEqual(frames.size, 0)

    isDynamicLightsVisible.value = false

    await nextTick()

    view.unregister()
  })

  void it('waits for a build when the layer cannot draw', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const map = litFloor()
    const geometry = map.solidMeshes[0]?.geometry
    const attribute = geometry?.getAttribute('color')

    levelStore.map.value = map

    if (geometry !== undefined) {
      geometry.deleteAttribute('color')
    }

    const view = await startLayer()

    if (geometry !== undefined && attribute !== undefined) {
      geometry.setAttribute('color', attribute)
    }

    t.mock.timers.tick(150)
    await nextTick()

    t.assert.ok(view.renders.count > 0)

    await stopLayer(view)
  })

  void it('waits for a build after an edit without a colour attribute', async (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const map = litFloor()
    const geometry = map.solidMeshes[0]?.geometry
    const attribute = geometry?.getAttribute('color')

    levelStore.map.value = map

    const view = await startLayer()

    if (geometry !== undefined) {
      geometry.deleteAttribute('color')
    }

    bumpLevelRevision()

    await nextTick()

    if (geometry !== undefined && attribute !== undefined) {
      geometry.setAttribute('color', attribute)
    }

    t.mock.timers.tick(150)
    await nextTick()

    t.assert.ok(view.renders.count > 0)

    await stopLayer(view)
  })
})
