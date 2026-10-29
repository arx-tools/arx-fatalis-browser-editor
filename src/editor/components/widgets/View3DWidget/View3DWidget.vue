<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { Mesh } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { cameraStore } from '../cameraStore.ts'
import { addPreviewLights, viewMeshesOf } from '../levelScene.ts'
import { createViewScene, disposeViewScene, resizeViewScene, type ViewScene } from '../viewScene.ts'
import { createOrientationGizmo, type OrientationGizmo } from './orientationGizmo.ts'
import { CameraControls } from './cameraControls.ts'

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
 *
 * @remarks
 * The numbers come from {@link cameraStore}, the same place the camera controls widget reads and writes them, so
 * the readout follows a typed position as well as a walked one. While the camera controls widget is on the
 * dock the readout is hidden: it would show the same numbers twice (TODO 82).
 */
const hud = computed(() => {
  const pose = cameraStore.pose.value

  if (pose === undefined) {
    return ''
  }

  // the camera form shows the same numbers: while it is on the dock the readout is a duplicate
  if (widgetPresence.kinds.value.has(WIDGET_KINDS.cameraControls)) {
    return ''
  }

  return [
    `position  ${pose.position.x.toFixed(2)}  ${pose.position.y.toFixed(2)}  ${pose.position.z.toFixed(2)}`,
    `rotation  ${pose.angle.pitch.toFixed(2)}  ${pose.angle.yaw.toFixed(2)}  0.00`,
  ].join('\n')
})

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const gizmoCanvas = useTemplateRef<HTMLCanvasElement>('gizmoCanvas')

let view: ViewScene | undefined
let gizmo: OrientationGizmo | undefined
let shown: Mesh[] = []
let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let frame = 0
let lastFrameAt = 0
let stopWatching: (() => void) | undefined

/**
 * Draws one frame: the scene, then the orientation compass in its own corner.
 *
 * @remarks
 * The gizmo has a canvas of its own over the corner, so it draws after the scene and never touches its
 * frame.
 */
function drawFrame(): void {
  if (view === undefined) {
    return
  }

  view.renderer.render(view.scene, view.camera)
  gizmo?.render()
}

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
    drawFrame()
  })
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
  drawFrame()

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

  if (element === null || view === undefined) {
    return
  }

  const width = element.clientWidth
  const height = element.clientHeight

  if (width === 0 || height === 0) {
    return
  }

  resizeViewScene(view, width, height)
  requestRender()
}

/**
 * Builds the scene of the widget: the renderer, the camera and the lights.
 */
function createScene(): void {
  const target = canvas.value
  const gizmoTarget = gizmoCanvas.value

  if (target === null || gizmoTarget === null) {
    return
  }

  view = createViewScene(target)

  // the walkable view shows the level with the preview lights for now (the lighting round replaces them)
  addPreviewLights(view.scene)

  gizmo = createOrientationGizmo(gizmoTarget, view.camera)
  resize()
}

/**
 * Shows a map: the meshes go into the scene and the camera starts from the player of the level.
 *
 * @param map The map the store loaded.
 */
function showMap(map: ArxMap): void {
  const target = canvas.value

  if (view === undefined || target === null) {
    return
  }

  shown = viewMeshesOf(map.meshes)

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // a level change builds a new camera: the old one has to let the pointer and the listeners go
  controls?.dispose()

  const created = new CameraControls({
    canvas: target,
    camera: view.camera,
    scene: map.scenePosition,
    player: map.player,
    onPoseChange: (pose): void => {
      cameraStore.setPose(pose)
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

  controls = created

  // the camera controls widget moves this camera, so it needs a handle on it
  cameraStore.setDriver({
    applyPose: (pose): void => {
      created.applyPose(pose)
    },
    moveToSpawn: (): void => {
      created.applySpawnPose()
    },
  })

  requestRender()
}

/**
 * Takes the map out of the scene again.
 *
 * @remarks
 * The geometry and the material belong to the store, so this only removes the wrappers of this widget: a
 * rebuilt widget puts the level back at once. The camera goes with the map: the store keeps the last pose
 * it reported, but nothing is left to move.
 */
function hideMap(): void {
  for (const mesh of shown) {
    view?.scene.remove(mesh)
  }

  shown = []

  cameraStore.setDriver(undefined)
  controls?.dispose()
  controls = undefined
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
        hideMap()
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
  cameraStore.setDriver(undefined)
  controls?.dispose()
  controls = undefined

  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }

  gizmo?.dispose()
  gizmo = undefined

  if (view !== undefined) {
    disposeViewScene(view)
    view = undefined
  }
})
</script>

<template>
  <div ref="host" class="View3DWidget">
    <canvas ref="canvas" class="stage"></canvas>
    <div class="gizmo" aria-hidden="true">
      <canvas ref="gizmoCanvas"></canvas>
    </div>
    <div v-if="hud !== ''" class="hud">{{ hud }}</div>
    <p v-if="status !== ''" class="status">{{ status }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

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

  // the compass sits in a translucent disc, so the thin triad reads on a light level and on the dark
  // empty space alike; it takes no pointer, the canvas below keeps the pointer lock. The disc is a bit
  // smaller than the square the helper draws in: the canvas is transparent around the triad, so it can
  // hang over the edge of the disc without showing
  .gizmo {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 110px;
    height: 110px;
    border-radius: 50%;
    background: rgba($ink, 0.35);
    pointer-events: none;

    canvas {
      position: absolute;
      top: 50%;
      left: 50%;
      display: block;
      width: 128px;
      height: 128px;
      transform: translate(-50%, -50%);
    }
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
