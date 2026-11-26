import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { Raycaster, Vector2, type Group, type PerspectiveCamera, type Mesh } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { usedVerticesOf } from '../../../../generator/polygons.ts'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
import { faceGroupOfFace, faceIndicesWithGroupsOf } from '../../../modules/groups/groupQueries.ts'
import { inGroupOf, selectedGroupPolygons } from '../../../modules/groups/groupSelection.ts'
import { isKeyDown } from '../../../modules/keyboard/keyboard.ts'
import { fillAreaOf, type SelectionFill } from '../../../modules/selection/fillArea.ts'
import { entitySelectionStore } from '../../../modules/selection/entitySelectionStore.ts'
import { isPlayerSelected } from '../../../modules/level/entities/playerSpawn.ts'
import { lightHoverStore } from '../../../modules/selection/lightHoverStore.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionModeOf, selectionStore, type SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { isLightsVisible, isRoomColorsVisible, isEntitiesVisible } from '../shared/levelDisplay.ts'
import type { ViewScene } from '../shared/viewScene.ts'
import { entityMarkerIndexAt } from '../shared/entityMarkers.ts'
import { lightMarkerIndexAt } from '../shared/lightMarkers.ts'
import type { CameraControls } from './cameraControls.ts'
import {
  faceToSweep,
  pickPolygon,
  pickPolygons,
  type PolygonSelectionOverlay,
  type SweepResult,
} from './polygonSelection.ts'

/**
 * The input of the walkable view: the pick of the crosshair, and the selection the pointer makes.
 *
 * @remarks
 * The pointer is **locked** in this view, so the mouse does not move a cursor over the level: a press sweeps the faces
 * under the crosshair while the camera turns, and the modifiers of the press decide what the sweep does (a new
 * selection, an add, a take away). The double click takes the area the view shows around the face: the welded area of
 * one texture while the level is textured, and the area (the room) of the face while the room map is on.
 *
 * The frame loop (`frameLoop.ts`) is what calls {@link SelectionDrag.pickUnderCrosshair} on the frames it draws and
 * {@link SelectionDrag.updateDrag} while a sweep runs; this module is the gesture and the model it writes, with the
 * view, the level and the overlay handed in as callbacks.
 */

/**
 * How many faces a drag reads from the ray: enough to find the one that touches the selection under a face that does
 * not.
 */
const CONNECT_CANDIDATES = 24

/**
 * What the selection gesture reads from the view.
 */
export type SelectionDragContext = {
  /**
   * The scene of the view, when it is built: the pick ray comes from its camera.
   *
   * @returns The scene, or `undefined` before the widget made it.
   */
  readonly view: () => ViewScene<PerspectiveCamera> | undefined
  /**
   * The level on the screen.
   *
   * @returns The map, or `undefined` while there is no level.
   */
  readonly map: () => ArxMap | undefined
  /**
   * The meshes of the level in the scene, in the order the pick walks them.
   *
   * @returns The meshes, without a copy.
   */
  readonly meshes: () => readonly Mesh[]
  /**
   * The meshes of the model of the player in the scene: the spawn is a target of the view.
   *
   * @returns The meshes that are on the screen, without a copy.
   */
  readonly playerMeshes: () => readonly Mesh[]
  /**
   * The overlay that draws the crosshair outline and the fill of the selection.
   *
   * @returns The overlay, or `undefined` while there is no level.
   */
  readonly overlay: () => PolygonSelectionOverlay | undefined
  /**
   * The markers of the entities of the level.
   *
   * @returns The group of the markers, or `undefined` while there is no level.
   */
  readonly entityMarkers: () => Group | undefined
  /**
   * The markers of the lights of the level.
   *
   * @returns The group of the markers, or `undefined` while there is no level.
   */
  readonly lightMarkers: () => Group | undefined
  /**
   * The camera controls of the view: the gesture only runs under the pointer lock.
   *
   * @returns The controls, or `undefined` before the level arrived.
   */
  readonly controls: () => CameraControls | undefined
  /**
   * The color of the room of a face, on the room map.
   *
   * @param polygon The face to read.
   *
   * @returns The color the room map paints the room of the face with, or `undefined` for a face without a room.
   */
  readonly roomColorOf: (polygon: ArxPolygon) => string | undefined
}

