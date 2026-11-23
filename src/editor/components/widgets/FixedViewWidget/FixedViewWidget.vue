<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { OrthographicCamera, Vector2, type Mesh, type Vector3 } from 'three'
import type { ArxLight, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { roomRevision } from '../../../modules/rooms/roomRevision.ts'
import { portalRevision } from '../../../modules/rooms/portalSync.ts'
import { isDynamicLightsVisible, isStaticLightsVisible } from '../../../modules/level/edit/dynamicLights.ts'
import { lightingProfile } from '../../../modules/level/edit/lightingProfile.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { centerOfBounds, type CameraBounds } from '../shared/cameraBounds.ts'
import { gamePositionToWorld } from '../camera/cameraPose.ts'
import {
  addPreviewLights,
  attachWireframe,
  gameBoundsOf,
  previewMaterial,
  viewMeshesOf,
  type LevelWireframe,
} from '../shared/levelScene.ts'
import {
  isLightsVisible,
  isMeshVisible,
  isPortalsVisible,
  isRoomColorsVisible,
  isWireframeVisible,
} from '../shared/levelDisplay.ts'
import { attachPortalLines, type PortalOverlay } from '../shared/portalOverlay.ts'
import { activeFaceGroups } from '../../../modules/groups/groupStore.ts'
import { inGroupOf, selectedGroupPolygons } from '../../../modules/groups/groupSelection.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { hoverRoom, litRooms } from '../../../modules/rooms/roomStore.ts'
import { pickRoom } from '../../../modules/rooms/roomSelection.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { DISABLED_MARKER_GRAY, DISABLED_MARKER_OPACITY, isLightDisabled, isLightMuted } from '../shared/lightMarkers.ts'
import {
  createPolygonSelectionOverlay,
  pickPolygonAt,
  type PolygonSelectionOverlay,
} from '../View3DWidget/polygonSelection.ts'
import { createRoomOverlay, roomsNeedRepaint, type RoomOverlay } from '../shared/roomOverlay.ts'
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
const lightsCanvas = useTemplateRef<HTMLCanvasElement>('lights')

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
 * along its own line, toward the marker of the walkable camera, so the place we stand stays in the middle
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
let portalLines: PortalOverlay | undefined

/**
 * The revision of the rooms the colors of the room map were written from.
 *
 * @remarks
 * A move of the faces into another room does not change the geometry, so the revision of the rooms is what tells the
 * view that the colors of the map are stale (2026-11-15).
 */
let paintedRoomRevision = roomRevision.value
let wireframe: LevelWireframe | undefined
let player: ArxVector3 | undefined
let bounds: CameraBounds | undefined
let scenePosition: ArxVector3 | undefined
let observer: ResizeObserver | undefined
let frame = 0

/**
 * How long a requested frame may stay undone before the view asks for it again, in milliseconds.
 *
 * @remarks
 * The browser owes a callback for every `requestAnimationFrame`, and a native dialog (the data dir picker) or a frozen
 * tab can lose one. A view that only draws on a change would keep the picture of its load for good: the watchdog is the
 * way back, and it is short enough that nobody notices it.
 */
const FRAME_WATCHDOG_IN_MS = 250

/**
 * The timer of the watchdog of the requested frame, when one is waiting.
 */
let watchdog: ReturnType<typeof setTimeout> | undefined
let stopWatching: (() => void) | undefined
let stopWatchingCamera: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingEdit: (() => void) | undefined
let stopWatchingRoomRevision: (() => void) | undefined
let stopWatchingPortals: (() => void) | undefined
let stopWatchingPortalRevision: (() => void) | undefined
let stopWatchingRooms: (() => void) | undefined
let stopWatchingRoom: (() => void) | undefined
let stopWatchingSelection: (() => void) | undefined
let stopWatchingGroups: (() => void) | undefined
let stopWatchingLights: (() => void) | undefined

/**
 * The lights of the level: their place in the space of the meshes, and the light itself.
 *
 * @remarks
 * The fixed views draw a **fixed yellow dot** for every light (2026-11-19, the owner: the colored shapes of the walkable
 * view read as a smudge on a plan, and the dots are what the views had before). The dots are a 2D overlay over the
 * canvas, and not sprites of the scene. A light whose layer is switched off is left out: the small views show the level,
 * and a disabled light draws nothing.
 */
let lightMarks: Array<{ position: Vector3; light: ArxLight }> = []

/**
 * The color of the dot of a light, in the fixed views.
 *
 * @remarks
 * One color for every light: the plan of the level says where the lights are, and the shape and the color of a light
 * are the business of the walkable view and of the Light Inspector (2026-11-19, the owner).
 */
const LIGHT_DOT_COLOR = '#ffd54a'

/**
 * The radius of a dot of a light, in pixels.
 */
const LIGHT_DOT_RADIUS = 1.5

/**
 * Draws the dots of the lights over the canvas, or clears them while the switch is off.
 *
 * @remarks
 * A dot is a small **circle**: the square of the first round read as a pixel of the map at some zooms (2026-11-19, the
 * owner). A light of a switched off layer is gray, so it stays findable without claiming it lights the level.
 *
 * @param target The view whose camera projects the lights.
 */
function drawLights(target: ViewScene<OrthographicCamera>): void {
  const overlay = lightsCanvas.value

  if (overlay === null) {
    return
  }

  const stage = target.renderer.domElement
  const width = stage.clientWidth
  const height = stage.clientHeight

  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width
    overlay.height = height
  }

  const context = overlay.getContext('2d')

  if (context === null) {
    return
  }

  context.clearRect(0, 0, overlay.width, overlay.height)

  if (!isLightsVisible.value) {
    return
  }

  const halfWidth = width / 2
  const halfHeight = height / 2

  for (const mark of lightMarks) {
    const point = mark.position.clone().project(target.camera)

    if (Math.abs(point.z) > 1) {
      continue
    }

    const x = Math.round((point.x + 1) * halfWidth)
    const y = Math.round((1 - point.y) * halfHeight)

    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue
    }

    // a light the switches took out stays on the plan, gray: the author has to find it too (2026-11-19, the owner)
    let color = LIGHT_DOT_COLOR
    let alpha = 1

    if (isLightDisabled(mark.light)) {
      color = DISABLED_MARKER_GRAY
    }

    // a static light of a profile with a light of its own is not lit there: its dot stays, half transparent, so the
    // author finds it and can turn it into a semi-dynamic one (2026-11-23, the owner)
    if (isLightMuted(mark.light)) {
      color = DISABLED_MARKER_GRAY
      alpha = DISABLED_MARKER_OPACITY
    }

    context.globalAlpha = alpha
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, LIGHT_DOT_RADIUS, 0, Math.PI * 2)
    context.fill()
  }

  context.globalAlpha = 1
}

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
 *
 * The frame that is already asked for is **canceled and asked again**, and a frame is not skipped because one is
 * pending: a browser may drop the callback it owes (a frozen tab, and a native dialog like the data dir picker of the
 * editor), and the id would stay set forever — the view would draw the state it had at the load and never follow a
 * switch again (2026-11-19, the owner: the dots of a view kept the state of the load).
 *
 * A request also sets a **watchdog**: a callback that never comes would leave the last state on the canvas, and a view
 * that waits for the next change would wait forever. The watchdog asks for a frame again, and it goes away when the
 * frame is drawn.
 */
