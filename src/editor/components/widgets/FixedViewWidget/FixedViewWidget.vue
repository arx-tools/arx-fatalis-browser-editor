<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { Mesh } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { cameraStore } from '../cameraStore.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import type { CameraBounds } from '../cameraBounds.ts'
import { gameBoundsOf, viewMeshesOf } from '../levelScene.ts'
import { createViewScene, disposeViewScene, resizeViewScene, type ViewScene } from '../viewScene.ts'
import type { CameraViewMode } from './cameraAlign.ts'
import { frameFixedView } from './fixedView.ts'
import { markerState, type MarkerState } from './cameraMarker.ts'

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

/**
 * Where the camera marker sits on the canvas, in CSS pixels, and whether it is in front of the camera.
 *
 * @remarks
 * The marker follows the camera of the walkable view, so it is recomputed when that camera reports a pose
 * (a step, a jump), and when the framing of this view changes (a resize, a level). It is a plain element
 * over the canvas (not a sprite of the scene), so the geometry never covers it and it stays sharp at every
 * size.
 */
const marker = ref<MarkerState>({ x: 0, y: 0, visible: false, degrees: 0, arrow: false })

let view: ViewScene | undefined
let shown: Mesh[] = []
let player: ArxVector3 | undefined
let bounds: CameraBounds | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0
let stopWatching: (() => void) | undefined
let stopWatchingCamera: (() => void) | undefined

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
 * Projects the camera onto the canvas of the framed view.
 *
 * @param target The view the marker belongs to.
 */
function updateMarker(target: ViewScene): void {
  if (player === undefined || scenePosition === undefined) {
    marker.value = { x: 0, y: 0, visible: false, degrees: 0, arrow: false }

    return
  }

  marker.value = markerState({
    pose: cameraStore.pose.value,
    player,
    scene: scenePosition,
    camera: target.camera,
    width: target.renderer.domElement.clientWidth,
    height: target.renderer.domElement.clientHeight,
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
  updateMarker(view)
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
  player = map.player.position
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
  player = undefined
  bounds = undefined
  marker.value = { x: 0, y: 0, visible: false, degrees: 0, arrow: false }
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

  // the marker follows the camera of the walkable view: a step or a jump moves it in every fixed view,
  // and the level itself does not have to be drawn again (the dot is a DOM element)
  stopWatchingCamera = watch(
    () => {
      return cameraStore.pose.value
    },
    () => {
      if (view !== undefined) {
        updateMarker(view)
      }
    },
  )
})

onBeforeUnmount(() => {
  stopWatching?.()
  stopWatching = undefined
  stopWatchingCamera?.()
  stopWatchingCamera = undefined

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
    <svg
      v-if="marker.visible"
      class="camera-mark"
      viewBox="0 0 11 16"
      :style="{
        left: `${marker.x}px`,
        top: `${marker.y}px`,
        transform: `translate(-50%, -50%) rotate(${marker.degrees}deg)`,
      }"
      aria-hidden="true"
    >
      <polygon points="5.5,1 10,15 1,15" />
    </svg>
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

  // where the camera of the walkable view stands: the red arrowhead the game itself uses for the player,
  // turned with the way the camera looks. It does not scale with the zoom: it marks a place, not a piece
  // of geometry. An `svg` keeps the outline a true pixel wide on the slanted sides, too
  .camera-mark {
    position: absolute;
    width: 11px;
    height: 16px;
    overflow: visible;
    pointer-events: none;

    polygon {
      fill: $marker;
      stroke: $ink;
      stroke-width: 1;
      stroke-linejoin: round;
    }
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
