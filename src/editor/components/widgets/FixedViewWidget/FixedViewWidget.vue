<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { Mesh } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import type { CameraBounds } from '../cameraBounds.ts'
import { gameBoundsOf, viewMeshesOf } from '../levelScene.ts'
import { createViewScene, disposeViewScene, resizeViewScene, type ViewScene } from '../viewScene.ts'
import type { CameraViewMode } from './cameraAlign.ts'
import { frameFixedView } from './fixedView.ts'

/**
 * The direction the widget shows the level from.
 *
 * @remarks
 * One widget per direction (`top`, `bottom`, `front`, `back`, `left`, `right`), and the dock can hold each
 * of them once. This is the THEO Game Maker layout: the small fixed views around the working view. The
 * view is fixed: no pointer lock, no walkable camera, and the url's `position`/`rotation` never reach it.
 */
const props = defineProps<{
  readonly mode: CameraViewMode
}>()

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

let view: ViewScene | undefined
let shown: Mesh[] = []
let bounds: CameraBounds | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0
let stopWatching: (() => void) | undefined

/**
 * Draws the next frame, at most once per animation frame.
 *
 * @remarks
 * Nothing of this widget moves by itself: the scene is redrawn when the level arrives and when the
 * widget is resized, so there is no render loop.
 */
function requestRender(): void {
  if (frame !== 0) {
    return
  }

  frame = requestAnimationFrame(() => {
    frame = 0
    view?.renderer.render(view.scene, view.camera)
  })
}

/**
 * Puts the camera to the direction of the widget, for the current size of the canvas.
 *
 * @remarks
 * The level's own `?position`/`?rotation` never reach this camera: the view is always the framed
 * direction, so a link that carries a walkable pose does not move the previews.
 */
function frameView(): void {
  if (view === undefined || bounds === undefined || scenePosition === undefined) {
    return
  }

  frameFixedView(view.camera, {
    mode: props.mode,
    bounds,
    scene: scenePosition,
    fieldOfView: view.camera.fov,
    aspect: view.camera.aspect,
  })
  requestRender()
}

/**
 * Fits the renderer and the camera to the size of the widget.
 *
 * @remarks
 * The aspect ratio changes with the dock, and the framing of a direction depends on it, so the view is
 * reframed after every resize (the level stays in the frame).
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
  frameView()
}

/**
 * Reads the box of the level and frames the view to it.
 *
 * @param map The map the store loaded.
 */
function showMap(map: ArxMap): void {
  if (view === undefined) {
    return
  }

  shown = viewMeshesOf(map.meshes)

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  scenePosition = map.scenePosition
  bounds = gameBoundsOf(map.meshes, map.scenePosition)
  frameView()
}

/**
 * Takes the map out of the scene again.
 *
 * @remarks
 * The geometry and the material belong to the store: this only removes the wrappers of this widget, so
 * the level stays usable for every other view.
 */
function hideMap(): void {
  for (const mesh of shown) {
    view?.scene.remove(mesh)
  }

  shown = []
  bounds = undefined
}

onMounted(() => {
  const target = canvas.value

  if (target === null) {
    return
  }

  view = createViewScene(target)

  observer = new ResizeObserver(() => {
    resize()
  })

  if (host.value !== null) {
    observer.observe(host.value)
  }

  resize()

  // the level is not the widget's: it may have been loaded before this widget was mounted
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

onBeforeUnmount(() => {
  stopWatching?.()
  stopWatching = undefined

  observer?.disconnect()
  observer = undefined

  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }

  if (view !== undefined) {
    disposeViewScene(view)
    view = undefined
  }
})
</script>

<template>
  <div ref="host" class="FixedViewWidget">
    <canvas ref="canvas" class="stage"></canvas>
    <div class="direction">{{ mode }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// A fixed view: the canvas fills the widget and the only overlay is the name of the direction, so it is
// clear which one this is.
.FixedViewWidget {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: $surface-widget;

  .stage {
    display: block;
    width: 100%;
    height: 100%;
  }

  .direction {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 2px 6px;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.4;
    text-transform: uppercase;
    color: $text;
    background: rgba($surface-app, 0.72);
    border-radius: 3px;
    pointer-events: none;
  }
}
</style>