function requestRender(): void {
  if (frame !== 0) {
    cancelAnimationFrame(frame)
  }

  if (watchdog !== undefined) {
    clearTimeout(watchdog)
  }

  watchdog = setTimeout(() => {
    watchdog = undefined
    frame = 0

    // the widget may be gone by the time a dropped frame is noticed: a view without a scene asks for nothing
    if (view !== undefined) {
      requestRender()
    }
  }, FRAME_WATCHDOG_IN_MS)

  frame = requestAnimationFrame(() => {
    frame = 0

    if (watchdog !== undefined) {
      clearTimeout(watchdog)
      watchdog = undefined
    }

    if (view !== undefined) {
      const target = view

      target.renderer.render(target.scene, target.camera)
      drawLights(target)
    }
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
 * The framed (`1×`) view covers the whole level, so it is anchored to the **center of the level**: it never
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

  return gamePositionToWorld(centerOfBounds(bounds), scenePosition)
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
 * The pointer of the view: the jump and the drag of the walkable camera, the wheel of the zoom, and the Shift gestures
 * of the room map.
 *
 * @remarks
 * The gesture has its own module (`useFixedViewPointer.ts`): this is where the widget binds the scene, the level, the
 * zoom, the framing and the room of the face under the pointer to it.
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
  roomAt: (pixel) => {
    const target = view
    const map = levelStore.map.value

    if (target === undefined || map === undefined) {
      return undefined
    }

    // the middle of the canvas is (0, 0) and the top left corner is (-1, 1), the space the raycaster reads
    const widthShare = pixel.x / pixel.width
    const heightShare = pixel.y / pixel.height
    const doubledWidth = widthShare * 2
    const doubledHeight = heightShare * 2
    const point = new Vector2(doubledWidth - 1, 1 - doubledHeight)
    const index = pickPolygonAt(target.camera, point, shown, map.triangleToPolygon)

    if (index === undefined) {
      return undefined
    }

    const room = map.polygons[index]?.room

    if (room === undefined || room < 0) {
      return undefined
    }

    return room
  },
  hoverRoom,
  selectRoom: (room, mode) => {
    // the same gestures the room list makes: Shift adds the room to the selection and Ctrl/Meta takes it away
    pickRoom(room, mode)
  },
  isRoomMapVisible: () => {
    return isRoomColorsVisible.value
  },
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

  // the portal outline is drawn over the surfaces, so it goes with the mesh like the room map does
  portalLines?.setVisible(visible && isPortalsVisible.value)
}

/**
 * Recolors the room map after an edit.
 *
 * @remarks
 * An edit refills the geometry of the level in place: the color attribute of the room map is not refilled with it,
 * so the map is colored again when its vertex count no longer matches the geometry — or when the rooms of the faces
 * were written (a move into another room leaves the buffers as they were).
 */
function repaintRooms(): void {
  const map = levelStore.map.value

  if (map === undefined || rooms === undefined) {
    return
  }

  const vertexCount = map.solidMeshes[0].geometry.getAttribute('position').count
  const colorCount = rooms.mesh.geometry.getAttribute('color')?.count

  if (
    roomsNeedRepaint({
      vertexCount,
      colorCount,
      paintedRevision: paintedRoomRevision,
      revision: roomRevision.value,
    })
  ) {
    paintedRoomRevision = roomRevision.value
    rooms.repaint(map)
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
  // (the walls of the game, the holes of a color key) are cut by the alpha test of the walkable view, not here — the
  // map is a silhouette, and the few faces of a stairwell do not change it
  shown = viewMeshesOf(map.solidMeshes, previewMaterial())

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // the room map shares the geometry of the level, so the small views show the same rooms
  rooms = createRoomOverlay(map)
  paintedRoomRevision = roomRevision.value

  // the map paints the lit rooms only while it is on: the switch of the map applies the set when it comes on
  if (isRoomColorsVisible.value) {
    rooms.setHighlight(litRooms.value)
  }

  view.scene.add(rooms.mesh)
  setMeshVisible(isMeshVisible.value)

  // the small views draw the same wireframe as the walkable one, from the same geometry
  wireframe = attachWireframe(view.scene, map.wireframeGeometry)
  wireframe.setVisible(isWireframeVisible.value)

  // the portal outline, in the space of the same meshes
  portalLines = attachPortalLines(view.scene, map.fts.portals, arxVector3toVector3(map.scenePosition))
  portalLines.setVisible(isMeshVisible.value && isPortalsVisible.value)

  // the lights of the LLF: the fixed views draw a dot for every light, in the overlay above the canvas
  lightMarks = map.lights.map((light) => {
    return { position: arxVector3toVector3(light.position), light }
  })

  // the fill of the selection, in the space of the same meshes
  selectionOverlay = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition))
  selectionOverlay.setHighlight(selectedPolygonsOf(map), undefined, inGroupOf(selectedGroupPolygons.value))

  stopWatchingSelection = watch(selectionStore.polygons, () => {
    selectionOverlay?.setHighlight(selectedPolygonsOf(map), undefined, inGroupOf(selectedGroupPolygons.value))
    requestRender()
  })

  // a group colors the fill without touching the selection: making or taking apart a group repaints the view too
  stopWatchingGroups = watch(activeFaceGroups, () => {
    selectionOverlay?.setHighlight(selectedPolygonsOf(map), undefined, inGroupOf(selectedGroupPolygons.value))
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
  portalLines?.dispose()
  portalLines = undefined
  selectionOverlay?.dispose()
  selectionOverlay = undefined
  // the watches of the selection, the groups, the switches and the edits are the widget's, and not the map's: they are
  // registered once, in the mount, and their callbacks read the map on every change. Stopping them here left the view
  // following the level it drew first, and the second level of a session (the picker of the data dir, a reload of the
  // same map) took the switches with it (2026-11-20, the owner: the dots of a fixed view kept the state of the load)
  lightMarks = []
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

  // the click of a fixed view is the navigation of the walkable one (TODO 85), and a Shift pointer belongs to the room
  // map: the press selects a room and the hover lights one
  target.addEventListener('pointerenter', pointer.onPointerEnter)
  target.addEventListener('pointerdown', pointer.onPointerDown)
  target.addEventListener('pointermove', pointer.onPointerMove)
  target.addEventListener('pointerup', pointer.onPointerUp)
  target.addEventListener('pointercancel', pointer.onPointerUp)
  target.addEventListener('pointerleave', pointer.onPointerLeave)
  pointer.start()

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

  const current = levelStore.map.value

  if (current !== undefined) {
    selectionOverlay?.setHighlight(selectedPolygonsOf(current), undefined, inGroupOf(selectedGroupPolygons.value))
  }

  requestRender()
})

// a replay of the stored steps writes the rooms without a level revision (only the room revision moves): the room map
// has to be painted again for it, or a map that came back from the storage stays in the color of the empty rooms
stopWatchingRoomRevision = watch(roomRevision, () => {
  repaintRooms()
  requestRender()
})

// the mesh is a switch of every view as well: off, the map keeps the wireframe and the marker only
stopWatchingMesh = watch(isMeshVisible, () => {
  setMeshVisible(isMeshVisible.value)
  requestRender()
})

// the portal outline is a switch of every view at once
stopWatchingLights = watch([isLightsVisible, isStaticLightsVisible, isDynamicLightsVisible, lightingProfile], () => {
  requestRender()
})

stopWatchingPortals = watch(isPortalsVisible, () => {
  setMeshVisible(isMeshVisible.value)
  requestRender()
})

// the portals of a flat level come from its rooms: a room edit rebuilds them, and the outline follows without a new
// level
stopWatchingPortalRevision = watch(portalRevision, () => {
  const map = levelStore.map.value

  if (map !== undefined) {
    portalLines?.setPortals(map.fts.portals, arxVector3toVector3(map.scenePosition))
  }

  setMeshVisible(isMeshVisible.value)
  requestRender()
})

stopWatchingRooms = watch(isRoomColorsVisible, () => {
  setMeshVisible(isMeshVisible.value)

  // the highlight is painted only while the map is on, and the lit set may have changed while it was off
  if (isRoomColorsVisible.value) {
    rooms?.setHighlight(litRooms.value)
    // a pointer that stood still while the map was off has a hover to show now
    pointer.refreshHover()
  } else {
    // the Shift hover belongs to the map: a highlight left over would light a room when the map comes back
    hoverRoom(undefined)
  }

  requestRender()
})

// the room inspector picks a room: the small views dim the others like the walkable one
stopWatchingRoom = watch(litRooms, (picked) => {
  if (!isRoomColorsVisible.value) {
    return
  }

  rooms?.setHighlight(picked)
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
  stopWatchingPortals?.()
  stopWatchingPortals = undefined
  stopWatchingPortalRevision?.()
  stopWatchingPortalRevision = undefined
  stopWatchingRooms?.()
  stopWatchingRooms = undefined
  stopWatchingRoom?.()
  stopWatchingRoom = undefined
  stopWatchingSelection?.()
  stopWatchingSelection = undefined
  stopWatchingGroups?.()
  stopWatchingGroups = undefined
  stopWatchingLights?.()
  stopWatchingLights = undefined
  stopWatchingEdit?.()
  stopWatchingEdit = undefined
  stopWatchingRoomRevision?.()
  stopWatchingRoomRevision = undefined

  if (host.value !== null) {
    host.value.removeEventListener('wheel', pointer.onWheel)
  }

  const stage = canvas.value

  if (stage !== null) {
    stage.removeEventListener('pointerenter', pointer.onPointerEnter)
    stage.removeEventListener('pointerdown', pointer.onPointerDown)
    stage.removeEventListener('pointermove', pointer.onPointerMove)
    stage.removeEventListener('pointerup', pointer.onPointerUp)
    stage.removeEventListener('pointercancel', pointer.onPointerUp)
    stage.removeEventListener('pointerleave', pointer.onPointerLeave)
  }

  pointer.stop()

  // a view that goes away can not take its hover with it: the highlight would stay on the map
  hoverRoom(undefined)

  observer?.disconnect()
  observer = undefined

  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }

  if (watchdog !== undefined) {
    clearTimeout(watchdog)
    watchdog = undefined
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
    <canvas ref="lights" class="lights" aria-hidden="true"></canvas>
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
  // the dots of the lights: a 2D overlay over the scene, so a dot is 3 by 3 pixels at every zoom of the view
  .lights {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

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
