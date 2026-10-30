<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { OrthographicCamera, type Mesh, type Vector3 } from 'three'
import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { cameraStore } from '../cameraStore.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import { centreOfBounds, type CameraBounds } from '../cameraBounds.ts'
import { gamePositionToWorld, worldPositionToGame } from '../cameraPose.ts'
import {
  addPreviewLights,
  attachWireframe,
  gameBoundsOf,
  previewMaterial,
  viewMeshesOf,
  type LevelWireframe,
} from '../levelScene.ts'
import { isMeshVisible, isWireframeVisible } from '../levelDisplay.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { createPolygonSelectionOverlay, type PolygonSelectionOverlay } from '../View3DWidget/polygonSelection.ts'
import { FIELD_OF_VIEW, createViewScene, disposeViewScene, resizeViewScene, type ViewScene } from '../viewScene.ts'
import type { CameraViewMode } from './cameraAlign.ts'
import { MAX_ZOOM, frameFixedView } from './fixedView.ts'
import { planePointAt, targetPositionOf } from './fixedViewTarget.ts'
import { gridOf, gridOrigin, largestSide } from './grid.ts'
import { markerPoint, markerState, projectMarker, type MarkerState } from './cameraMarker.ts'

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
const marker = ref<MarkerState>({ x: 0, y: 0, visible: false, clamped: false, degrees: 0, arrow: false })

/**
 * The grid over the view: the size of one cell in CSS pixels, and the offset of its corner.
 *
 * @remarks
 * The grid is a repeating background of the canvas instead of a three `GridHelper`: the plane of a fixed
 * view is perpendicular to the camera, so a cell of the world projects to a cell of the screen, and the CSS
 * keeps the lines sharp at every zoom. The cell is a "nice" number of the world (`gridOf`), so a deeper
 * zoom steps the grid down instead of showing one huge square.
 */
const grid = ref({ cell: 0, x: 0, y: 0 })

/**
 * Tells whether the grid of this view is on.
 *
 * @remarks
 * It starts off: the view shows the level on its own first, and the button in the corner brings the grid in
 * for a view that needs the measuring aid.
 */
const gridVisible = ref(false)

/**
 * How far this view is zoomed in: `1` is the framed view, the whole level.
 *
 * @remarks
 * Every fixed view has its own zoom, and the wheel of the pointer changes it. Above `1` the camera walks in
 * along its own line, towards the marker of the walkable camera, so the place we stand stays in the middle
 * of the small view.
 */
const zoom = ref(1)

/**
 * The zoom as the corner of the view shows it.
 */
const zoomLabel = computed(() => {
  return `${zoom.value.toFixed(1)}×`
})

/**
 * How much one pixel of the wheel turns the zoom.
 *
 * @remarks
 * The exponential keeps every step the same size, whatever the current zoom is, and the wheel back is
 * always the exact inverse of the wheel in.
 */
const WHEEL_STEP = 0.0015

let view: ViewScene<OrthographicCamera> | undefined
let shown: Mesh[] = []
let wireframe: LevelWireframe | undefined
let player: ArxVector3 | undefined
let bounds: CameraBounds | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0
let pressing = false
let stopWatching: (() => void) | undefined
let stopWatchingCamera: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingSelection: (() => void) | undefined

/**
 * The fill of the selection, over the level of the map.
 *
 * @remarks
 * The fixed views show **which** faces are selected, the way the walkable view does: the same yellow fill,
 * over the surfaces of the map. The selection is one store for the whole editor, so a face selected in the
 * walkable view is filled here too, and a fill made here shows up there.
 */
let selectionOverlay: PolygonSelectionOverlay | undefined

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
function updateMarker(target: ViewScene<OrthographicCamera>): void {
  if (player === undefined || scenePosition === undefined) {
    marker.value = { x: 0, y: 0, visible: false, clamped: false, degrees: 0, arrow: false }

    return
  }

  marker.value = markerState({
    pose: cameraStore.pose.value,
    player,
    scene: scenePosition,
    camera: target.camera,
    width: target.renderer.domElement.clientWidth,
    height: target.renderer.domElement.clientHeight,
    mode: props.mode,
  })
}

