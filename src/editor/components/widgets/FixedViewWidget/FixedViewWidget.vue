<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { OrthographicCamera, type Mesh, type Vector3 } from 'three'
import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { centreOfBounds, type CameraBounds } from '../shared/cameraBounds.ts'
import { gamePositionToWorld } from '../camera/cameraPose.ts'
import {
  addPreviewLights,
  attachWireframe,
  gameBoundsOf,
  previewMaterial,
  viewMeshesOf,
  type LevelWireframe,
} from '../shared/levelScene.ts'
import { isMeshVisible, isRoomColorsVisible, isWireframeVisible } from '../shared/levelDisplay.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { selectedRoom } from '../../../modules/rooms/roomStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { createPolygonSelectionOverlay, type PolygonSelectionOverlay } from '../View3DWidget/polygonSelection.ts'
import { createRoomOverlay, type RoomOverlay } from '../shared/roomOverlay.ts'
import {
  FIELD_OF_VIEW,
  createViewScene,
  disposeViewScene,
  resizeViewScene,
  type ViewScene,
} from '../shared/viewScene.ts'
import type { CameraViewMode } from './cameraAlign.ts'
import { frameFixedView } from './fixedView.ts'
import { useFixedViewPointer } from './useFixedViewPointer.ts'
import { markerPoint, markerState, type MarkerState } from './cameraMarker.ts'

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

let view: ViewScene<OrthographicCamera> | undefined
let shown: Mesh[] = []
let rooms: RoomOverlay | undefined
let wireframe: LevelWireframe | undefined
let player: ArxVector3 | undefined
let bounds: CameraBounds | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0
let stopWatching: (() => void) | undefined
let stopWatchingCamera: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingRooms: (() => void) | undefined
let stopWatchingMapId: (() => void) | undefined
let stopWatchingRoom: (() => void) | undefined
let stopWatchingEdit: (() => void) | undefined
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
  requestRender()
}

/**
 * The pointer of the view: the jump and the drag of the walkable camera, and the wheel of the zoom.
 *
 * @remarks
 * The gesture has its own module (`useFixedViewPointer.ts`): this is where the widget binds the scene, the level, the
 * zoom and the framing to it.
 */
const pointer = useFixedViewPointer({
  view: () => {
    return view
  },
  scenePosition: () => {
    return scenePosition
  },
  mode: () => {
    return props.mode
  },
  zoom,
  frameView,
})

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
  const showRooms = visible && isRoomColorsVisible.value

  for (const mesh of shown) {
    mesh.visible = visible && !showRooms
  }

  if (rooms !== undefined) {
    rooms.mesh.visible = showRooms
  }
}

/**
 * Recolours the room map after an edit.
 *
 * @remarks
 * An edit refills the geometry of the level in place: the colour attribute of the room map is not refilled with it,
 * so the map is coloured again when its vertex count no longer matches the geometry.
 */
function repaintRooms(): void {
  const map = levelStore.map.value

  if (map === undefined || rooms === undefined) {
    return
  }

  const vertexCount = map.solidMeshes[0].geometry.getAttribute('position').count
  const colorCount = rooms.mesh.geometry.getAttribute('color')?.count

  if (colorCount !== vertexCount) {
    rooms.repaint(map, currentMapId.value)
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
  // the whole level is one mesh, so the flat material draws every polygon: the faces of a fully transparent texture
  // (the walls of the game, the holes of a colour key) are cut by the alpha test of the walkable view, not here — the
  // map is a silhouette, and the few faces of a stairwell do not change it
  shown = viewMeshesOf(map.solidMeshes, previewMaterial())

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // the room map shares the geometry of the level, so the small views show the same areas
  rooms = createRoomOverlay(map, currentMapId.value)
  rooms.setHighlight(selectedRoom.value)
  view.scene.add(rooms.mesh)
  setMeshVisible(isMeshVisible.value)

  // the small views draw the same wireframe as the walkable one, from the same geometry
  wireframe = attachWireframe(view.scene, map.wireframeGeometry)

  // these views draw the flat preview of the level, not its textures: the plain grey reads on it, the complement would be
  // the half of a mid grey and disappear
  wireframe.setMode(false)
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

  if (rooms !== undefined) {
    view?.scene.remove(rooms.mesh)
    rooms.dispose()
    rooms = undefined
  }

  wireframe?.dispose()
  wireframe = undefined
  selectionOverlay?.dispose()
  selectionOverlay = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined
  stopWatchingEdit?.()
  stopWatchingEdit = undefined
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
    host.value.addEventListener('wheel', pointer.onWheel, { passive: false })
  }

  // the click of a fixed view is the navigation of the walkable one (TODO 85)
  target.addEventListener('pointerdown', pointer.onPointerDown)
  target.addEventListener('pointermove', pointer.onPointerMove)
  target.addEventListener('pointerup', pointer.onPointerUp)
  target.addEventListener('pointercancel', pointer.onPointerUp)

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
      // in the middle of the canvas. The framed view does not move with the camera: there only the marker is
      // updated, which keeps the picture still
      if (zoom.value > 1) {
        frameView()

        return
      }

      updateMarker(view)
    },
  )
})

// the wireframe is a switch of every view at once: the same ref is read by the walkable view too
stopWatchingWireframe = watch(isWireframeVisible, (visible) => {
  wireframe?.setVisible(visible)
  requestRender()
})

// an edit changes the polygons, but not the objects this view holds: the level refills its geometry in place,
// so the mesh and the wireframe of the scene already draw the new faces. What an edit does need is a frame:
// the views draw on demand, so without this the canvas would keep the picture of the level before the edit.
stopWatchingEdit = watch(levelRevision, () => {
  repaintRooms()
  requestRender()
})

// the mesh is a switch of every view as well: off, the map keeps the wireframe and the marker only
stopWatchingMesh = watch(isMeshVisible, () => {
  setMeshVisible(isMeshVisible.value)
  requestRender()
})

stopWatchingRooms = watch(isRoomColorsVisible, () => {
  setMeshVisible(isMeshVisible.value)
  requestRender()
})

// the areas panel picks a room: the small views dim the others like the walkable one
stopWatchingRoom = watch(selectedRoom, (room) => {
  rooms?.setHighlight(room)
  requestRender()
})

// the colours are keyed with the id of the level, and the id of a zip arrives after the level
stopWatchingMapId = watch(currentMapId, () => {
  const map = levelStore.map.value

  if (map !== undefined && rooms !== undefined) {
    rooms.repaint(map, currentMapId.value)
  }

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
  stopWatchingRooms?.()
  stopWatchingRooms = undefined
  stopWatchingMapId?.()
  stopWatchingMapId = undefined
  stopWatchingRoom?.()
  stopWatchingRoom = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined

  if (host.value !== null) {
    host.value.removeEventListener('wheel', pointer.onWheel)
  }

  const stage = canvas.value

  if (stage !== null) {
    stage.removeEventListener('pointerdown', pointer.onPointerDown)
    stage.removeEventListener('pointermove', pointer.onPointerMove)
    stage.removeEventListener('pointerup', pointer.onPointerUp)
    stage.removeEventListener('pointercancel', pointer.onPointerUp)
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
    <div class="direction">{{ mode }}</div>
    <div class="tools">
      <span class="zoom">{{ zoomLabel }}</span>
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

  // the tools of the view, in the corner: the zoom, right aligned
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