/**
 * The handlers the widget binds.
 */
export type SelectionDrag = {
  /**
   * Starts a gesture of the locked view: the faces under the crosshair from here on are selected.
   *
   * @param event The mouse event of the press.
   */
  readonly onMouseDown: (event: MouseEvent) => void
  /**
   * Ends the gesture: the next press starts a new one.
   *
   * @param event The mouse event of the release.
   */
  readonly onMouseUp: (event: MouseEvent) => void
  /**
   * Takes the whole welded area of the texture under the crosshair: the double click of the walkable view.
   *
   * @param event The mouse event of the double click.
   */
  readonly onDoubleClick: (event: MouseEvent) => void
  /**
   * Reads the face under the crosshair and tells the outline and the inspector about it.
   *
   * @remarks
   * The loop decides when this runs: at most every {@link PICK_INTERVAL_MS} while the pointer is locked.
   */
  readonly pickUnderCrosshair: () => void
  /**
   * Sweeps the faces under the crosshair into the selection while the button is held.
   */
  readonly updateDrag: () => void
  /**
   * Shows the selection: the fill of the selected polygons.
   */
  readonly updateHighlight: () => void
}

/**
 * The middle of the canvas, in the space the pick reads a screen point in.
 */
const CROSSHAIR_POINT = new Vector2(0, 0)

/**
 * Tells whether the model of the player is the nearest thing under the crosshair.
 *
 * @remarks
 * The model of the spawn stands in the scene like the markers: a ray through the middle of the screen hits it, and it
 * is the target of the click **when it is nearer than the level**. A model behind a wall is not: the wall is what the
 * author looks at. A view without a model (a level of a data directory without it) has nothing to pick.
 *
 * @param camera The camera of the view.
 * @param level The meshes of the level.
 * @param player The meshes of the model of the player that are on the screen.
 *
 * @returns True when the model is the nearest thing under the crosshair.
 */
export function playerIsNearest(camera: PerspectiveCamera, level: readonly Mesh[], player: readonly Mesh[]): boolean {
  if (player.length === 0) {
    return false
  }

  camera.updateMatrixWorld()

  const raycaster = new Raycaster()
  raycaster.near = camera.near
  raycaster.far = camera.far
  raycaster.setFromCamera(CROSSHAIR_POINT, camera)

  const levelHit = raycaster.intersectObjects([...level], false)[0]
  const playerHit = raycaster.intersectObjects([...player], false)[0]

  if (playerHit === undefined) {
    return false
  }

  return levelHit === undefined || playerHit.distance < levelHit.distance
}

/**
 * Builds the selection gesture of the walkable view.
 *
 * @param context What the gesture reads from the view.
 *
 * @returns The handlers the widget binds.
 */
