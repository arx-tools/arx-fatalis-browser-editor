<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { Magnet } from 'lucide-vue-next'
import type { ArxLight } from 'arx-convert/types'
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
import { fallEndSphereVisible, fallStartSphereVisible } from '../../../modules/level/edit/lightSpheres.ts'
import { activeFaceGroups } from '../../../modules/groups/groupStore.ts'
import { registerParticlesView } from '../../../modules/particles/controller.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { getModifierOfKey } from '../../../modules/keyboard/functions.ts'
import { lightHoverStore } from '../../../modules/selection/lightHoverStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { litRooms } from '../../../modules/rooms/roomStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { renderPerformanceStore } from '../shared/renderPerformance.ts'
import { transformVisible } from '../shared/editModes.ts'
import {
  isEntitiesVisible,
  isLightsVisible,
  isMeshVisible,
  isNormalsVisible,
  isPortalsVisible,
  isRoomColorsVisible,
  isWireframeVisible,
} from '../shared/levelDisplay.ts'
import { snapModifierHeld } from '../shared/snapping.ts'
import { addPreviewLights, attachWireframe, viewMeshesOf, type LevelWireframe } from '../shared/levelScene.ts'
import { attachNormals, normalsLayers, type NormalsOverlay } from '../shared/normalsOverlay.ts'
import { disposeSpikeEntityModel, loadSpikeEntityModel } from '../../../modules/level/entities/entitySpike.ts'
import {
  createLightMarkers,
  createLightMarkerTextures,
  disposeLightMarkers,
  updateLightMarkers,
  type LightMarkerTextures,
} from '../shared/lightMarkers.ts'
import { createLightSelectionOverlay, type LightSelectionOverlay } from '../shared/lightSelectionOverlay.ts'
import { createLightRadiusSpheres, type LightRadiusSpheres } from '../shared/lightRadiusSpheres.ts'
import { attachPortalLines, type PortalOverlay } from '../shared/portalOverlay.ts'
import { roomPaletteOf } from '../../../../generator/rooms.ts'
import { roomRevision } from '../../../modules/rooms/roomRevision.ts'
import { portalRevision } from '../../../modules/rooms/portalSync.ts'
import { createRoomOverlay, type RoomOverlay } from '../shared/roomOverlay.ts'
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
import { createLightGizmo, type LightGizmo } from './lightGizmo.ts'
import { createParticleField, type ParticleField } from './particleField.ts'
import { createSelectionGizmo, type SelectionGizmo } from './selectionGizmo.ts'
import {
  applyRoomHighlight,
  cancelNormalsRebuild,
  markRoomsPainted,
  repaintRooms,
  scheduleNormals,
  selectedPolygonsOf,
  updateVisibility,
  type OverlayHost,
} from './overlays.ts'
import { hasLevel, hud, roomReadout, snapActive, status, toggleMagnet } from './readout.ts'

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const gizmoCanvas = useTemplateRef<HTMLCanvasElement>('gizmoCanvas')

let view: ViewScene<PerspectiveCamera> | undefined
let gizmo: OrientationGizmo | undefined
let selectionGizmo: SelectionGizmo | undefined
/**
 * The move gizmo of the selected lights, or `undefined` before the view is built.
 */
let lightGizmo: LightGizmo | undefined
/**
 * The particles of the level in this view, or `undefined` before the view is built.
 */
let particleField: ParticleField | undefined
let shown: Mesh[] = []
let wireframe: LevelWireframe | undefined
let normals: NormalsOverlay | undefined
let rooms: RoomOverlay | undefined
let lightMarkers: Group | undefined
let lightSelection: LightSelectionOverlay | undefined

/**
 * The debug spheres of the falloff of the edited light.
 */
let lightRadiusSpheres: LightRadiusSpheres | undefined

/**
 * The light the editor edits, when it edits one: the walkable view draws the debug spheres of that light.
 *
 * @param lights The lights of the level, in the order of the LLF.
 *
 * @returns The light, or `undefined` when the selection is empty or holds more than one.
 */
function editedLightOf(lights: readonly ArxLight[]): ArxLight | undefined {
  if (lightSelectionStore.lights.value.size !== 1) {
    return undefined
  }

  const [index] = lightSelectionStore.lights.value

  return lights[index]
}

