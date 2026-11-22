<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { Magnet } from 'lucide-vue-next'
import { PerspectiveCamera, type Group, type Mesh } from 'three'
import Crosshair from '../../Crosshair.vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { WIREFRAME_WITHOUT_MESH, arxVector3toVector3 } from '../../../../generator/meshes.ts'
import {
  isDynamicLightsVisible,
  isStaticLightsVisible,
  registerDynamicLightsView,
} from '../../../modules/level/edit/dynamicLights.ts'
import { lightingProfile } from '../../../modules/level/edit/lightingProfile.ts'
import { activeFaceGroups } from '../../../modules/groups/groupStore.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { getModifierOfKey } from '../../../modules/keyboard/functions.ts'
import { lightHoverStore } from '../../../modules/selection/lightHoverStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { roomNameOf } from '../../../modules/rooms/roomNames.ts'
import { litRooms } from '../../../modules/rooms/roomStore.ts'
import { currentRoom } from '../../../modules/rooms/roomUnderCrosshair.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { renderPerformanceStore } from '../shared/renderPerformance.ts'
import { transformVisible } from '../shared/editModes.ts'
import {
  isLightsVisible,
  isMeshVisible,
  isPortalsVisible,
  isRoomColorsVisible,
  isWireframeVisible,
} from '../shared/levelDisplay.ts'
import { snapEnabled, snapModifierHeld } from '../shared/snapping.ts'
import { addPreviewLights, attachWireframe, viewMeshesOf, type LevelWireframe } from '../shared/levelScene.ts'
import { disposeSpikeEntityModel, loadSpikeEntityModel } from '../../../modules/level/entities/entitySpike.ts'
import {
  createLightMarkers,
  createLightMarkerTextures,
  disposeLightMarkers,
  updateLightMarkers,
  type LightMarkerTextures,
} from '../shared/lightMarkers.ts'
import { createLightSelectionOverlay, type LightSelectionOverlay } from '../shared/lightSelectionOverlay.ts'
import { attachPortalLines, type PortalOverlay } from '../shared/portalOverlay.ts'
import { roomPaletteOf } from '../../../../generator/rooms.ts'
import { roomRevision } from '../../../modules/rooms/roomRevision.ts'
import { portalRevision } from '../../../modules/rooms/portalSync.ts'
import { createRoomOverlay, roomsNeedRepaint, type RoomOverlay } from '../shared/roomOverlay.ts'
import {
  FIELD_OF_VIEW,
  createViewScene,
  disposeViewScene,
  resizeViewScene,
  type ViewScene,
} from '../shared/viewScene.ts'
import ToggleButton from '../../ToggleButton.vue'
import { CameraControls } from './cameraControls.ts'
import { createFrameLoop } from './frameLoop.ts'
import { useSelectionDrag } from './useSelectionDrag.ts'
import { createOrientationGizmo, type OrientationGizmo } from './orientationGizmo.ts'
import { createPolygonSelectionOverlay, type PolygonSelectionOverlay } from './polygonSelection.ts'
import { createSelectionGizmo, type SelectionGizmo } from './selectionGizmo.ts'

/**
 * Whether the snap of the translate gizmo is on now: the magnet, or Shift for the length of the drag.
 *
 * @remarks
 * The icon follows both: a Shift press lights it up **on the key event**, before the pointer moves, so the author sees
 * the key is held when the magnet itself is off.
 */
const snapActive = computed(() => {
  return snapEnabled.value || snapModifierHeld.value
})

/**
 * Flips the magnet of the translate gizmo.
 *
 * @remarks
 * The switch is a preference of the editor: it stays in the browser, and Shift turns the snap on for a drag without
 * moving it, so a single drag can snap and the next one can go free.
 */
function toggleMagnet(): void {
  snapEnabled.value = !snapEnabled.value
}

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
 * Whether a level is on the screen: a notice about a level that could not open waits over an empty view, and the
 * numbers of a camera belong to a level.
 */