/**
 * The point the view is a window on, in the space of the meshes.
 *
 * @remarks
 * The framed (`1×`) view covers the whole level, so it is anchored to the **centre of the level**: it never
 * moves, and the marker moves inside the window (a click or a step does not shift the picture).
 *
 * A **zoomed** view is a magnifier around the camera, so it is anchored to the **marker**: the mesh follows
 * the camera and the marker stays in the middle of the canvas, which is where a zoomed view is read from.
 *
 * @returns The point to frame, or `undefined` while there is nothing to frame.
 */
function viewTarget(): Vector3 | undefined {
  if (zoom.value > 1) {
    if (player === undefined || scenePosition === undefined) {
      return undefined
    }

    return markerPoint(cameraStore.pose.value, player, scenePosition)
  }

  if (bounds === undefined || scenePosition === undefined) {
    return undefined
  }

  return gamePositionToWorld(centreOfBounds(bounds), scenePosition)
}

/**
 * Places the grid over the view: the cell of the world in pixels, and where a line of it starts.
 *
 * @param target The view the grid belongs to.
 */
function updateGrid(target: ViewScene<OrthographicCamera>): void {
  if (bounds === undefined) {
    grid.value = { cell: 0, x: 0, y: 0 }

    return
  }

  const height = target.renderer.domElement.clientHeight
  const point = viewTarget()

  if (height === 0 || point === undefined) {
    grid.value = { cell: 0, x: 0, y: 0 }

    return
  }

  const layout = gridOf(largestSide(bounds) / zoom.value)

  // the orthographic camera shows (top - bottom) / zoom units over the height of the canvas, at every depth
  const worldPerPixel = (target.camera.top - target.camera.bottom) / (target.camera.zoom * height)
  const cell = layout.cell / worldPerPixel
  const origin = projectMarker(gridOrigin(point, props.mode, layout.cell), target.camera, height, height)

  grid.value = { cell, x: origin.x, y: origin.y }
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

  const box = view.renderer.domElement
  let aspect = 1

  if (box.clientHeight > 0) {
    aspect = box.clientWidth / box.clientHeight
  }

  frameFixedView(view.camera, {
    mode: props.mode,
    bounds,
    scene: scenePosition,
    fieldOfView: FIELD_OF_VIEW,
    aspect,
    zoom: zoom.value,
    target: viewTarget(),
  })
  updateMarker(view)
  updateGrid(view)
  requestRender()
}

/**
 * Reads the pointer in the pixels of the canvas.
 *
 * @param event The pointer event of the view.
 *
 * @returns The distance of the pointer from the top left corner of the canvas, in CSS pixels.
 */
function canvasPixel(event: PointerEvent): { x: number; y: number } {
  const stage = event.currentTarget as HTMLCanvasElement
  const box = stage.getBoundingClientRect()

  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

/**
 * Moves the walkable camera to the place under the pointer, with the angle it has now.
 *
 * @remarks
 * The framed (`1×`) view is a map of the whole level: the pointer is read on the plane of the walkable camera
 * ({@link planePointAt}), and only the two axes the view shows change ({@link targetPositionOf}) — the marker
 * lands under the pointer and the height (or the distance from the level) stays. The drag uses the same
 * mapping, so it follows the pointer smoothly. A zoomed view moves the camera the same way and frames it
 * again, so the marker lands in the middle of the canvas and the level slides under it.
 *
 * @param event The pointer event of the view.
 */
function moveToPointer(event: PointerEvent): void {
  const target = view
  const pose = cameraStore.pose.value

  // without a 3D view there is nothing to move, and the store would drop the pose anyway
  if (target === undefined || pose === undefined || scenePosition === undefined || !cameraStore.hasView.value) {
    return
  }

  const box = target.renderer.domElement.getBoundingClientRect()
  const pixel = canvasPixel(event)
  const place = planePointAt(
    { x: pixel.x, y: pixel.y, width: box.width, height: box.height },
    target.camera,
    gamePositionToWorld(pose.position, scenePosition),
  )

  if (place === undefined) {
    return
  }

  cameraStore.moveCamera({
    position: targetPositionOf(props.mode, worldPositionToGame(place, scenePosition), pose.position),
    angle: pose.angle,
  })
}

/**
 * Starts the pointer on the view: a press jumps, and a drag follows the pointer.
 *
 * @remarks
 * The pointer is captured, so a drag that leaves the widget keeps reporting its moves to this view, and the
 * release always arrives here.
 *
 * @param event The pointer event of the view.
 */
function onPointerDown(event: PointerEvent): void {
  pressing = true
  moveToPointer(event)

  const stage = event.currentTarget as HTMLElement
  stage.setPointerCapture(event.pointerId)
}

/**
 * Follows a dragged pointer.
 *
 * @remarks
 * The drag is a move of the framed (`1×`) view only: zoomed in, every move of the camera reframes the view
 * around it, so the level would slide under the pointer and the drag would chase its own tail. A click works
 * in both: it moves the camera to the place under the pointer, and a zoomed view frames the camera again,
 * which puts the marker back in the middle of the canvas.
 *
 * @param event The pointer event of the view.
 */
function onPointerMove(event: PointerEvent): void {
  if (!pressing) {
    return
  }

  if (zoom.value > 1) {
    return
  }

  moveToPointer(event)
}

/**
 * Ends the drag of the pointer.
 *
 * @param event The pointer event of the view.
 */
function onPointerUp(event: PointerEvent): void {
  pressing = false

  const stage = event.currentTarget as HTMLElement

  if (stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId)
  }
}

