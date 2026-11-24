import type { Group, Mesh, PerspectiveCamera, Texture } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { WIREFRAME_WITHOUT_MESH, arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { disposeSpikeEntityModel, loadSpikeEntityModel } from '../../../modules/level/entities/entitySpike.ts'
import { lightHoverStore } from '../../../modules/selection/lightHoverStore.ts'
import { entitySelectionStore } from '../../../modules/selection/entitySelectionStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { isEntitiesVisible, isLightsVisible, isNormalsVisible, isWireframeVisible } from '../shared/levelDisplay.ts'
import { attachWireframe, viewMeshesOf, type LevelWireframe } from '../shared/levelScene.ts'
import {
  disposeLightMarkers,
  createLightMarkers,
  createLightMarkerTextures,
  type LightMarkerTextures,
} from '../shared/lightMarkers.ts'
import { createLightRadiusSpheres, type LightRadiusSpheres } from '../shared/lightRadiusSpheres.ts'
import { createEntityMarkers, createEntityMarkerTexture, disposeEntityMarkers } from '../shared/entityMarkers.ts'
import { createLightSelectionOverlay, type LightSelectionOverlay } from '../shared/lightSelectionOverlay.ts'
import { attachNormals, normalsLayers, type NormalsOverlay } from '../shared/normalsOverlay.ts'
import { attachPortalLines, type PortalOverlay } from '../shared/portalOverlay.ts'
import { createRoomOverlay, type RoomOverlay } from '../shared/roomOverlay.ts'
import type { ViewScene } from '../shared/viewScene.ts'
import { CameraControls } from './cameraControls.ts'
import { editedLightOf } from './editedLight.ts'
import type { FrameLoop } from './frameLoop.ts'
import type { LightGizmo } from './lightGizmo.ts'
import {
  applyRoomHighlight,
  cancelNormalsRebuild,
  markRoomsPainted,
  selectedPolygonsOf,
  updateVisibility,
  type OverlayHost,
} from './overlays.ts'
import { createPolygonSelectionOverlay, type PolygonSelectionOverlay } from './polygonSelection.ts'
import type { SelectionGizmo } from './selectionGizmo.ts'
import type { SelectionDrag } from './useSelectionDrag.ts'

export type LevelHandles = {
  controls?: CameraControls
  entityMarkers?: Group
  entityMarkerTexture?: Texture
  lightMarkers?: Group
  lightRadiusSpheres?: LightRadiusSpheres
  lightSelection?: LightSelectionOverlay
  lightTextures?: LightMarkerTextures
  normals?: NormalsOverlay
  portalLines?: PortalOverlay
  rooms?: RoomOverlay
  selection?: PolygonSelectionOverlay
  shown?: Mesh[]
  spikeEntity?: Group
  wireframe?: LevelWireframe
}

export type LevelContext = {
  readonly canvas: HTMLCanvasElement
  readonly dragSelection: SelectionDrag
  readonly lightGizmo: () => LightGizmo | undefined
  readonly loop: FrameLoop
  readonly selectionGizmo: () => SelectionGizmo | undefined
  readonly view: ViewScene<PerspectiveCamera>
}

/**
 * Builds the layers of a level over the scene of the view.
 *
 * @param map The map the store loaded.
 * @param context The scene, the loop and the gestures of the widget that owns them.
 *
 * @returns The handles of the layers: the widget keeps them, and `detachLevel` takes them off again.
 */
export function attachLevel(map: ArxMap, context: LevelContext): LevelHandles {
  const { dragSelection, loop, view } = context
  const shown = viewMeshesOf(map.meshes)

  for (const mesh of shown) {
    view.scene.add(mesh)
  }

  // the room map shares the geometry of the level: it is one more mesh over the same buffers
  const rooms = createRoomOverlay(map)

  markRoomsPainted()

  // the wireframe is a switch: the view puts it over the mesh only while it is on, and every line takes the color of
  // the flat color of the texture of its face
  const wireframe = attachWireframe(view.scene, map.wireframeGeometry, {
    colored: true,
    gray: WIREFRAME_WITHOUT_MESH,
  })

  wireframe.setVisible(isWireframeVisible.value)

  // the normals are an overlay of their own: a line per face and per corner, built from the visible polygons, and the
  // two switches decide which of the layers is on. Only this view draws them (2026-11-23, the owner)
  const normals = attachNormals(view.scene)

  normals.setLayers(normalsLayers.value)
  normals.setSource(map.visiblePolygons, arxVector3toVector3(map.scenePosition), selectedPolygonsOf(map))
  normals.setVisible(isNormalsVisible.value)

  // the portal outline has no geometry in the level: it is built from the list of the portals, over the same space
  const portalLines = attachPortalLines(view.scene, map.fts.portals, arxVector3toVector3(map.scenePosition))

  // the lights of the LLF: a sparkle for each, at the place of the light, with the color and the fallStart of it
  const lightTextures = createLightMarkerTextures()
  const lightMarkers = createLightMarkers(map.lights, lightTextures)

  lightMarkers.visible = isLightsVisible.value
  view.scene.add(lightMarkers)

  // the ring of the selected lights: a sprite per pick, over the marker, in the place of the light
  const lightSelection = createLightSelectionOverlay()

  lightSelection.group.visible = isLightsVisible.value
  lightSelection.update(map.lights, lightSelectionStore.lights.value, lightHoverStore.light.value)
  view.scene.add(lightSelection.group)

  // the entities of the DLF: a ring at the place of every interactive object, the color of its folder (2026-11-24, the
  // owner: the entities are pickable like the lights, until the models take the place of the rings)
  const entityMarkerTexture = createEntityMarkerTexture()
  const entityMarkers = createEntityMarkers(map.dlf.interactiveObjects, entityMarkerTexture)

  entityMarkers.visible = isEntitiesVisible.value
  view.scene.add(entityMarkers)

  // the debug spheres of the falloff of the light the editor edits: green for the fall start, red for the fall end
  // the debug spheres are a switch of their own, not a part of the light markers: the fall start and the fall end are
  // read on the light the editor edits, and the marker display has a switch of its own
  const lightRadiusSpheres = createLightRadiusSpheres()

  lightRadiusSpheres.update(editedLightOf(map.lights))
  view.scene.add(lightRadiusSpheres.group)
  view.scene.add(rooms.mesh)

  // the switches read the wireframe too (its lines follow the mesh), so they come after it is there: a fresh load
  // with the mesh on then starts in the inverted look, not in the gray of a hidden level
  const host: OverlayHost = {
    loadedMap: () => {
      return map
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

  updateVisibility(host)
  applyRoomHighlight(host)

  loop.resetPick()

  const selection = createPolygonSelectionOverlay(view.scene, arxVector3toVector3(map.scenePosition), view.renderer)

  dragSelection.updateHighlight()
  loop.requestRender()

  // a level change builds a new camera: the old one has to let the pointer and the listeners go
  const controls = new CameraControls({
    canvas: context.canvas,
    camera: view.camera,
    scene: map.scenePosition,
    player: map.player,
    onPoseChange: (pose): void => {
      cameraStore.setPose(pose)
      loop.requestRender()
    },
    canLock: (): boolean => {
      return (context.selectionGizmo()?.canLock() ?? true) && (context.lightGizmo()?.canLock() ?? true)
    },
    onLockChange: (locked: boolean): void => {
      context.selectionGizmo()?.setEnabled(!locked)
      context.lightGizmo()?.setEnabled(!locked)

      if (locked) {
        loop.startLoop()

        return
      }

      loop.requestRender()
    },
  })

  // the camera controls widget moves this camera, so it needs a handle on it
  cameraStore.setDriver({
    applyPose: (pose): void => {
      controls.applyPose(pose)
    },
    moveToSpawn: (): void => {
      controls.applySpawnPose()
    },
  })

  loop.requestRender()

  return {
    controls,
    entityMarkerTexture,
    entityMarkers,
    lightMarkers,
    lightRadiusSpheres,
    lightSelection,
    lightTextures,
    normals,
    portalLines,
    rooms,
    selection,
    shown,
    wireframe,
  }
}

/**
 * Takes the light layer of the map out of the scene.
 *
 * @param handles The handles of the level.
 * @param view The scene the handles were built in.
 */
function detachLightsAndEntity(handles: LevelHandles, view: ViewScene<PerspectiveCamera> | undefined): void {
  const {
    entityMarkers,
    entityMarkerTexture,
    lightMarkers,
    lightTextures,
    lightSelection,
    lightRadiusSpheres,
    spikeEntity,
  } = handles

  if (lightMarkers !== undefined) {
    view?.scene.remove(lightMarkers)
    disposeLightMarkers(lightMarkers)
  }

  if (lightTextures !== undefined) {
    for (const texture of Object.values(lightTextures)) {
      texture.dispose()
    }
  }

  if (lightSelection !== undefined) {
    view?.scene.remove(lightSelection.group)
    lightSelection.dispose()
  }

  if (lightRadiusSpheres !== undefined) {
    view?.scene.remove(lightRadiusSpheres.group)
    lightRadiusSpheres.dispose()
  }

  // the selected lights are indices of the level that went: a new level has a list of its own
  lightSelectionStore.clear()
  lightHoverStore.set(undefined)

  if (entityMarkers !== undefined) {
    view?.scene.remove(entityMarkers)
    disposeEntityMarkers(entityMarkers)
  }

  entityMarkerTexture?.dispose()

  // the selected entity is an index of the level that went: a new level has a list of its own
  entitySelectionStore.clear()
  entitySelectionStore.setHover(undefined)

  if (spikeEntity !== undefined) {
    view?.scene.remove(spikeEntity)
    disposeSpikeEntityModel(spikeEntity)
  }
}

/**
 * Takes the layers of a level out of the scene.
 *
 * @remarks
 * The geometry and the material belong to the store, so this only removes the wrappers of this widget: a rebuilt
 * widget puts the level back at once. The camera goes with the map: the store keeps the last pose it reported, but
 * nothing is left to move.
 *
 * @param handles What `attachLevel` handed over, as it stands now (a widget that went away mid-load has holes in it).
 * @param view The scene the handles were built in, or `undefined` when the scene is already gone.
 */
export function detachLevel(handles: LevelHandles, view: ViewScene<PerspectiveCamera> | undefined): void {
  for (const mesh of handles.shown ?? []) {
    view?.scene.remove(mesh)
  }

  detachLightsAndEntity(handles, view)

  handles.wireframe?.dispose()
  cancelNormalsRebuild()
  handles.normals?.dispose()
  handles.portalLines?.dispose()
  handles.selection?.dispose()

  // the crosshair store is not cleared here: the dock is rebuilt when the stored layout arrives, and the old
  // view unmounts after the new one has already picked a face — a write of `undefined` here would hide that
  // face from the inspector. The widgets read the store together with the level, so an index the level no
  // longer has reads as nothing anyway, and the next frame of the live view reports the face it is on.
  cameraStore.setDriver(undefined)
  handles.controls?.dispose()
}

/**
 * What the spike of the entity models reads from the widget.
 */
export type SpikeContext = {
  readonly loop: FrameLoop
  readonly view: ViewScene<PerspectiveCamera>
}

/**
 * The spike of the entity models, loaded over a level that is already in the scene.
 *
 * @param map The map of the scene.
 * @param context The scene and the loop of the widget.
 * @param isCurrent Whether the level is still the one of the scene when the model arrives.
 *
 * @returns The group of the door, or `undefined` when it could not be loaded.
 */
export async function loadEntitySpikeOf(
  map: ArxMap,
  context: SpikeContext,
  isCurrent: () => boolean,
): Promise<Group | undefined> {
  const group = await loadSpikeEntityModel(map).catch((error: unknown) => {
    console.warn('[entity-spike] the door of level 0 could not be loaded.', error)

    return undefined
  })

  if (group === undefined || !isCurrent()) {
    return undefined
  }

  group.visible = isEntitiesVisible.value
  context.view.scene.add(group)
  context.loop.requestRender()

  return group
}
