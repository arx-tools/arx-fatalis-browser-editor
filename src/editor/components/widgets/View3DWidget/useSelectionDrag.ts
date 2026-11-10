import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import type { PerspectiveCamera, Mesh } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { usedVerticesOf } from '../../../../generator/polygons.ts'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
import { isKeyDown } from '../../../modules/keyboard/keyboard.ts'
import { fillAreaOf, type SelectionFill } from '../../../modules/selection/fillArea.ts'
import { selectionModeOf, selectionStore, type SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { isRoomColorsVisible } from '../shared/levelDisplay.ts'
import type { ViewScene } from '../shared/viewScene.ts'
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
export interface SelectionDragContext {
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
   * The overlay that draws the crosshair outline and the fill of the selection.
   *
   * @returns The overlay, or `undefined` while there is no level.
   */
  readonly overlay: () => PolygonSelectionOverlay | undefined
  /**
   * The camera controls of the view: the gesture only runs under the pointer lock.
   *
   * @returns The controls, or `undefined` before the level arrived.
   */
  readonly controls: () => CameraControls | undefined
  /**
   * The colour of the room of a face, on the room map.
   *
   * @param polygon The face to read.
   *
   * @returns The colour the room map paints the room of the face with, or `undefined` for a face without a room.
   */
  readonly roomColorOf: (polygon: ArxPolygon) => string | undefined
}

/**
 * The handlers the widget binds.
 */
export interface SelectionDrag {
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
 * Builds the selection gesture of the walkable view.
 *
 * @param context What the gesture reads from the view.
 *
 * @returns The handlers the widget binds.
 */
export function useSelectionDrag(context: SelectionDragContext): SelectionDrag {
  const { view, map, meshes, overlay, controls } = context

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
   * send a move for every key change, and the outline has to colour itself as the modifier changes.
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

      dragMode = selectionModeOf(event)
      dragVertices = []

      if (dragMode === 'replace') {
        selectionStore.clear()
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

      selectionStore.selectMany(area, selectionModeOf(event))
    },
    pickUnderCrosshair: (): void => {
      const scene = view()
      const level = map()
      const paint = overlay()

      if (scene === undefined || level === undefined || paint === undefined) {
        return
      }

      const index = pickPolygon(scene.camera, meshes(), level.triangleToPolygon)
      let polygon: ArxPolygon | undefined

      if (index !== undefined) {
        polygon = level.polygons[index]
      }

      // the widgets that describe a face (the inspector) read this, and only a change of the face wakes them up
      crosshairStore.set(index)
      paint.setCursor(polygon, dragMode ?? selectionModeOfKeys())
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

      // the base and the hint of the room colour belong to the room map: it paints every face with the colour of its
      // room, so the fill needs a grey base to keep that colour out of the yellow, and a face keeps a hint of its room
      // under the mark (three selected rooms read as one patch of yellow without it). On the level the yellow is a tint
      // over the art, and the room colour has no meaning there.
      let tintOf: ((polygon: ArxPolygon) => string | undefined) | undefined

      if (isRoomColorsVisible.value) {
        tintOf = context.roomColorOf
      }

      paint.setBackdrop(isRoomColorsVisible.value)
      paint.setHighlight(selectedPolygons(), tintOf)
    },
  }
}
