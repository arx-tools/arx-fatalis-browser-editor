import type { Group } from 'three'
import { watch } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { activeFaceGroups } from '../../../modules/groups/groupStore.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { isDynamicLightsVisible, isStaticLightsVisible } from '../../../modules/level/edit/dynamicLights.ts'
import { lightingProfile } from '../../../modules/level/edit/lightingProfile.ts'
import { fallEndSphereVisible, fallStartSphereVisible } from '../../../modules/level/edit/lightSpheres.ts'
import { portalRevision } from '../../../modules/rooms/portalSync.ts'
import { roomRevision } from '../../../modules/rooms/roomRevision.ts'
import { litRooms } from '../../../modules/rooms/roomStore.ts'
import { lightHoverStore } from '../../../modules/selection/lightHoverStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import {
  isEntitiesVisible,
  isLightsVisible,
  isMeshVisible,
  isNormalsVisible,
  isPortalsVisible,
  isRoomColorsVisible,
  isWireframeVisible,
} from '../shared/levelDisplay.ts'
import { updateLightMarkers, type LightMarkerTextures } from '../shared/lightMarkers.ts'
import type { LevelWireframe } from '../shared/levelScene.ts'
import type { LightRadiusSpheres } from '../shared/lightRadiusSpheres.ts'
import type { LightSelectionOverlay } from '../shared/lightSelectionOverlay.ts'
import { normalsLayers, type NormalsOverlay } from '../shared/normalsOverlay.ts'
import type { PortalOverlay } from '../shared/portalOverlay.ts'
import { editedLightOf } from './editedLight.ts'
import type { FrameLoop } from './frameLoop.ts'
import { applyRoomHighlight, repaintRooms, scheduleNormals, updateVisibility, type OverlayHost } from './overlays.ts'
import type { SelectionDrag } from './useSelectionDrag.ts'

/**
 * What the watches of the walkable view read from the widget.
 *
 * @remarks
 * The bindings of the scene are `let`s of the widget, and a module can not read them: they come in as getters, so a
 * watch always reads the binding of the moment (a level that comes and goes keeps the two in step).
 */
export type ViewWatchesHost = {
  readonly dragSelection: () => SelectionDrag
  readonly lightMarkers: () => Group | undefined
  readonly lightRadiusSpheres: () => LightRadiusSpheres | undefined
  readonly lightSelection: () => LightSelectionOverlay | undefined
  readonly lightTextures: () => LightMarkerTextures | undefined
  readonly loadedMap: () => ArxMap | undefined
  readonly loop: () => FrameLoop
  readonly normals: () => NormalsOverlay | undefined
  readonly overlays: OverlayHost
  readonly portalLines: () => PortalOverlay | undefined
  readonly spikeEntity: () => Group | undefined
  readonly wireframe: () => LevelWireframe | undefined
}

/**
 * Binds the switches and the revisions of the view to the scene.
 *
 * @param host What the watches read from the widget.
 *
 * @returns The stops of the watches, for the unmount of the widget.
 */
