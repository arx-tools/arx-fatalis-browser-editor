<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { PerspectiveCamera, type Mesh } from 'three'
import Crosshair from '../../Crosshair.vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { sameTextureAreaOf, usedVerticesOf } from '../../../../generator/polygons.ts'
import { levelRevision } from '../../../modules/level/editing.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { isKeyDown } from '../../../modules/keyboard/keyboard.ts'
import { selectionModeOf, selectionStore, type SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { cameraStore } from '../cameraStore.ts'
import { isMeshVisible, isWireframeVisible } from '../levelDisplay.ts'
import { addPreviewLights, attachWireframe, viewMeshesOf, type LevelWireframe } from '../levelScene.ts'
import { FIELD_OF_VIEW, createViewScene, disposeViewScene, resizeViewScene, type ViewScene } from '../viewScene.ts'
import { CameraControls } from './cameraControls.ts'
import { createOrientationGizmo, type OrientationGizmo } from './orientationGizmo.ts'
import {
  createPolygonSelectionOverlay,
  faceToSweep,
  pickPolygon,
  pickPolygons,
  type PolygonSelectionOverlay,
  type SweepResult,
} from './polygonSelection.ts'

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

let view: ViewScene<PerspectiveCamera> | undefined
let gizmo: OrientationGizmo | undefined
let shown: Mesh[] = []
let wireframe: LevelWireframe | undefined
let selection: PolygonSelectionOverlay | undefined

/**
 * How many faces a drag reads from the ray: enough to find the one that touches the selection under a face
 * that does not.
 */
const CONNECT_CANDIDATES = 24

/**
 * What a running drag does with the faces it sweeps over.
 *
 * @remarks
 * A press starts it, a release ends it, and every frame in between looks at the face under the crosshair --
 * the pointer is locked, so the drag is the camera turning, not a rectangle on the screen. The mode is fixed
 * at the press: the modifiers of that moment decide it, the way a click does.
 */
let dragMode: SelectionMode | undefined

/**
 * The vertices of the faces the drag has taken into the selection: the connection test of the next face.
 *
 * @remarks
 * A face only joins when one of its vertices is close to one of these. Without that rule a drag would paint
 * every face it sweeps over, however far from the start it lies (the archived editor's `isConnectedToSelection`).
 */
let dragVertices: ArxVector3[] = []
let loadedMap: ArxMap | undefined

let stopWatchingSelection: (() => void) | undefined
let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let frame = 0
let lastFrameAt = 0
let stopWatching: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingEdit: (() => void) | undefined

/**
 * Reads the mode of the click from the modifiers that are held down.
 *
 * @remarks
 * The keys are tracked by the keyboard module, not by the mouse events: under a pointer lock the browser
 * does not send a move for every key change, and the outline has to colour itself as the modifier changes.
 *
 * @returns The mode the next click would have.
 */
function selectionModeOfKeys(): SelectionMode {
  if (isKeyDown('ControlLeft') || isKeyDown('ControlRight') || isKeyDown('MetaLeft') || isKeyDown('MetaRight')) {
    return 'remove'
  }

  if (isKeyDown('ShiftLeft') || isKeyDown('ShiftRight')) {
    return 'add'
  }

  return 'replace'
}

/**
 * Reads the face a running drag should take.
 *
 * @returns What the walk over the faces of the ray found, or `undefined` when nothing decides the gesture.
 */
function pickConnectedPolygon(): SweepResult | undefined {
  if (view === undefined || loadedMap === undefined || dragMode === undefined) {
    return undefined
  }

  const candidates = pickPolygons(view.camera, shown, loadedMap.triangleToPolygon, CONNECT_CANDIDATES)

  return faceToSweep({
    candidates,
    polygons: loadedMap.polygons,
    selected: selectionStore.polygons.value,
    vertices: dragVertices,
    mode: dragMode,
  })
}

/**
 * Selects the face under the crosshair for the running gesture.
 *
 * @remarks
 * A `replace` gesture already dropped the old selection at the press, so every mode is an add here. A face
 * joins only when it touches the ones this drag has selected so far, so a fast drag does not jump over the
 * gaps of the mesh and a face from the other side of the level does not come along. `Ctrl` takes faces away,
 * and there the connection does not matter.
 *
 * A face the selection already holds takes nothing: the walk stops on it, because it hides what is behind it.
 * The drag does not stop with it — its vertices go into `dragVertices`, so the next face on the other side
 * joins the way it would when a pencil crosses an earlier line on a squared paper.
 */
function selectUnderCrosshair(): void {
  if (view === undefined || loadedMap === undefined || dragMode === undefined) {
    return
  }

  const sweep = pickConnectedPolygon()

  if (sweep === undefined) {
    return
  }

  const polygon = loadedMap.polygons[sweep.index]

  if (polygon === undefined) {
    return
  }

  // the pencil ran into a face the gesture already holds: nothing changes, but the drawing goes on from here
  if (dragMode !== 'remove' && sweep.kind === 'cross') {
    dragVertices = [...dragVertices, ...usedVerticesOf(polygon)]

    return
  }

  if (dragMode === 'remove') {
    if (selectionStore.polygons.value.has(sweep.index)) {
      selectionStore.remove(sweep.index)
    }

    return
  }

  selectionStore.add(sweep.index)
  dragVertices = [...dragVertices, ...usedVerticesOf(polygon)]
}

/**
 * Starts a gesture of the locked view: the faces under the crosshair from here on are selected.
 *
 * @remarks
 * The modifiers decide what the gesture does: no modifier starts a new selection, `Shift` adds the faces and
 * `Ctrl` (or `Meta`) takes them away. The mode is read once, at the press.
 *
 * @param event The mouse event of the press.
 */
function onMouseDown(event: MouseEvent): void {
  if (controls?.isLocked !== true) {
    return
  }

  // only the left button selects: the right one is left alone, and the middle one is not a pick either
  if (event.button !== 0) {
    return
  }

  if (view === undefined || loadedMap === undefined) {
    return
  }

  dragMode = selectionModeOf(event)
  dragVertices = []

  if (dragMode === 'replace') {
    selectionStore.clear()
  }

  selectUnderCrosshair()
}

/**
 * Ends the gesture: the next press starts a new one.
 *
 * @param event The mouse event of the release.
 */
function onMouseUp(event: MouseEvent): void {
  if (event.button !== 0) {
    return
  }

  dragMode = undefined
  dragVertices = []
}

/**
 * Takes the whole welded area of the texture under the crosshair: the double click of the walkable view.
 *
 * @param event The mouse event of the double click.
 */
function onDoubleClick(event: MouseEvent): void {
  if (view === undefined || loadedMap === undefined || controls?.isLocked !== true) {
    return
  }

  const index = pickPolygon(view.camera, shown, loadedMap.triangleToPolygon)

  if (index === undefined) {
    return
  }

  const area = sameTextureAreaOf(loadedMap.polygons, loadedMap.vertexToPolygons, index)

  selectionStore.selectMany(area, selectionModeOf(event))
}

function updateCursor(): void {
  if (view === undefined || loadedMap === undefined || selection === undefined) {
    return
  }

  const index = pickPolygon(view.camera, shown, loadedMap.triangleToPolygon)
  let polygon: ArxPolygon | undefined

  if (index !== undefined) {
    polygon = loadedMap.polygons[index]
  }

  selection.setCursor(polygon, dragMode ?? selectionModeOfKeys())
}

/**
 * The selected polygons of the loaded map.
 *
 * @returns The polygons, in the order of the set.
 */
function selectedPolygons(): ArxPolygon[] {
  const polygons: ArxPolygon[] = []

  if (loadedMap === undefined) {
    return polygons
  }

  for (const index of selectionStore.polygons.value) {
    const polygon = loadedMap.polygons[index]

    if (polygon !== undefined) {
      polygons.push(polygon)
    }
  }

  return polygons
}

/**
 * Shows the selection: the fill of the selected polygons.
 */
function updateHighlight(): void {
  selection?.setHighlight(selectedPolygons())
}

/**
 * Handles a click of the locked view: it selects the polygon under the crosshair.
 *
 * @remarks
 * The modifiers decide what the click does: no modifier starts a new selection, `Shift` adds the polygon,
 * `Ctrl` (or `Meta`) takes it away. A click that hits nothing still starts a new, empty selection, so a
 * plain click on the sky drops what was selected.
 *
 * @param event The mouse event of the click.
 */
/**
 * Sweeps the faces under the crosshair into the selection while the button is held: the drag of the view.
 */
function updateDrag(): void {
  if (dragMode === undefined) {
    return
  }

  // the pointer is locked, so the mouse does not move the crosshair: the camera turns under it, and the face
  // under the middle of the canvas changes with the frames. This is the drag of the archived editor.
  selectUnderCrosshair()
}

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

  // the crosshair is the centre of the canvas, so the polygon under it is read here, on every frame that
  // is drawn: a look around moves the outline with the camera
  updateCursor()
  updateDrag()

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

  view = createViewScene(target, new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 10_000))

  // the walkable view shows the level with the preview lights for now (the lighting round replaces them)
  addPreviewLights(view.scene)

  gizmo = createOrientationGizmo(gizmoTarget, view.camera)
  resize()
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
  setMeshVisible(isMeshVisible.value)

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // the wireframe is a switch: the view puts it over the mesh only while it is on
  wireframe = attachWireframe(view.scene, map.wireframeGeometry)
  wireframe.setVisible(isWireframeVisible.value)

  loadedMap = map
  selection = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition))
  updateHighlight()
  requestRender()

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
  wireframe?.dispose()
  wireframe = undefined
  selection?.dispose()
  selection = undefined
  loadedMap = undefined

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
    requestRender()
  })

  // an edit changes the polygons, but not the objects this view holds: the level refills its geometry in
  // place, so the mesh and the wireframe of the scene already draw the new faces. What an edit does need is a
  // frame: the view draws on demand, so without this the canvas would keep the picture of the level before
  // the edit (a walk away and back would refresh it, which is exactly what a still picture can not do)
  stopWatchingEdit = watch(levelRevision, () => {
    requestRender()
  })

  // the mesh is a switch too: off, the level keeps the wireframe and the overlays only
  stopWatchingMesh = watch(isMeshVisible, (visible) => {
    setMeshVisible(visible)
    requestRender()
  })

  // the selection is shared with the statistics widget: a change draws the fill of the polygons
  stopWatchingSelection = watch(selectionStore.polygons, () => {
    updateHighlight()
    requestRender()
  })

  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('dblclick', onDoubleClick)
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
  stopWatchingEdit?.()
  stopWatchingEdit = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined

  document.removeEventListener('mousedown', onMouseDown)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('dblclick', onDoubleClick)

  selection?.dispose()
  selection = undefined

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
