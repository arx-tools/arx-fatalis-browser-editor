<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { levelStore } from '../../modules/level/levelStore.ts'
import { CameraControls } from '../../modules/view3d/cameraControls.ts'
import { readGameAngle, worldPositionToGame } from '../../modules/view3d/cameraPose.ts'
import { addPreviewLights, fitCameraToCanvas } from '../../modules/view3d/levelScene.ts'

/**
 * What the widget shows over the canvas: the loading state, a failure, or nothing while the level is on.
 *
 * The level itself is loaded by {@link levelStore}, so a rebuilt widget shows it at once.
 */
const status = computed(() => {
  if (levelStore.status.value === 'error') {
    return levelStore.error.value ?? 'Failed to load the level.'
  }

  if (levelStore.status.value === 'ready') {
    return ''
  }

  return 'Loading the level…'
})

/**
 * The readout over the canvas: the camera position and rotation in the game's coordinates, in the same
 * format as the game's own debug hud. There is no pencil button and no click-to-copy yet.
 */
const hud = ref('')

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

let renderer: WebGLRenderer | undefined
let scene: Scene | undefined
let camera: PerspectiveCamera | undefined
let controls: CameraControls | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0
let lastFrameAt = 0
let stopWatching: (() => void) | undefined

/**
 * Draws the next frame, at most once per animation frame.
 *
 * @remarks
 * The first round has no controls and no animation, so the scene is only redrawn when something changes:
 * after the level arrived, after a resize.
 */
function requestRender(): void {
  if (frame !== 0) {
    return
  }

  frame = requestAnimationFrame(() => {
    frame = 0

    if (renderer !== undefined && scene !== undefined && camera !== undefined) {
      renderer.render(scene, camera)
    }
  })
}

/**
 * Turns the pose of the camera into the text of the readout.
 *
 * The values are in the game's coordinate system and in the game's debug hud format (`position x y z`,
 * `rotation pitch yaw roll`), so the two can be compared directly. The roll is always zero.
 */
function refreshHud(): void {
  if (camera === undefined || scenePosition === undefined) {
    return
  }

  const position = worldPositionToGame(camera.position, scenePosition)
  const { pitch, yaw } = readGameAngle(camera)

  hud.value = [
    `position  ${position.x.toFixed(2)}  ${position.y.toFixed(2)}  ${position.z.toFixed(2)}`,
    `rotation  ${pitch.toFixed(2)}  ${yaw.toFixed(2)}  0.00`,
  ].join('\n')
}

/**
 * Draws the frames for as long as the pointer is locked.
 *
 * @remarks
 * Outside the pointer lock nothing moves the camera, so the scene is only redrawn when something
 * changes (the level arrived, the widget was resized). The loop stops when the lock is released.
 *
 * @param now The timestamp the browser gave the frame.
 */
function animate(now: number): void {
  let deltaSeconds = 0

  if (lastFrameAt !== 0) {
    deltaSeconds = (now - lastFrameAt) / 1000
  }

  lastFrameAt = now

  if (controls?.isLocked !== true) {
    frame = 0
    lastFrameAt = 0

    return
  }

  controls.update(deltaSeconds)

  if (renderer !== undefined && scene !== undefined && camera !== undefined) {
    renderer.render(scene, camera)
  }

  frame = requestAnimationFrame(animate)
}

/**
 * Starts the locked movement loop, if it is not running already.
 */
function startLoop(): void {
  if (frame !== 0) {
    requestAnimationFrame(animate)
    return
  }

  lastFrameAt = 0
  frame = requestAnimationFrame(animate)
}

/**
 * Fits the renderer and the camera to the size of the widget.
 *
 * The dock moves and resizes the widget node, so the canvas has to follow it.
 */
function resize(): void {
  const element = host.value

  if (element === null || renderer === undefined || camera === undefined) {
    return
  }

  const width = element.clientWidth
  const height = element.clientHeight

  if (width === 0 || height === 0) {
    return
  }

  renderer.setSize(width, height, false)
  fitCameraToCanvas(camera, width, height)
  requestRender()
}