export function useSelectionDrag(context: SelectionDragContext): SelectionDrag {
  const { view, map, meshes, playerMeshes, overlay, entityMarkers, lightMarkers, controls } = context

  /**
   * What a running drag does with the faces it sweeps over.
   *
   * @remarks
   * A press starts it, a release ends it, and every frame in between looks at the face under the crosshair -- the
   * pointer is locked, so the drag is the camera turning, not a rectangle on the screen. The mode is fixed at the
   * press: the modifiers of that moment decide it, the way a click does.
   */
  let dragMode: SelectionMode | undefined

  /**
   * The vertices of the faces the drag has taken into the selection: the connection test of the next face.
   *
   * @remarks
   * A face only joins when one of its vertices is close to one of these. Without that rule a drag would paint every
   * face it sweeps over, however far from the start it lies (the archived editor's `isConnectedToSelection`).
   */
  let dragVertices: ArxVector3[] = []

  /**
   * Reads the mode of the click from the modifiers that are held down.
   *
   * @remarks
   * The keys are tracked by the keyboard module, not by the mouse events: under a pointer lock the browser does not
   * send a move for every key change, and the outline has to color itself as the modifier changes.
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
    const scene = view()
    const level = map()

    if (scene === undefined || level === undefined || dragMode === undefined) {
      return undefined
    }

    const candidates = pickPolygons(scene.camera, meshes(), level.triangleToPolygon, CONNECT_CANDIDATES)

    return faceToSweep({
      candidates,
      polygons: level.polygons,
      selected: selectionStore.polygons.value,
      vertices: dragVertices,
      mode: dragMode,
    })
  }

  /**
   * Selects the face under the crosshair for the running gesture.
   *
   * @remarks
   * A `replace` gesture already dropped the old selection at the press, so every mode is an add here. A face joins only
   * when it touches the ones this drag has selected so far, so a fast drag does not jump over the gaps of the mesh and a
   * face from the other side of the level does not come along. `Ctrl` takes faces away, and there the connection does
   * not matter.
   *
   * A face the selection already holds takes nothing: the walk stops on it, because it hides what is behind it. The
   * drag does not stop with it — its vertices go into `dragVertices`, so the next face on the other side joins the way
   * it would when a pencil crosses an earlier line on a squared paper.
   */
  function selectUnderCrosshair(): void {
    const level = map()

    if (level === undefined || dragMode === undefined || view() === undefined) {
      return
    }

    const sweep = pickConnectedPolygon()

    if (sweep === undefined) {
      return
    }

    const polygon = level.polygons[sweep.index]

    if (polygon === undefined) {
      return
    }

    // a face of a group is locked: the pencil takes the whole group in, or takes it out, in one piece
    const faces = faceIndicesWithGroupsOf([sweep.index])
    const polygons = faces.flatMap((face) => {
      const member = level.polygons[face]

      if (member === undefined) {
        return []
      }

      return [member]
    })
    const vertices = polygons.flatMap((member) => {
      return usedVerticesOf(member)
    })

    if (dragMode === 'remove') {
      selectionStore.selectMany(faces, 'remove')

      return
    }

    // the pencil ran into faces the gesture already holds: nothing changes, but the drawing goes on from here
    const holds = faces.every((face) => {
      return selectionStore.polygons.value.has(face)
    })

    if (holds || sweep.kind === 'cross') {
      dragVertices = [...dragVertices, ...vertices]

      return
    }

    selectionStore.selectMany(faces, 'add')
    dragVertices = [...dragVertices, ...vertices]
  }

  /**
   * The selected polygons of the loaded map.
   *
   * @returns The polygons, in the order of the set.
   */
  function selectedPolygons(): ArxPolygon[] {
    const polygons: ArxPolygon[] = []
    const level = map()

    if (level === undefined) {
      return polygons
    }

    for (const index of selectionStore.polygons.value) {
      const polygon = level.polygons[index]

      if (polygon !== undefined) {
        polygons.push(polygon)
      }
    }

    return polygons
  }

  /**
   * The light whose marker the crosshair of the view points at.
   *
   * @remarks
   * The markers are a target only while the Lights switch shows them: with the switch off the author looks at the
   * level, and a light in the way must not take the crosshair from the face under it.
   *
   * @returns The index of the light, or `undefined` when no marker is under the crosshair or the switch is off.
   */
  function lightUnderCrosshair(): number | undefined {
    const scene = view()
    const markers = lightMarkers()

    if (scene === undefined || markers === undefined || !isLightsVisible.value) {
      return undefined
    }

    return lightMarkerIndexAt(scene.camera, markers)
  }

  /**
   * Reads the entity whose marker the crosshair points at.
   *
   * @returns The index of the entity in the DLF list, or `undefined` when no marker is under the crosshair.
   */
  function entityUnderCrosshair(): number | undefined {
    const scene = view()
    const markers = entityMarkers()

    if (scene === undefined || markers === undefined || !isEntitiesVisible.value) {
      return undefined
    }

    return entityMarkerIndexAt(scene.camera, markers)
  }

  /**
   * Tells whether the model of the player is under the crosshair, in front of the level.
   *
   * @remarks
   * The model of the spawn stands in the scene like the markers: a ray through the middle of the screen hits it, and it
   * is the target of the click **when it is nearer than the level**. A model behind a wall is not: the wall is what the
   * author looks at.
   *
   * @returns True when the model is the nearest thing under the crosshair.
   */
  function playerUnderCrosshair(): boolean {
    const scene = view()

    if (scene === undefined) {
      return false
    }

    return playerIsNearest(scene.camera, meshes(), playerMeshes())
  }

  return {
    onMouseDown: (event): void => {
      if (controls()?.isLocked !== true) {
        return
      }

      // only the left button selects: the right one is left alone, and the middle one is not a pick either
      if (event.button !== 0) {
        return
      }

      if (view() === undefined || map() === undefined) {
        return
      }

      // a marker under the crosshair takes the press: the light is the smaller target of the two, and the walkable
      // view is where the Gizmo of the markers is read.
      const light = lightUnderCrosshair()

      if (light !== undefined) {
        const mode = selectionModeOf(event)

        // a plain click is a new selection, whatever it took before: the faces of the other kind go with it. The
        // Shift and the Ctrl keep the other kind, so a light and a face can be gathered together (the two stores are
        // still separate; the unified selection is the 254)
        if (mode === 'replace') {
          selectionStore.clear()
          entitySelectionStore.clear()
        }

        lightSelectionStore.selectMany([light], mode)

        return
      }

      // the markers of the entities: the same rule as the lights, one target (an entity has no group to gather)
      const entity = entityUnderCrosshair()

      if (entity !== undefined) {
        entitySelectionStore.select(entity)
        selectionStore.clear()
        lightSelectionStore.clear()

        return
      }

      // the model of the player: the spawn is a target like the markers, and the nearest thing under the crosshair wins
      if (playerUnderCrosshair()) {
        isPlayerSelected.value = true
        entitySelectionStore.clear()
        selectionStore.clear()
        lightSelectionStore.clear()

        return
      }

      entitySelectionStore.clear()

      dragMode = selectionModeOf(event)
      dragVertices = []

      if (dragMode === 'replace') {
        selectionStore.clear()
        lightSelectionStore.clear()
      }

      selectUnderCrosshair()
    },
    onMouseUp: (event): void => {
      if (event.button !== 0) {
        return
      }

      dragMode = undefined
      dragVertices = []
    },
    onDoubleClick: (event): void => {
      const scene = view()
      const level = map()
      const paint = overlay()

      if (scene === undefined || level === undefined || paint === undefined || controls()?.isLocked !== true) {
        return
      }

      // a double click on a light does nothing: the light is not a face, and the fill area of the face behind it is
      // not what the author aimed at (2026-11-18, the owner)
      if (lightUnderCrosshair() !== undefined) {
        return
      }

      const index = pickPolygon(scene.camera, meshes(), level.triangleToPolygon)

      if (index === undefined) {
        return
      }

      // what the view shows decides the area: the room map takes the area of the face, the textures take the welded
      // area of one texture (an area with no room is the piece of faces that still has to be assigned one)
      let fill: SelectionFill = 'textures'

      if (isRoomColorsVisible.value) {
        fill = 'rooms'
      }

      const area = fillAreaOf(fill, level.polygons, level.vertexToPolygons, index)
      const mode = selectionModeOf(event)

      if (mode === 'replace') {
        lightSelectionStore.clear()
      }

      // the fill brings the group of every face it reaches
      selectionStore.selectMany(faceIndicesWithGroupsOf(area), mode)
    },
    pickUnderCrosshair: (): void => {
      const scene = view()
      const level = map()
      const paint = overlay()

      if (scene === undefined || level === undefined || paint === undefined) {
        return
      }

      // a marker under the crosshair is the target of the view: the ring of the light is its mark, and the face behind
      // it is not the face the author means, so the phantom outline of the crosshair goes (2026-11-18, the owner). The
      // markers of the entities come after the lights, the way the click picks them (2026-11-24)
      const light = lightUnderCrosshair()

      if (light !== undefined) {
        lightHoverStore.set(light)
        entitySelectionStore.setHover(undefined)
        crosshairStore.set(undefined)
        paint.setCursor([], dragMode ?? selectionModeOfKeys())

        return
      }

      lightHoverStore.set(undefined)

      // the marker of an entity under the crosshair opens, and it is what the click would take: the outline of the face
      // behind it goes while an entity is aimed at. The hover stays when the pointer is let go, the way the hover of a
      // light does: a crosshair that points at an entity is a read of the view, locked or not (2026-11-24, the owner:
      // the phantom outline came back on the entity after the lock was left)
      const entityHover = entityUnderCrosshair()

      entitySelectionStore.setHover(entityHover)

      // the green outline of the face under the crosshair goes while an entity is aimed at: the white ring is the mark
      // of what the click takes, and a face behind it is not it (2026-11-24, the owner)
      if (entityHover !== undefined) {
        crosshairStore.set(undefined)
        paint.setCursor([], dragMode ?? selectionModeOfKeys())

        return
      }

      // the model of the player is a target too: the outline of the face behind it goes while the crosshair is on it
      if (playerUnderCrosshair()) {
        crosshairStore.set(undefined)
        paint.setCursor([], dragMode ?? selectionModeOfKeys())

        return
      }

      const index = pickPolygon(scene.camera, meshes(), level.triangleToPolygon)
      const mode = dragMode ?? selectionModeOfKeys()

      // a face of a group is locked: the crosshair shows the whole group, the way a click takes it
      if (index !== undefined && faceGroupOfFace(index) !== undefined) {
        const polygons = faceIndicesWithGroupsOf([index]).flatMap((face) => {
          const member = level.polygons[face]

          if (member === undefined) {
            return []
          }

          return [member]
        })

        paint.setCursor(polygons, mode)

        return
      }

      let polygon: ArxPolygon | undefined

      if (index !== undefined) {
        polygon = level.polygons[index]
      }

      // the widgets that describe a face (the inspector) read this, and only a change of the face wakes them up
      crosshairStore.set(index)

      let cursor: ArxPolygon[] = []

      if (polygon !== undefined) {
        cursor = [polygon]
      }

      paint.setCursor(cursor, mode)
    },
    updateDrag: (): void => {
      if (dragMode === undefined) {
        return
      }

      // the pointer is locked, so the mouse does not move the crosshair: the camera turns under it, and the face
      // under the middle of the canvas changes with the frames. This is the drag of the archived editor.
      selectUnderCrosshair()
    },
    updateHighlight: (): void => {
      const paint = overlay()

      if (paint === undefined) {
        return
      }

      // the base and the hint of the room color belong to the room map: it paints every face with the color of its
      // room, so the fill needs a gray base to keep that color out of the yellow, and a face keeps a hint of its room
      // under the mark (three selected rooms read as one patch of yellow without it). On the level the yellow is a tint
      // over the art, and the room color has no meaning there.
      let tintOf: ((polygon: ArxPolygon) => string | undefined) | undefined

      if (isRoomColorsVisible.value) {
        tintOf = context.roomColorOf
      }

      paint.setBackdrop(isRoomColorsVisible.value)
      // the faces of a group are the red ones, the free faces keep the yellow
      paint.setHighlight(selectedPolygons(), tintOf, inGroupOf(selectedGroupPolygons.value))
    },
  }
}