let lightTextures: LightMarkerTextures | undefined
let spikeEntity: Group | undefined
let portalLines: PortalOverlay | undefined

let selection: PolygonSelectionOverlay | undefined

let loadedMap: ArxMap | undefined

let stopWatchingSelection: (() => void) | undefined
let stopWatchingGroups: (() => void) | undefined
let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let stopWatching: (() => void) | undefined
let stopWatchingWireframe: (() => void) | undefined
let stopWatchingNormals: (() => void) | undefined
let stopWatchingNormalsLayers: (() => void) | undefined
let stopWatchingMesh: (() => void) | undefined
let stopWatchingPortals: (() => void) | undefined
let stopWatchingLights: (() => void) | undefined
let stopWatchingEntities: (() => void) | undefined
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
/**
 * What the overlays of the scene read: the bindings of this widget, as getters.
 *
 * @remarks
 * The overlays live in `overlays.ts`, and the bindings of the scene (`view`, `rooms`, `normals`, ...) are `let`s here:
 * the getters always read the binding of the moment, so a level that comes and goes keeps the two in step.
 */
const overlays: OverlayHost = {
  loadedMap: () => {
    return loadedMap
  },
  normals: () => {
    return normals
  },
  portalLines: () => {
    return portalLines
  },
  requestRender: () => {
    loop.requestRender()
  },
  rooms: () => {
    return rooms
  },
  shown: () => {
    return shown
  },
  wireframe: () => {
    return wireframe
  },
}

const unregisterDynamicLights = registerDynamicLightsView(
  () => {
    loop.requestRender()
  },
  () => {
    return view?.camera
  },
)

/**
 * The view takes part in the layer of the particles: the layer hands it the particles of the frame, and it draws them.
 *
 * @remarks
 * The layer wants the camera of the view for the count of the fire of a light, the frames of the particles to draw, and
 * a frame to draw them in. The registration is a constant of the setup, the way the dynamic layer's is.
 */
const unregisterParticles = registerParticlesView({
  cameraPositionOf: () => {
    return view?.camera.position
  },
  render: () => {
    loop.requestRender()
  },
  setVisible: (visible: boolean): void => {
    particleField?.setVisible(visible)
  },
  update: (frames): void => {
    particleField?.update(frames)
  },
})