/**
 * Zooms the view with the wheel of the pointer.
 *
 * @remarks
 * The listener is not passive, because the wheel must not scroll the page under the dock, and the zoom is
 * clamped by the framing of the view: the smallest step is the whole level, the largest one is
 * {@link MAX_ZOOM}.
 *
 * @param event The wheel event of the pointer.
 */
function onWheel(event: WheelEvent): void {
  event.preventDefault()

  const next = zoom.value * Math.exp(-event.deltaY * WHEEL_STEP)

  zoom.value = Math.min(Math.max(next, 1), MAX_ZOOM)
  frameView()
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
 * The polygons of the selection, as the map holds them.
 *
 * @param map The level of the view.
 *
 * @returns The selected polygons, in the order of the map.
 */
function selectedPolygonsOf(map: ArxMap): ArxPolygon[] {
  const polygons: ArxPolygon[] = []

  for (const index of selectionStore.polygons.value) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      polygons.push(polygon)
    }
  }

  return polygons
}

/**
 * Shows or hides the meshes of the level.
 *
 * @param visible Whether the level's surfaces should be drawn.
 */
function setMeshVisible(visible: boolean): void {
  for (const mesh of shown) {
    mesh.visible = visible
  }
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

  // the small views keep the flat, neutral face of the level: their own material, so a later texture or
  // lighting round can not repaint them (TODO 92)
  // the flat material is for the solid polygons: the invisible walls keep their transparent one, so the map
  // does not show walls the game does not draw
  shown = [...viewMeshesOf(map.solidMeshes, previewMaterial()), ...viewMeshesOf(map.invisibleMeshes)]

  setMeshVisible(isMeshVisible.value)

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // the small views draw the same wireframe as the walkable one, from the same geometry
  wireframe = attachWireframe(view.scene, map.wireframeGeometry)
  wireframe.setVisible(isWireframeVisible.value)

  // the fill of the selection, in the space of the same meshes
  selectionOverlay = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition))
  selectionOverlay.setHighlight(selectedPolygonsOf(map))

  stopWatchingSelection = watch(selectionStore.polygons, () => {
    selectionOverlay?.setHighlight(selectedPolygonsOf(map))
    requestRender()
  })

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
  wireframe?.dispose()
  wireframe = undefined
  selectionOverlay?.dispose()
  selectionOverlay = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined
  player = undefined
  bounds = undefined
  marker.value = { x: 0, y: 0, visible: false, clamped: false, degrees: 0, arrow: false }
}

