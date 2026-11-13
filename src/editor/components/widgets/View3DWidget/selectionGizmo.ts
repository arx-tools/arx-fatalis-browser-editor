import type { ArxVector3 } from 'arx-convert/types'
import { Object3D, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { watch } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { commandOf } from '../../../modules/history/commands.ts'
import { createTranslateFacesRecord } from '../../../modules/history/records.ts'
import { bumpLevelRevision, levelRevision, runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { selectionCenterOf } from './selectionCenter.ts'

/**
 * How long after a drag of the gizmo the canvas counts as the gizmo's, and not as a click that locks the camera.
 *
 * @remarks
 * The click of the canvas comes after the release of the pointer, so a drag is over by then: the window is what tells
 * the two apart without a flag that a drag (which may fire no click) would leave behind. A click of the gizmo that
 * moved nothing does not start the window, so the user can click the middle of the view to walk again.
 */
const LOCK_GUARD_MS = 300

/**
 * What the gizmo reads from the widget.
 */
export interface SelectionGizmoOptions {
  /**
   * The scene the gizmo and its proxy go into.
   */
  readonly scene: Scene
  /**
   * The camera the gizmo is drawn through.
   */
  readonly camera: Camera
  /**
   * The canvas the pointer events of the gizmo come from.
   */
  readonly canvas: HTMLCanvasElement
  /**
   * Asks the view for a frame, so a moved gizmo or a dragged selection is drawn.
   */
  readonly onRender: () => void
}

/**
 * The move gizmo of the selection.
 */
export interface SelectionGizmo {
  /**
   * Turns the pointer of the gizmo on or off.
   *
   * @param enabled False while the camera holds the pointer (the gizmo is drawn, but can not be grabbed).
   */
  readonly setEnabled: (enabled: boolean) => void
  /**
   * Whether a click of the canvas may lock the camera.
   *
   * @returns False just after a drag of the gizmo, so the click that ends it does not lock the camera. A plain click
   * on the gizmo (one that moved nothing) is a click of the view, and it locks.
   */
  readonly canLock: () => boolean
  /**
   * Frees the gizmo and takes it out of the scene.
   */
  readonly dispose: () => void
}

/**
 * Builds the gizmo that moves the selected faces along the three axes of the scene.
 *
 * @remarks
 * The gizmo of three (`TransformControls`) is attached to a proxy at the **middle of the selection**; the proxy is the
 * only object it moves, and the drag writes the corners of the selected faces from it. The axes are the **world** ones
 * of the scene (green Y up, red X and blue Z), not the mirrored axes of the Arx compass: the move reads the screen the
 * way the level is drawn.
 *
 * The drag writes the model on every frame (the view follows it), and the step of the history goes on the stack when
 * the pointer is let go: the model is taken back to the start of the drag first, so the one command adds the whole
 * offset once. The middle of the selection is read again when the selection or the level changes; the gizmo is hidden
 * while nothing is selected, and it can not be grabbed while the camera holds the pointer (Escape releases it).
 *
 * @param options What the gizmo reads from the widget.
 *
 * @returns The handle of the gizmo: the lock switch, the lock guard and the dispose.
 */
export function createSelectionGizmo(options: SelectionGizmoOptions): SelectionGizmo {
  const controls = new TransformControls(options.camera, options.canvas)
  const proxy = new Object3D()
  const helper = controls.getHelper()

  controls.setMode('translate')
  controls.setSpace('world')
  options.scene.add(helper)
  options.scene.add(proxy)

  let dragging = false
  let lastPress = Number.NEGATIVE_INFINITY
  let map: ArxMap | undefined
  let faces: number[] = []
  let startWorld = { x: 0, y: 0, z: 0 }
  let applied: ArxVector3 = { x: 0, y: 0, z: 0 }

  /**
   * Reads the selection and puts the gizmo on the middle of its box.
   */
  function sync(): void {
    if (dragging) {
      return
    }

    map = levelStore.map.value
    faces = [...selectionStore.polygons.value]

    if (map === undefined || faces.length === 0) {
      controls.detach()

      return
    }

    const center = selectionCenterOf(map, faces)

    if (center === undefined) {
      controls.detach()

      return
    }

    const offset = arxVector3toVector3(map.scenePosition)
    const world = arxVector3toVector3(center).sub(offset)

    proxy.position.set(world.x, world.y, world.z)

    if (controls.object !== proxy) {
      controls.attach(proxy)
    }

    options.onRender()
  }

  /**
   * Moves the selected faces by the offset the gizmo travelled since the press.
   */
  function onObjectChange(): void {
    if (!dragging || map === undefined) {
      return
    }

    const world = {
      x: proxy.position.x - startWorld.x,
      y: proxy.position.y - startWorld.y,
      z: proxy.position.z - startWorld.z,
    }
    const total = arxVector3toVector3(world)
    const step = { x: total.x - applied.x, y: total.y - applied.y, z: total.z - applied.z }

    if (step.x === 0 && step.y === 0 && step.z === 0) {
      return
    }

    map.translatePolygons(faces, step)
    applied = total
    lastPress = performance.now()
    bumpLevelRevision()
  }

  /**
   * Starts a drag: the faces and the point the gizmo stood on.
   */
  function onMouseDown(): void {
    if (map === undefined || faces.length === 0) {
      return
    }

    dragging = true
    applied = { x: 0, y: 0, z: 0 }
    startWorld = { x: proxy.position.x, y: proxy.position.y, z: proxy.position.z }
  }

  /**
   * Ends a drag: the model goes back to where the drag started, and the step adds the whole offset once.
   */
  function onMouseUp(): void {
    lastPress = performance.now()

    if (!dragging) {
      return
    }

    dragging = false

    if (map === undefined || (applied.x === 0 && applied.y === 0 && applied.z === 0)) {
      // a click on the gizmo that moved nothing is a click of the view: it may lock the camera
      return
    }

    lastPress = performance.now()

    const total = applied
    const back = { x: -total.x, y: -total.y, z: -total.z }

    map.translatePolygons(faces, back)

    const command = commandOf(createTranslateFacesRecord(faces, total), map)

    if (command !== undefined) {
      runStep(command)
    }

    applied = { x: 0, y: 0, z: 0 }
    sync()
  }

  const stop = watch([levelStore.map, selectionStore.polygons, levelRevision], sync, { immediate: true })

  controls.addEventListener('change', options.onRender)
  controls.addEventListener('objectChange', onObjectChange)
  controls.addEventListener('mouseDown', onMouseDown)
  controls.addEventListener('mouseUp', onMouseUp)

  return {
    setEnabled: (enabled: boolean): void => {
      controls.enabled = enabled
    },
    canLock: (): boolean => {
      return performance.now() - lastPress > LOCK_GUARD_MS
    },
    dispose: (): void => {
      stop()
      controls.removeEventListener('change', options.onRender)
      controls.removeEventListener('objectChange', onObjectChange)
      controls.removeEventListener('mouseDown', onMouseDown)
      controls.removeEventListener('mouseUp', onMouseUp)
      controls.detach()
      controls.dispose()
      options.scene.remove(helper)
      options.scene.remove(proxy)
    },
  }
}