/**
 * Recolors the outline of the face under the crosshair when a modifier key goes down or up.
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
  // the lights move with a gizmo of their own: a point light has no direction, so it has the translate mode only
  lightGizmo = createLightGizmo({
    scene: view.scene,
    camera: view.camera,
    canvas: target,
    onRender: (): void => {
      loop.requestRender()
    },
  })
  // the particles of the level: the fire of the lights, and the smoke it fades into
  particleField = createParticleField({
    scene: view.scene,
    onRender: (): void => {
      loop.requestRender()
    },
  })
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

  // the room map shares the geometry of the level: it is one more mesh over the same buffers
  rooms = createRoomOverlay(map)
  markRoomsPainted()
  applyRoomHighlight(overlays)
  view.scene.add(rooms.mesh)

  // the wireframe is a switch: the view puts it over the mesh only while it is on, and every line takes the color of
  // the flat color of the texture of its face
  wireframe = attachWireframe(view.scene, map.wireframeGeometry, {
    colored: true,
    gray: WIREFRAME_WITHOUT_MESH,
  })
  wireframe.setVisible(isWireframeVisible.value)

  // the normals are an overlay of their own: a line per face and per corner, built from the visible polygons, and the
  // two switches decide which of the layers is on. Only this view draws them (2026-11-23, the owner)
  normals = attachNormals(view.scene)
  normals.setLayers(normalsLayers.value)
  normals.setSource(map.visiblePolygons, arxVector3toVector3(map.scenePosition), selectedPolygonsOf(map))
  normals.setVisible(isNormalsVisible.value)

  // the portal outline has no geometry in the level: it is built from the list of the portals, over the same space
  portalLines = attachPortalLines(view.scene, map.fts.portals, arxVector3toVector3(map.scenePosition))

  // the lights of the LLF: a sparkle for each, at the place of the light, with the color and the fallStart of it
  lightTextures = createLightMarkerTextures()
  lightMarkers = createLightMarkers(map.lights, lightTextures)
  lightMarkers.visible = isLightsVisible.value
  view.scene.add(lightMarkers)

  // the ring of the selected lights: a sprite per pick, over the marker, in the place of the light
  lightSelection = createLightSelectionOverlay()
  lightSelection.group.visible = isLightsVisible.value
  lightSelection.update(map.lights, lightSelectionStore.lights.value, lightHoverStore.light.value)
  view.scene.add(lightSelection.group)

  // the debug spheres of the falloff of the light the editor edits: green for the fall start, red for the fall end
  // the debug spheres are a switch of their own, not a part of the light markers: the fall start and the fall end are
  // read on the light the editor edits, and the marker display has a switch of its own
  lightRadiusSpheres = createLightRadiusSpheres()
  lightRadiusSpheres.update(editedLightOf(map.lights))
  view.scene.add(lightRadiusSpheres.group)

  // the switches read the wireframe too (its lines follow the mesh), so they come after it is there: a fresh load
  // with the mesh on then starts in the inverted look, not in the gray of a hidden level
  updateVisibility(overlays)

  loadedMap = map

  // TODO 235: the spike of the entity models, one door of level 0, until the entities are a real overlay
  loadSpikeEntityModel(map)
    .then((group) => {
      if (group === undefined || loadedMap !== map || view === undefined) {
        return
      }

      spikeEntity = group
      group.visible = isEntitiesVisible.value
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
      return (selectionGizmo?.canLock() ?? true) && (lightGizmo?.canLock() ?? true)
    },
    onLockChange: (locked: boolean): void => {
      selectionGizmo?.setEnabled(!locked)
      lightGizmo?.setEnabled(!locked)

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

  if (lightRadiusSpheres !== undefined) {
    view?.scene.remove(lightRadiusSpheres.group)
    lightRadiusSpheres.dispose()
    lightRadiusSpheres = undefined
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
  cancelNormalsRebuild()
  normals?.dispose()
  normals = undefined
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

/**
 * Asks the view for a frame when the tab comes back: the browser may have dropped the frame an earlier request asked
 * for, and a view that keeps its old picture shows nothing of what changed in the background.
 */
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    loop.requestRender()
  }
}