onMounted(() => {
  const target = canvas.value

  if (target === null) {
    return
  }

  // a map has no perspective: the level projects to the pixels the way it looks, so a click on the map and
  // the marker of the camera read the same place at any depth
  view = createViewScene(target, new OrthographicCamera(-1, 1, 1, -1, 0.1, 10_000))
  addPreviewLights(view.scene)

  observer = new ResizeObserver(() => {
    resize()
  })

  if (host.value !== null) {
    observer.observe(host.value)
    host.value.addEventListener('wheel', onWheel, { passive: false })
  }

  // the click of a fixed view is the navigation of the walkable one (TODO 85)
  target.addEventListener('pointerdown', onPointerDown)
  target.addEventListener('pointermove', onPointerMove)
  target.addEventListener('pointerup', onPointerUp)
  target.addEventListener('pointercancel', onPointerUp)

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
      if (view === undefined) {
        return
      }

      // zoomed in, the view is a magnifier around the camera: the mesh is framed again, so the marker stays
      // in the middle of the canvas. The framed view does not move with the camera: there only the marker
      // (and the grid around the centre) is updated, which keeps the picture still
      if (zoom.value > 1) {
        frameView()

        return
      }

      updateMarker(view)
      updateGrid(view)
    },
  )
})

// the wireframe is a switch of every view at once: the same ref is read by the walkable view too
stopWatchingWireframe = watch(isWireframeVisible, (visible) => {
  wireframe?.setVisible(visible)
  requestRender()
})

// the mesh is a switch of every view as well: off, the map keeps the wireframe and the marker only
stopWatchingMesh = watch(isMeshVisible, (visible) => {
  setMeshVisible(visible)
  requestRender()
})

onBeforeUnmount(() => {
  stopWatching?.()
  stopWatching = undefined
  stopWatchingCamera?.()
  stopWatchingCamera = undefined
  stopWatchingWireframe?.()
  stopWatchingWireframe = undefined
  stopWatchingMesh?.()
  stopWatchingMesh = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined

  if (host.value !== null) {
    host.value.removeEventListener('wheel', onWheel)
  }

  const stage = canvas.value

  if (stage !== null) {
    stage.removeEventListener('pointerdown', onPointerDown)
    stage.removeEventListener('pointermove', onPointerMove)
    stage.removeEventListener('pointerup', onPointerUp)
    stage.removeEventListener('pointercancel', onPointerUp)
  }

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
    <div
      v-if="gridVisible && grid.cell > 0"
      class="grid"
      :style="{ backgroundSize: `${grid.cell}px ${grid.cell}px`, backgroundPosition: `${grid.x}px ${grid.y}px` }"
      aria-hidden="true"
    ></div>
    <div class="direction">{{ mode }}</div>
    <div class="tools">
      <span class="zoom">{{ zoomLabel }}</span>
      <button
        class="grid-toggle"
        :class="{ 'is-on': gridVisible }"
        type="button"
        :aria-pressed="gridVisible"
        :aria-label="gridVisible ? 'Hide grid' : 'Show grid'"
        v-tooltip="gridVisible ? 'Hide grid' : 'Show grid'"
        @click="gridVisible = !gridVisible"
      >
        <svg class="grid-glyph" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M3 0V10M7 0V10M0 3H10M0 7H10" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
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

  // the crosshair says the click goes somewhere: both the framed and the zoomed view move the camera
  .stage {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
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

  // the grid of the view: a repeating background, so a cell of the world is a cell of the screen
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(to right, rgba($border-strong, 0.5) 0 1px, transparent 1px 100%),
      repeating-linear-gradient(to bottom, rgba($border-strong, 0.5) 0 1px, transparent 1px 100%);
    pointer-events: none;
  }

  // the tools of the view, in the corner: the zoom and the switch of the grid, right aligned
  .tools {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zoom {
    padding: 2px 6px;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.4;
    color: $text;
    background: rgba($surface-app, 0.72);
    border-radius: 3px;
    pointer-events: none;
  }

  // the same size as the buttons of the panel header, so the corners of the shell look alike
  .grid-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: rgba($surface-app, 0.72);
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }

    // only the lines turn orange: the frame stays the neutral border of every button
    &.is-on {
      color: $accent;
    }
  }

  // a straightened `#`: two vertical and two horizontal lines, no frame around them
  .grid-glyph {
    width: 10px;
    height: 10px;
    overflow: visible;

    path {
      fill: none;
      stroke-linecap: square;
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