const hasLevel = computed(() => {
  return levelStore.map.value !== undefined
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

  // a camera that has no level under it shows a pose of the url: the numbers of a level that is not on the screen
  if (pose === undefined || !hasLevel.value) {
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

/**
 * The room of the face under the crosshair, as the readout at the bottom of the view writes it.
 *
 * @remarks
 * It is the room the room map highlights, so the words and the colour say the same thing: the name follows the number
 * when the author gave one (the pair the room list shows). The line is empty while the room map is off, and while the
 * crosshair points at no face or at a face without a room, so the view says nothing there.
 */
const roomReadout = computed(() => {
  if (!isRoomColorsVisible.value) {
    return ''
  }

  const room = currentRoom.value

  if (room === undefined) {
    return ''
  }

  const name = roomNameOf(room)

  if (name === undefined) {
    return `room ${String(room)}`
  }

  return `room ${String(room)} · ${name}`
})

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const gizmoCanvas = useTemplateRef<HTMLCanvasElement>('gizmoCanvas')

let view: ViewScene<PerspectiveCamera> | undefined
let gizmo: OrientationGizmo | undefined
let selectionGizmo: SelectionGizmo | undefined
let shown: Mesh[] = []
let wireframe: LevelWireframe | undefined
let rooms: RoomOverlay | undefined
let lightMarkers: Group | undefined
let lightSelection: LightSelectionOverlay | undefined
let lightTextures: LightMarkerTextures | undefined
let spikeEntity: Group | undefined
let portalLines: PortalOverlay | undefined

/**
 * The revision of the rooms the colours of the room map were written from.
 *
 * @remarks
 * A move of the faces into another room does not change the geometry, so the buffers can not tell that the colours are
 * stale: the revision of the rooms does (2026-11-15, the owner: the corner moved into a new room stayed grey).
 */
let paintedRoomRevision = roomRevision.value
let selection: PolygonSelectionOverlay | undefined

let loadedMap: ArxMap | undefined

let stopWatchingSelection: (() => void) | undefined
let stopWatchingGroups: (() => void) | undefined
let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let stopWatching: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingPortals: (() => void) | undefined
let stopWatchingLights: (() => void) | undefined
let stopWatchingPortalRevision: (() => void) | undefined
let stopWatchingRooms: (() => void) | undefined
let stopWatchingRoom: (() => void) | undefined
let stopWatchingEdit: (() => void) | undefined
let stopWatchingRoomRevision: (() => void) | undefined

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
  lightMarkers: () => {
    return lightMarkers
  },
  controls: () => {
    return controls
  },
  roomColorOf: (polygon) => {
    if (rooms === undefined) {
      return undefined
    }

    return roomPaletteOf(polygon.room, rooms.coloring)
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
  afterRender: () => {
    // the contour of the crosshair is a screen-space pass, and it goes over the scene it was drawn from
    const sceneCamera = view?.camera

    if (sceneCamera !== undefined) {
      selection?.renderCursor(sceneCamera)
    }
  },
})

/**
 * The view takes part in the dynamic light layer: the layer asks it for a frame on every step of the flicker.
 *
 * @remarks
 * A frame of the layer redraws the scene of every view that holds the same level, so the layer knows the views by their
 * render, not by their widget. The registration is a constant of the setup: the view is one of them from the moment it
 * exists, and it leaves the layer when the widget goes away.
 */
const unregisterDynamicLights = registerDynamicLightsView(
  () => {
    loop.requestRender()
  },
  () => {
    return view?.camera
  },
)

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
  selectionGizmo = createSelectionGizmo({
    scene: view.scene,
    camera: view.camera,
    canvas: target,
    onRender: (): void => {
      loop.requestRender()
    },
  })
  resize()
}

/**
 * Shows the level with the textures or as the room map, or hides both.
 *
 * @remarks
 * The two faces of the level are exclusive: the textured mesh is what the game draws, and the room map is the flat
 * colour of the rooms, so only one of them is on at a time. The mesh switch of the key help turns off both.
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

  // the line reads the flat colour of the texture of its face: on the room map and with the mesh off there is no
  // texture under it, so the plain grey stays
  wireframe?.setColored(visible && !isRoomColorsVisible.value)

  // the outline of the portals sits under the same switch as the room map: it shows where the game joins two rooms,
  // which is a read of the level, not a layer of its own
  portalLines?.setVisible(visible && isPortalsVisible.value)
}

/**
 * Recolours the room map after an edit.
 *
 * @remarks
 * An edit refills the geometry of the level in place: the colour attribute of the room map is not refilled with it,
 * so the map is coloured again when its vertex count no longer matches the geometry. A texture or a uv edit does not
 * change the vertex buffers, so the map is not read again for it — but a move of the faces into another room does not
 * change them either, and the colours of the rooms are stale after it: the revision of the rooms tells that.
 */
function repaintRooms(): void {
  const map = loadedMap

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
 * Writes the rooms the room map keeps at full colour into the overlay.
 *
 * @remarks
 * The lit set is the selection, the hover of the room inspector and the room under the crosshair ({@link litRooms}),
 * so every view of the map shows the same rooms. The map is the only thing the highlight paints: while it is off the
 * set can change (the camera walks into another room), and repainting the vertex colours for it would be wasted work.
 */
function applyRoomHighlight(): void {
  if (rooms === undefined || !isRoomColorsVisible.value) {
    return
  }

  rooms.setHighlight(litRooms.value)
  loop.requestRender()
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
  rooms = createRoomOverlay(map)
  paintedRoomRevision = roomRevision.value
  applyRoomHighlight()
  view.scene.add(rooms.mesh)

  // the wireframe is a switch: the view puts it over the mesh only while it is on, and every line takes the colour of
  // the flat colour of the texture of its face
  wireframe = attachWireframe(view.scene, map.wireframeGeometry, {
    colored: true,
    grey: WIREFRAME_WITHOUT_MESH,
  })
  wireframe.setVisible(isWireframeVisible.value)

  // the portal outline has no geometry in the level: it is built from the list of the portals, over the same space
  portalLines = attachPortalLines(view.scene, map.fts.portals, arxVector3toVector3(map.scenePosition))

  // the lights of the LLF: a sparkle for each, at the place of the light, with the colour and the fallStart of it
  lightTextures = createLightMarkerTextures()
  lightMarkers = createLightMarkers(map.lights, lightTextures)
  lightMarkers.visible = isLightsVisible.value
  view.scene.add(lightMarkers)

  // the ring of the selected lights: a sprite per pick, over the marker, in the place of the light
  lightSelection = createLightSelectionOverlay()
  lightSelection.group.visible = isLightsVisible.value
  lightSelection.update(map.lights, lightSelectionStore.lights.value, lightHoverStore.light.value)
  view.scene.add(lightSelection.group)

  // the switches read the wireframe too (its lines follow the mesh), so they come after it is there: a fresh load
  // with the mesh on then starts in the inverted look, not in the grey of a hidden level
  updateVisibility()

  loadedMap = map

  // TODO 235: the spike of the entity models, one door of level 0, until the entities are a real overlay
  loadSpikeEntityModel(map)
    .then((group) => {
      if (group === undefined || loadedMap !== map || view === undefined) {
        return
      }

      spikeEntity = group
      view.scene.add(group)
      loop.requestRender()
    })
    .catch((error: unknown) => {
      console.warn('[entity-spike] the door of level 0 could not be loaded.', error)
    })

  loop.resetPick()
  selection = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition), view.renderer)
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
    canLock: (): boolean => {
      return selectionGizmo?.canLock() ?? true
    },
    onLockChange: (locked: boolean): void => {
      selectionGizmo?.setEnabled(!locked)

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

  if (lightMarkers !== undefined) {
    view?.scene.remove(lightMarkers)
    disposeLightMarkers(lightMarkers)
    lightMarkers = undefined
  }

  if (lightTextures !== undefined) {
    for (const texture of Object.values(lightTextures)) {
      texture.dispose()
    }

    lightTextures = undefined
  }

  if (lightSelection !== undefined) {
    view?.scene.remove(lightSelection.group)
    lightSelection.dispose()
    lightSelection = undefined
  }

  // the selected lights are indices of the level that went: a new level has a list of its own
  lightSelectionStore.clear()
  lightHoverStore.set(undefined)

  if (spikeEntity !== undefined) {
    view?.scene.remove(spikeEntity)
    disposeSpikeEntityModel(spikeEntity)
    spikeEntity = undefined
  }

  wireframe?.dispose()
  wireframe = undefined
  portalLines?.dispose()
  portalLines = undefined
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
    // a moved face is a new fill: the overlay is built from the polygons of the selection
    dragSelection.updateHighlight()
    loop.requestRender()
  })

  // a replay of the stored steps writes the rooms without a level revision (only the room revision moves): the room map
  // has to be painted again for it, or a map that came back from the storage stays in the colour of the empty rooms
  stopWatchingRoomRevision = watch(roomRevision, () => {
    repaintRooms()
    loop.requestRender()
  })

  // the mesh is a switch too: off, the level keeps the wireframe and the overlays only
  stopWatchingMesh = watch(isMeshVisible, () => {
    updateVisibility()
    loop.requestRender()
  })

  // the light markers are a switch too: the sparkles stay in the scene, and the switch takes them off the frame
  // the light markers follow both the switch and an edit of a light: the shape comes from the flags, and the colour, the
  // size and the place from the fields (the light editor and the history steps of a light bump the revision)
  stopWatchingLights = watch(
    [
      isLightsVisible,
      lightsRevision,
      lightSelectionStore.lights,
      lightHoverStore.light,
      isStaticLightsVisible,
      isDynamicLightsVisible,
      lightingProfile,
    ],
    ([visible]) => {
      if (lightMarkers !== undefined) {
        lightMarkers.visible = visible

        if (lightTextures !== undefined && loadedMap !== undefined) {
          updateLightMarkers(lightMarkers, loadedMap.lights, lightTextures)
        }
      }

      if (lightSelection !== undefined && loadedMap !== undefined) {
        lightSelection.group.visible = visible
        lightSelection.update(loadedMap.lights, lightSelectionStore.lights.value, lightHoverStore.light.value)
      }

      loop.requestRender()
    },
  )

  // the portal outline is a switch of every view at once: the same ref is read by the six fixed ones
  stopWatchingPortals = watch(isPortalsVisible, () => {
    updateVisibility()
    loop.requestRender()
  })

  // the portals of a flat level come from its rooms: a room edit rebuilds them, and the outline follows without a new
  // level
  stopWatchingPortalRevision = watch(portalRevision, () => {
    const map = loadedMap

    if (map !== undefined) {
      portalLines?.setPortals(map.fts.portals, arxVector3toVector3(map.scenePosition))
    }

    updateVisibility()
    loop.requestRender()
  })

  stopWatchingRooms = watch(isRoomColorsVisible, () => {
    updateVisibility()
    // the fill gets its grey base with the map, so a switch of the map repaints the selection too
    dragSelection.updateHighlight()
    // the highlight of the map joins the switch: it is painted only while the map is on
    applyRoomHighlight()
    loop.requestRender()
  })

  // the room inspector picks a room: the map dims the others, so the picked room reads at a glance
  stopWatchingRoom = watch(litRooms, applyRoomHighlight)

  // the selection is shared with the statistics widget: a change draws the fill of the polygons
  stopWatchingSelection = watch(selectionStore.polygons, () => {
    dragSelection.updateHighlight()
    loop.requestRender()
  })

  // the groups colour the fill (the red of a locked group) and the phantom of the crosshair: making or taking apart a
  // group changes the picture without touching the selection (2026-11-18, the owner)
  stopWatchingGroups = watch(activeFaceGroups, () => {
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
  const stops = [
    stopWatching,
    stopWatchingWireframe,
    stopWatchingMesh,
    stopWatchingPortals,
    stopWatchingLights,
    stopWatchingPortalRevision,
    stopWatchingRooms,
    stopWatchingRoom,
    stopWatchingEdit,
    stopWatchingRoomRevision,
    stopWatchingSelection,
    stopWatchingGroups,
  ]

  for (const stop of stops) {
    stop?.()
  }

  stopWatching = undefined
  stopWatchingWireframe = undefined
  stopWatchingMesh = undefined
  stopWatchingPortals = undefined
  stopWatchingLights = undefined
  stopWatchingPortalRevision = undefined
  stopWatchingRooms = undefined
  stopWatchingRoom = undefined
  stopWatchingEdit = undefined
  stopWatchingRoomRevision = undefined
  stopWatchingSelection = undefined
  stopWatchingGroups = undefined
  unregisterDynamicLights()

  globalThis.removeEventListener('keydown', onModifierKey)
  globalThis.removeEventListener('keyup', onModifierKey)
  document.removeEventListener('mousedown', dragSelection.onMouseDown)
  document.removeEventListener('mouseup', dragSelection.onMouseUp)
  document.removeEventListener('dblclick', dragSelection.onDoubleClick)

  selection?.dispose()
  selection = undefined

  // the wireframe holds the render target of the negative look, so it goes with the widget (the level stays: its
  // geometry and material belong to the store)
  wireframe?.dispose()
  wireframe = undefined

  selectionGizmo?.dispose()
  selectionGizmo = undefined

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
    <Crosshair v-if="status === '' && hasLevel" />
    <ToggleButton
      v-if="transformVisible"
      class="snap-toggle"
      :pressed="snapActive"
      label="Snap the selection"
      :tooltip="snapModifierHeld ? 'Snapping while Shift is held' : 'Snap the selection (hold Shift)'"
      tooltip-placement="left"
      :data-shifted="snapModifierHeld"
      @update:pressed="toggleMagnet"
    >
      <Magnet :size="15" />
    </ToggleButton>
    <div class="gizmo" aria-hidden="true">
      <canvas ref="gizmoCanvas"></canvas>
    </div>
    <div v-if="hud !== ''" class="hud">{{ hud }}</div>
    <div v-if="roomReadout !== ''" class="room-readout">{{ roomReadout }}</div>
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

  // the magnet of the translate gizmo: a small switch in the corner of the view, above the canvas, so the pointer can
  // reach it while the camera is not locked
  .snap-toggle {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    color: $text-muted;
    background: rgba($surface-app, 0.72);
    border: 1px solid $border-dark;
    border-radius: 4px;
    cursor: pointer;

    &[aria-pressed='true'] {
      color: $accent;
      background: rgba($accent, 0.18);
      border-color: $interactive;
    }

    // the temporary state of Shift reads as a ring: the fill is the switch the author left on, the ring is the key
    &[data-shifted='true'] {
      box-shadow: 0 0 0 1px $accent;
    }

    &:hover {
      color: $text;
      background: rgba($surface-app, 0.72);
    }
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

  // the room under the crosshair: the quiet box of the readout, at the bottom of the view, where it does not fight
  // with the numbers of the camera (and with the compass in the corner)
  .room-readout {
    position: absolute;
    bottom: 8px;
    left: 50%;
    max-width: calc(100% - 32px);
    padding: 4px 10px;
    overflow: hidden;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
    color: $text;
    text-overflow: ellipsis;
    background: rgba($surface-app, 0.72);
    border-radius: 3px;
    transform: translateX(-50%);
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
