<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { Magnet } from 'lucide-vue-next'
import { PerspectiveCamera, type Group, type Mesh } from 'three'
import Crosshair from '../../Crosshair.vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { registerDynamicLightsView } from '../../../modules/level/edit/dynamicLights.ts'
import { registerParticlesView } from '../../../modules/particles/controller.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { getModifierOfKey } from '../../../modules/keyboard/functions.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { renderPerformanceStore } from '../shared/renderPerformance.ts'
import { transformVisible } from '../shared/editModes.ts'
import { snapModifierHeld } from '../shared/snapping.ts'
import { addPreviewLights, type LevelWireframe } from '../shared/levelScene.ts'
import type { NormalsOverlay } from '../shared/normalsOverlay.ts'
import type { LightMarkerTextures } from '../shared/lightMarkers.ts'
import type { LightSelectionOverlay } from '../shared/lightSelectionOverlay.ts'
import type { LightRadiusSpheres } from '../shared/lightRadiusSpheres.ts'
import type { PortalOverlay } from '../shared/portalOverlay.ts'
import { roomPaletteOf } from '../../../../generator/rooms.ts'
import type { RoomOverlay } from '../shared/roomOverlay.ts'
import {
  FIELD_OF_VIEW,
  createViewScene,
  disposeViewScene,
  resizeViewScene,
  type ViewScene,
} from '../shared/viewScene.ts'
import ToggleButton from '../../ToggleButton.vue'
import { spawnRevision } from '../../../modules/level/entities/playerSpawn.ts'
import type { CameraControls } from './cameraControls.ts'
import { createFrameLoop } from './frameLoop.ts'
import { useSelectionDrag } from './useSelectionDrag.ts'
import { createOrientationGizmo, type OrientationGizmo } from './orientationGizmo.ts'
import type { PolygonSelectionOverlay } from './polygonSelection.ts'
import { createLightGizmo, type LightGizmo } from './lightGizmo.ts'
import { createParticleField, type ParticleField } from './particleField.ts'
import { createSelectionGizmo, type SelectionGizmo } from './selectionGizmo.ts'
import { cancelNormalsRebuild, type OverlayHost } from './overlays.ts'
import { hasLevel, hud, roomReadout, snapActive, status, toggleMagnet } from './readout.ts'
import { bindViewWatches, type ViewWatchesHost } from './viewWatches.ts'
import { attachLevel, detachLevel, loadEntitySpikeOf } from './levelAttach.ts'
import { loadPlayerModel, type PlayerModel } from './playerModel.ts'

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

let lightTextures: LightMarkerTextures | undefined
let spikeEntity: Group | undefined
let playerModel: PlayerModel | undefined
let portalLines: PortalOverlay | undefined

let selection: PolygonSelectionOverlay | undefined

let loadedMap: ArxMap | undefined

let controls: CameraControls | undefined
let observer: ResizeObserver | undefined
let stopWatching: (() => void) | undefined
let stopWatches: Array<() => void> = []

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

/**
 * What the watches of the view read: the bindings of this widget, as getters.
 */
const watchHost: ViewWatchesHost = {
  dragSelection: () => {
    return dragSelection
  },
  lightMarkers: () => {
    return lightMarkers
  },
  lightRadiusSpheres: () => {
    return lightRadiusSpheres
  },
  lightSelection: () => {
    return lightSelection
  },
  lightTextures: () => {
    return lightTextures
  },
  loadedMap: () => {
    return loadedMap
  },
  loop: () => {
    return loop
  },
  normals: () => {
    return normals
  },
  overlays,
  portalLines: () => {
    return portalLines
  },
  spikeEntity: () => {
    return spikeEntity
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
 * Shows a map: the layers of the level go into the scene, and the camera starts from the player of the level.
 *
 * @remarks
 * The layers themselves live in `levelAttach.ts`: this is where the widget keeps them, and hands them back on the way
 * out. The entity spike comes later, when its model arrives, and only while the same level is still on the screen.
 *
 * @param map The map the store loaded.
 */
function showMap(map: ArxMap): void {
  const target = canvas.value

  if (view === undefined || target === null) {
    return
  }

  const handles = attachLevel(map, {
    canvas: target,
    dragSelection,
    lightGizmo: () => {
      return lightGizmo
    },
    loop,
    selectionGizmo: () => {
      return selectionGizmo
    },
    view,
  })

  shown = handles.shown ?? []
  rooms = handles.rooms
  wireframe = handles.wireframe
  normals = handles.normals
  portalLines = handles.portalLines
  lightTextures = handles.lightTextures
  lightMarkers = handles.lightMarkers
  lightSelection = handles.lightSelection
  lightRadiusSpheres = handles.lightRadiusSpheres
  selection = handles.selection
  controls = handles.controls
  loadedMap = map

  const scene = view

  // TODO 235: the spike of the entity models, one door of level 0, until the entities are a real overlay
  loadEntitySpikeOf(
    map,
    {
      loop,
      view: scene,
    },
    () => {
      return loadedMap === map
    },
  )
    .then((group) => {
      if (group === undefined) {
        return
      }

      spikeEntity = group
    })
    .catch(() => {
      // the spike is a debug aid: a level without one is not an error of the view
    })

  // the model of the player: the spawn of the level, drawn as the human the game puts there (2026-11-24, the owner)
  loadPlayerModel({ scene: scene.scene })
    .then((model) => {
      if (loadedMap !== map) {
        model?.dispose()

        return
      }

      playerModel = model
      model?.placeAt(map)
      loop.requestRender()
    })
    .catch(() => {
      // a data directory without the model is not an error of the view: the spawn is still editable in the list
    })

  loop.requestRender()
}

/**
 * Takes the map out of the scene again: the layers go back to the module that built them.
 */
function hideMap(): void {
  detachLevel(
    {
      controls,
      lightMarkers,
      lightRadiusSpheres,
      lightSelection,
      lightTextures,
      normals,
      portalLines,
      rooms,
      selection,
      shown,
      spikeEntity,
      wireframe,
    },
    view,
  )

  shown = []
  rooms = undefined
  wireframe = undefined
  normals = undefined
  portalLines = undefined
  lightTextures = undefined
  lightMarkers = undefined
  lightSelection = undefined
  lightRadiusSpheres = undefined
  selection = undefined
  controls = undefined
  playerModel?.dispose()
  playerModel = undefined
  loadedMap = undefined
  spikeEntity = undefined
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

  // the switches and the revisions of the view: the same wiring for every widget, in `viewWatches.ts`
  stopWatches = bindViewWatches(watchHost)

  // the model of the player follows the spawn, and fades while the camera stands on it
  stopWatches.push(
    watch(spawnRevision, () => {
      if (loadedMap !== undefined && playerModel !== undefined) {
        playerModel.placeAt(loadedMap)
        loop.requestRender()
      }
    }),
    watch(
      () => {
        return cameraStore.pose.value
      },
      () => {
        if (playerModel !== undefined && view !== undefined) {
          playerModel.fadeFor(view.camera.position)
          loop.requestRender()
        }
      },
    ),
  )

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

  for (const stop of stopWatches) {
    stop()
  }

  stopWatches = []

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