export function bindViewWatches(host: ViewWatchesHost): Array<() => void> {
  const stopWireframe = watch(isWireframeVisible, (visible) => {
    host.wireframe()?.setVisible(visible)
    host.loop().requestRender()
  })

  // the normals are a switch of this view: the lines stay in the scene, and the switch takes them off the frame (the
  // first time it asks for them the lines are built, so a level that never showed them never pays for them)

  const stopNormals = watch(isNormalsVisible, (visible) => {
    host.normals()?.setVisible(visible)
    host.loop().requestRender()
  })

  // the two layers of the normals are switches too: the one they ask for and the one they leave are two flags on the
  // scene

  const stopNormalsLayers = watch(normalsLayers, (layers) => {
    host.normals()?.setLayers(layers)
    host.loop().requestRender()
  })

  // an edit changes the polygons, but not the objects this view holds: the level refills its geometry in
  // place, so the mesh and the wireframe of the scene already draw the new faces. What an edit does need is a
  // frame: the view draws on demand, so without this the canvas would keep the picture of the level before
  // the edit (a walk away and back would refresh it, which is exactly what a still picture can not do)

  const stopEdit = watch(levelRevision, () => {
    repaintRooms(host.overlays)
    // the normals are built from the polygons: a moved or deleted face is a new line (and a group that hid a face takes
    // its normal with it). A drag runs this on every frame, so the build waits between two frames of the burst
    scheduleNormals(host.overlays)
    // a moved face is a new fill: the overlay is built from the polygons of the selection
    host.dragSelection().updateHighlight()
    host.loop().requestRender()
  })

  // a replay of the stored steps writes the rooms without a level revision (only the room revision moves): the room map
  // has to be painted again for it, or a map that came back from the storage stays in the color of the empty rooms

  const stopRoomRevision = watch(roomRevision, () => {
    repaintRooms(host.overlays)
    host.loop().requestRender()
  })

  // the mesh is a switch too: off, the level keeps the wireframe and the overlays only

  const stopMesh = watch(isMeshVisible, () => {
    updateVisibility(host.overlays)
    host.loop().requestRender()
  })

  // the light markers are a switch too: the sparkles stay in the scene, and the switch takes them off the frame
  // the light markers follow both the switch and an edit of a light: the shape comes from the flags, and the color, the
  // size and the place from the fields (the light editor and the history steps of a light bump the revision)

  const stopLights = watch(
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
      const markers = host.lightMarkers()
      const textures = host.lightTextures()
      const map = host.loadedMap()

      if (markers !== undefined) {
        markers.visible = visible

        if (textures !== undefined && map !== undefined) {
          updateLightMarkers(markers, map.lights, textures)
        }
      }

      const selection = host.lightSelection()

      if (selection !== undefined && map !== undefined) {
        selection.group.visible = visible
        selection.update(map.lights, lightSelectionStore.lights.value, lightHoverStore.light.value)
      }

      const spheres = host.lightRadiusSpheres()

      if (spheres !== undefined && map !== undefined) {
        spheres.update(editedLightOf(map.lights))
      }

      host.loop().requestRender()
    },
  )

  // the entities of the level are a switch like the lights: they stay in the scene, and the switch takes them off the
  // frame (TODO 239: the door of level 0 is the first one)

  const stopEntities = watch(isEntitiesVisible, (visible) => {
    const entity = host.spikeEntity()

    if (entity !== undefined) {
      entity.visible = visible
    }

    host.loop().requestRender()
  })

  // the portal outline is a switch of every view at once: the same ref is read by the six fixed ones

  const stopPortals = watch(isPortalsVisible, () => {
    updateVisibility(host.overlays)
    host.loop().requestRender()
  })

  // the portals of a flat level come from its rooms: a room edit rebuilds them, and the outline follows without a new
  // level

  const stopPortalRevision = watch(portalRevision, () => {
    const map = host.loadedMap()

    if (map !== undefined) {
      host.portalLines()?.setPortals(map.fts.portals, arxVector3toVector3(map.scenePosition))
    }

    updateVisibility(host.overlays)
    host.loop().requestRender()
  })

  const stopRooms = watch(isRoomColorsVisible, () => {
    updateVisibility(host.overlays)
    // the fill gets its gray base with the map, so a switch of the map repaints the selection too
    host.dragSelection().updateHighlight()
    // the highlight of the map joins the switch: it is painted only while the map is on
    applyRoomHighlight(host.overlays)
    host.loop().requestRender()
  })

  // the room inspector picks a room: the map dims the others, so the picked room reads at a glance

  const stopRoom = watch(litRooms, () => {
    applyRoomHighlight(host.overlays)
  })

  // the selection is shared with the statistics widget: a change draws the fill of the polygons, and gives the lines of
  // the selected faces their color (the rebuild waits between two frames of a sweep, like an edit does)

  const stopSelection = watch(selectionStore.polygons, () => {
    host.dragSelection().updateHighlight()
    scheduleNormals(host.overlays)
    host.loop().requestRender()
  })

  // the groups color the fill (the red of a locked group) and the phantom of the crosshair: making or taking apart a
  // group changes the picture without touching the selection (2026-11-18, the owner)

  const stopGroups = watch(activeFaceGroups, () => {
    host.dragSelection().updateHighlight()
    // a hidden group takes its faces out of the mesh, and the normals follow the faces the mesh draws
    scheduleNormals(host.overlays)
    host.loop().requestRender()
  })

  return [
    stopWireframe,
    stopNormals,
    stopNormalsLayers,
    stopEdit,
    stopRoomRevision,
    stopMesh,
    stopLights,
    stopEntities,
    stopPortals,
    stopPortalRevision,
    stopRooms,
    stopRoom,
    stopSelection,
    stopGroups,
  ]
}