/**
 * Frees the GPU resources of the scene.
 */
function disposeScene(): void {
  scene?.traverse((object) => {
    const disposables = object as unknown as {
      geometry?: { dispose?: () => void }
      material?: { dispose?: () => void }
    }

    disposables.geometry?.dispose?.()
    disposables.material?.dispose?.()
  })

  scene = undefined
  camera = undefined
  renderer?.dispose()
  renderer = undefined
}

/**
 * Builds the scene of the widget: the renderer, the camera and the lights.
 */
function createScene(): void {
  const target = canvas.value

  if (target === null) {
    return
  }

  renderer = new WebGLRenderer({ canvas: target, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  scene = new Scene()
  camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
  addPreviewLights(scene)
  resize()
}

/**
 * Shows a map: the meshes go into the scene and the camera starts from the player of the level.
 *
 * @param map The map the store loaded.
 */
function showMap(map: ArxMap): void {
  const target = canvas.value

  if (scene === undefined || camera === undefined || target === null) {
    return
  }

  for (const mesh of map.meshes) {
    scene.add(mesh)
  }

  scenePosition = map.scenePosition
  controls = new CameraControls({
    canvas: target,
    camera,
    scene: map.scenePosition,
    player: map.player,
    onPoseChange: (): void => {
      refreshHud()
      requestRender()
    },
    onLockChange: (locked: boolean): void => {
      if (locked) {
        startLoop()

        return
      }

      requestRender()
    },
  })

  refreshHud()
  requestRender()
}

/**
 * Takes the map out of the scene again.
 *
 * @remarks
 * The meshes belong to the store, so this only unparents them: a rebuilt widget puts the same
 * geometries back, and their materials are not touched.
 *
 * @param map The map to remove from the scene.
 */
function hideMap(map: ArxMap): void {
  for (const mesh of map.meshes) {
    scene?.remove(mesh)
  }
}

onMounted(() => {
  createScene()

  observer = new ResizeObserver(() => {
    resize()
  })

  if (host.value !== null) {
    observer.observe(host.value)
  }

  // The level is not the widget's: it may have been loaded before this widget was even mounted, and it
  // stays loaded when the widget goes away (a layout reset rebuilds the dock, not the map). The watch
  // starts here and not in the setup, because `immediate` has to find the scene already built.
  stopWatching = watch(
    () => {
      return levelStore.map.value
    },
    (map, previous) => {
      if (previous !== undefined) {
        hideMap(previous)
      }

      if (map !== undefined) {
        showMap(map)
      }
    },
    { immediate: true },
  )
})

// the level is not the widget's: it may have been loaded before this widget was even mounted, and it
// stays loaded when the widget goes away (a layout reset rebuilds the dock, not the map)
onBeforeUnmount(() => {
  stopWatching?.()
  stopWatching = undefined

  observer?.disconnect()
  observer = undefined
  controls?.dispose()
  controls = undefined

  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }

  disposeScene()
})
</script>

<template>
  <div ref="host" class="View3DWidget">
    <canvas ref="canvas" class="stage"></canvas>
    <div v-if="hud !== ''" class="hud">{{ hud }}</div>
    <p v-if="status !== ''" class="status">{{ status }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

// The 3D view: the canvas fills the widget and the renderer follows its size. The readout and the
// status line are plain elements above the canvas (the readout is not painted into it), so both are
// selectable and stylable, and neither takes the pointer away from the canvas.
.View3DWidget {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: $surface-widget;
  color: $text-muted;

  .stage {
    display: block;
    width: 100%;
    height: 100%;
  }

  // the camera readout: two lines, in the game's debug hud format
  .hud {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 4px 8px;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre;
    color: $text;
    background: rgba($surface-app, 0.72);
    border-radius: 3px;
    pointer-events: none;
  }

  .status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 16px;
    font-size: 13px;
    text-align: center;
    pointer-events: none;
  }
}
</style>
