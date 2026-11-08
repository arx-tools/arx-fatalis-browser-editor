<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { PerspectiveCamera, type Mesh } from 'three'
import Crosshair from '../../Crosshair.vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { getModifierOfKey } from '../../../modules/keyboard/functions.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { selectedRoom } from '../../../modules/rooms/roomStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { renderPerformanceStore } from '../shared/renderPerformance.ts'
import { isMeshVisible, isRoomColorsVisible, isWireframeVisible } from '../shared/levelDisplay.ts'
import { addPreviewLights, attachWireframe, viewMeshesOf, type LevelWireframe } from '../shared/levelScene.ts'
import { createRoomOverlay, type RoomOverlay } from '../shared/roomOverlay.ts'
import {
  FIELD_OF_VIEW,
  createViewScene,
  disposeViewScene,
  resizeViewScene,
  type ViewScene,
} from '../shared/viewScene.ts'
import { CameraControls } from './cameraControls.ts'
import { createFrameLoop } from './frameLoop.ts'
import { useSelectionDrag } from './useSelectionDrag.ts'
import { createOrientationGizmo, type OrientationGizmo } from './orientationGizmo.ts'
import { createPolygonSelectionOverlay, type PolygonSelectionOverlay } from './polygonSelection.ts'

/**
 * What the widget shows over the canvas: a failure, or nothing while the level is on.
 *
 * The level itself is loaded by {@link levelStore}, so a rebuilt widget shows it at once. The wait of a load is not
 * shown here: the app puts a cover over the editor for it, with the words in white (`LoadingOverlay`).
 */