onMounted(() => {
  createScene()

  observer = new ResizeObserver(() => {
    resize()
  })

  // a tab that comes back from the background may have dropped the frame a render request of it owed: the view would
  // keep the picture it had when the tab went away, and only a click (the pointer lock's loop) would draw again
  // (2026-11-23, the owner: the view showed nothing until the first pointer lock)
  document.addEventListener('visibilitychange', onVisibilityChange)

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

  // the normals are a switch of this view: the lines stay in the scene, and the switch takes them off the frame (the
  // first time it asks for them the lines are built, so a level that never showed them never pays for them)
  stopWatchingNormals = watch(isNormalsVisible, (visible) => {
    normals?.setVisible(visible)
    loop.requestRender()
  })

  // the two layers of the normals are switches too: the one they ask for and the one they leave are two flags on the
  // scene
  stopWatchingNormalsLayers = watch(normalsLayers, (layers) => {
    normals?.setLayers(layers)
    loop.requestRender()
  })

  // an edit changes the polygons, but not the objects this view holds: the level refills its geometry in
  // place, so the mesh and the wireframe of the scene already draw the new faces. What an edit does need is a
  // frame: the view draws on demand, so without this the canvas would keep the picture of the level before
  // the edit (a walk away and back would refresh it, which is exactly what a still picture can not do)
  stopWatchingEdit = watch(levelRevision, () => {
    repaintRooms(overlays)
    // the normals are built from the polygons: a moved or deleted face is a new line (and a group that hid a face takes
    // its normal with it). A drag runs this on every frame, so the build waits between two frames of the burst
    scheduleNormals(overlays)
    // a moved face is a new fill: the overlay is built from the polygons of the selection
    dragSelection.updateHighlight()
    loop.requestRender()
  })

  // a replay of the stored steps writes the rooms without a level revision (only the room revision moves): the room map
  // has to be painted again for it, or a map that came back from the storage stays in the color of the empty rooms
  stopWatchingRoomRevision = watch(roomRevision, () => {
    repaintRooms(overlays)
    loop.requestRender()
  })

  // the mesh is a switch too: off, the level keeps the wireframe and the overlays only
  stopWatchingMesh = watch(isMeshVisible, () => {
    updateVisibility(overlays)
    loop.requestRender()
  })

  // the light markers are a switch too: the sparkles stay in the scene, and the switch takes them off the frame
  // the light markers follow both the switch and an edit of a light: the shape comes from the flags, and the color, the
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
      fallStartSphereVisible,
      fallEndSphereVisible,
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

      if (lightRadiusSpheres !== undefined && loadedMap !== undefined) {
        lightRadiusSpheres.update(editedLightOf(loadedMap.lights))
      }

      loop.requestRender()
    },
  )

  // the entities of the level are a switch like the lights: they stay in the scene, and the switch takes them off the
  // frame (TODO 239: the door of level 0 is the first one)
  stopWatchingEntities = watch(isEntitiesVisible, (visible) => {
    if (spikeEntity !== undefined) {
      spikeEntity.visible = visible
    }

    loop.requestRender()
  })

  // the portal outline is a switch of every view at once: the same ref is read by the six fixed ones
  stopWatchingPortals = watch(isPortalsVisible, () => {
    updateVisibility(overlays)
    loop.requestRender()
  })

  // the portals of a flat level come from its rooms: a room edit rebuilds them, and the outline follows without a new
  // level
  stopWatchingPortalRevision = watch(portalRevision, () => {
    const map = loadedMap

    if (map !== undefined) {
      portalLines?.setPortals(map.fts.portals, arxVector3toVector3(map.scenePosition))
    }

    updateVisibility(overlays)
    loop.requestRender()
  })

  stopWatchingRooms = watch(isRoomColorsVisible, () => {
    updateVisibility(overlays)
    // the fill gets its gray base with the map, so a switch of the map repaints the selection too
    dragSelection.updateHighlight()
    // the highlight of the map joins the switch: it is painted only while the map is on
    applyRoomHighlight(overlays)
    loop.requestRender()
  })

  // the room inspector picks a room: the map dims the others, so the picked room reads at a glance
  stopWatchingRoom = watch(litRooms, () => {
    applyRoomHighlight(overlays)
  })

  // the selection is shared with the statistics widget: a change draws the fill of the polygons, and gives the lines of
  // the selected faces their color (the rebuild waits between two frames of a sweep, like an edit does)
  stopWatchingSelection = watch(selectionStore.polygons, () => {
    dragSelection.updateHighlight()
    scheduleNormals(overlays)
    loop.requestRender()
  })

  // the groups color the fill (the red of a locked group) and the phantom of the crosshair: making or taking apart a
  // group changes the picture without touching the selection (2026-11-18, the owner)
  stopWatchingGroups = watch(activeFaceGroups, () => {
    dragSelection.updateHighlight()
    // a hidden group takes its faces out of the mesh, and the normals follow the faces the mesh draws
    scheduleNormals(overlays)
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
    stopWatchingNormals,
    stopWatchingNormalsLayers,
    stopWatchingMesh,
    stopWatchingPortals,
    stopWatchingLights,
    stopWatchingEntities,
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
  stopWatchingNormals = undefined
  stopWatchingNormalsLayers = undefined
  stopWatchingMesh = undefined
  stopWatchingPortals = undefined
  stopWatchingLights = undefined
  stopWatchingEntities = undefined
  stopWatchingPortalRevision = undefined
  stopWatchingRooms = undefined
  stopWatchingRoom = undefined
  stopWatchingEdit = undefined
  stopWatchingRoomRevision = undefined
  stopWatchingSelection = undefined
  stopWatchingGroups = undefined
  unregisterDynamicLights()
  unregisterParticles()

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

  // the normals are the lines of this view, built from the polygons of the level: nothing of them belongs to the store
  cancelNormalsRebuild()
  normals?.dispose()
  normals = undefined

  selectionGizmo?.dispose()
  selectionGizmo = undefined
  lightGizmo?.dispose()
  lightGizmo = undefined
  particleField?.dispose()
  particleField = undefined

  document.removeEventListener('visibilitychange', onVisibilityChange)
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