const status = computed(() => {
  if (levelStore.status.value === 'error') {
    return levelStore.error.value ?? 'Failed to load the level.'
  }

  // the wait of a load is the cover of the app (`LoadingOverlay`), with the words over it: the widget stays clean
  return ''
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

let view: ViewScene<PerspectiveCamera> | undefined
let gizmo: OrientationGizmo | undefined
let shown: Mesh[] = []
let wireframe: LevelWireframe | undefined
let rooms: RoomOverlay | undefined
let selection: PolygonSelectionOverlay | undefined

let loadedMap: ArxMap | undefined

let stopWatchingSelection: (() => void) | undefined
let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let stopWatching: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingRooms: (() => void) | undefined
let stopWatchingMapId: (() => void) | undefined
let stopWatchingRoom: (() => void) | undefined
let stopWatchingEdit: (() => void) | undefined

/**
 * The input of the view: the pick of the crosshair, the sweep of the selection and the double click.
 *
 * @remarks
 * The gesture has its own module (`useSelectionDrag.ts`): this is where the widget binds the scene, the level, the
 * overlay and the camera controls to it.
 */
const dragSelection = useSelectionDrag({
  view: () => {
    return view
  },
  map: () => {
    return loadedMap
  },
  meshes: () => {
    return shown
  },
  overlay: () => {
    return selection
  },
  controls: () => {
    return controls
  },
})

/**
 * The frame loop of the view: when it draws, and how often it picks.
 *
 * @remarks
 * The loop has its own module (`frameLoop.ts`): this is where the widget binds the scene, the camera controls and the
 * picking to it.
 */
const loop = createFrameLoop({
  view: () => {
    return view
  },
  controls: () => {
    return controls
  },
  pick: () => {
    dragSelection.pickUnderCrosshair()
  },
  updateDrag: dragSelection.updateDrag,
  gizmo: () => {
    return gizmo
  },
})

/**
 * Recolours the outline of the face under the crosshair when a modifier key goes down or up.
 *
 * @param event The key event of the window.
 */
function onModifierKey(event: KeyboardEvent): void {
  if (getModifierOfKey(event.code) === undefined) {
    return
  }

  loop.holdPick()
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
  loop.requestRender()
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

  view = createViewScene(target, new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 10_000))

  // the readout of the render performance asks this renderer, and the widget can not reach it another way
  renderPerformanceStore.setRenderer(view.renderer)

  // the walkable view shows the level with the preview lights for now (the lighting round replaces them)
  addPreviewLights(view.scene)

  gizmo = createOrientationGizmo(gizmoTarget, view.camera)
  resize()
}

/**
 * Shows the level with the textures or as the room map, or hides both.
 *
 * @remarks
 * The two faces of the level are exclusive: the textured mesh is what the game draws, and the room map is the flat
 * colour of the areas, so only one of them is on at a time. The mesh switch of the key help turns off both.
 */
function updateVisibility(): void {
  const visible = isMeshVisible.value
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
 * so the map is coloured again when its vertex count no longer matches the geometry. A texture or a uv edit does not
 * change the vertex buffers, so the map is not read again for it.
 */
function repaintRooms(): void {
  const map = loadedMap

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

  // the room map shares the geometry of the level: it is one more mesh over the same buffers
  rooms = createRoomOverlay(map, currentMapId.value)
  rooms.setHighlight(selectedRoom.value)
  view.scene.add(rooms.mesh)

  // the wireframe is a switch: the view puts it over the mesh only while it is on
  wireframe = attachWireframe(view.scene, map.wireframeGeometry)
  wireframe.setVisible(isWireframeVisible.value)

  // the switches read the wireframe too (its lines follow the mesh), so they come after it is there: a fresh load
  // with the mesh on then starts in the inverted look, not in the grey of a hidden level
  updateVisibility()

  loadedMap = map
  loop.resetPick()
  selection = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition))
  dragSelection.updateHighlight()
  loop.requestRender()

  // a level change builds a new camera: the old one has to let the pointer and the listeners go
  controls?.dispose()

  const created = new CameraControls({
    canvas: target,
    camera: view.camera,
    scene: map.scenePosition,
    player: map.player,
    onPoseChange: (pose): void => {
      cameraStore.setPose(pose)
      loop.requestRender()
    },
    onLockChange: (locked: boolean): void => {
      if (locked) {
        loop.startLoop()

        return
      }

      loop.requestRender()
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

  loop.requestRender()
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

  if (rooms !== undefined) {
    view?.scene.remove(rooms.mesh)
    rooms.dispose()
    rooms = undefined
  }

  wireframe?.dispose()
  wireframe = undefined
  selection?.dispose()
  selection = undefined
  loadedMap = undefined

  // the crosshair store is not cleared here: the dock is rebuilt when the stored layout arrives, and the old
  // view unmounts after the new one has already picked a face — a write of `undefined` here would hide that
  // face from the inspector. The widgets read the store together with the level, so an index the level no
  // longer has reads as nothing anyway, and the next frame of the live view reports the face it is on.
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

  // the wireframe is a switch of every view at once: the same ref is read by the six fixed ones
  stopWatchingWireframe = watch(isWireframeVisible, (visible) => {
    wireframe?.setVisible(visible)
    loop.requestRender()
  })

  // an edit changes the polygons, but not the objects this view holds: the level refills its geometry in
  // place, so the mesh and the wireframe of the scene already draw the new faces. What an edit does need is a
  // frame: the view draws on demand, so without this the canvas would keep the picture of the level before
  // the edit (a walk away and back would refresh it, which is exactly what a still picture can not do)
  stopWatchingEdit = watch(levelRevision, () => {
    repaintRooms()
    loop.requestRender()
  })

  // the mesh is a switch too: off, the level keeps the wireframe and the overlays only
  stopWatchingMesh = watch(isMeshVisible, () => {
    updateVisibility()
    loop.requestRender()
  })

  stopWatchingRooms = watch(isRoomColorsVisible, () => {
    updateVisibility()
    loop.requestRender()
  })

  // the colours are keyed with the id of the level, and the id of a zip arrives after the level: the map is coloured
  // again when it lands, so two visits of the same level always show the same colours
  // the areas panel picks a room: the map dims the others, so the picked area reads at a glance
  stopWatchingRoom = watch(selectedRoom, (room) => {
    rooms?.setHighlight(room)
    loop.requestRender()
  })

  stopWatchingMapId = watch(currentMapId, () => {
    if (rooms !== undefined && loadedMap !== undefined) {
      rooms.repaint(loadedMap, currentMapId.value)
    }

    loop.requestRender()
  })

  // the selection is shared with the statistics widget: a change draws the fill of the polygons
  stopWatchingSelection = watch(selectionStore.polygons, () => {
    dragSelection.updateHighlight()
    loop.requestRender()
  })

  globalThis.addEventListener('keydown', onModifierKey)
  globalThis.addEventListener('keyup', onModifierKey)
  document.addEventListener('mousedown', dragSelection.onMouseDown)
  document.addEventListener('mouseup', dragSelection.onMouseUp)
  document.addEventListener('dblclick', dragSelection.onDoubleClick)
})

// the level is not the widget's: it may have been loaded before this widget was even mounted, and it
// stays loaded when the widget goes away (a layout reset rebuilds the dock, not the map)
onBeforeUnmount(() => {
  stopWatching?.()
  stopWatching = undefined
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
  stopWatchingEdit?.()
  stopWatchingEdit = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined

  globalThis.removeEventListener('keydown', onModifierKey)
  globalThis.removeEventListener('keyup', onModifierKey)
  document.removeEventListener('mousedown', dragSelection.onMouseDown)
  document.removeEventListener('mouseup', dragSelection.onMouseUp)
  document.removeEventListener('dblclick', dragSelection.onDoubleClick)

  selection?.dispose()
  selection = undefined

  observer?.disconnect()
  observer = undefined
  cameraStore.setDriver(undefined)
  controls?.dispose()
  controls = undefined

  loop.stop()

  gizmo?.dispose()
  gizmo = undefined

  if (view !== undefined) {
    // a rebuilt dock puts a new view in place before this one goes: the readout keeps the newer renderer
    if (renderPerformanceStore.renderer.value === view.renderer) {
      renderPerformanceStore.setRenderer(undefined)
    }

    disposeViewScene(view)
    view = undefined
  }
})
</script>

<template>
  <div ref="host" class="View3DWidget">
    <canvas ref="canvas" class="stage"></canvas>
    <!-- the crosshair marks the middle of the level: while the level loads, the status text is there -->
    <Crosshair v-if="status === ''" />
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
