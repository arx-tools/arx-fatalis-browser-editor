import type { ArxVector3 } from 'arx-convert/types'
import { MathUtils, Object3D, Quaternion, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { watch } from 'vue'
import { MIN_SCALE_FACTOR, type ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { commandOf } from '../../../modules/history/commands.ts'
import {
  createRotateFacesRecord,
  createScaleFacesRecord,
  createTranslateFacesRecord,
} from '../../../modules/history/records/faces.ts'
import { bumpLevelRevision, levelRevision, runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { rotateVisible, scaleVisible, transformVisible } from '../shared/editModes.ts'
import {
  rotationSnapDegrees,
  rotationSnapFor,
  snapEdgeEnabled,
  snapEnabled,
  snapModifierHeld,
  snapPlaneEnabled,
  snapVertexEnabled,
} from '../shared/snapping.ts'
import { createEdgeSnap, type EdgeSnap, type EdgeSnapResult } from './edgeSnap.ts'
import { createPlaneSnap, type PlaneSnap, type PlaneSnapResult } from './planeSnap.ts'
import { createVertexSnap, type VertexSnap, type VertexSnapResult } from './vertexSnap.ts'
import { selectionCenterOf } from './selectionCenter.ts'

/**
 * How long after a drag of the gizmo the canvas counts as the gizmo's, and not as a click that locks the camera.
 *
 * @remarks
 * The click of the canvas comes after the release of the pointer, so a drag is over by then: the window is what tells
 * the two apart without a flag that a drag (which may fire no click) would leave behind. A click of the gizmo that
 * moved nothing does not start the window, so the user can click the middle of the view to walk again.
 */
export const LOCK_GUARD_MS = 300

/**
 * The turn between the frame of the scene and the frame of the game.
 *
 * @remarks
 * The level is built with `M(x, y, z) = (-x, -y, z)` (see `arxVector3toVector3`), a half turn around Z. The compass of
 * the corner is turned by it so its triad shows the game's axes; the gizmo gets the same turn, so its arrows point the
 * way the compass and the coordinate readout do: the green Y down the game's Y, the red X the game's X.
 */
export const GAME_TURN = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI)

/**
 * The axis and the angle of a turn.
 */
export type TurnAxisAngle = {
  /**
   * The unit axis of the turn.
   */
  readonly axis: Vector3
  /**
   * The angle of the turn, in radians, in the 0..π range of the **shorter** way around.
   */
  readonly angle: number
}

/**
 * Reads the axis and the angle of a quaternion, the way a step stores a turn.
 *
 * @remarks
 * A quaternion says the same rotation in two ways (the axis and the angle, or the negated axis and the negative angle),
 * and the record of a step keeps the shorter one: the angle is taken in 0..π, and a quaternion with a negative half
 * angle flips its axis instead. A quaternion with no turn at all has no axis: the Z axis is the one it reports, with an
 * angle of zero, which is a step nobody makes.
 *
 * @param turn The turn to read.
 *
 * @returns The axis and the angle of it.
 */
export function turnAxisAngleOf(turn: Quaternion): TurnAxisAngle {
  let half = MathUtils.clamp(turn.w, -1, 1)
  let sign = 1

  if (half < 0) {
    half = -half
    sign = -1
  }

  const angle = 2 * Math.acos(MathUtils.clamp(half, -1, 1))
  const squared = half * half
  const sine = Math.sqrt(Math.max(0, 1 - squared))
  const axis = new Vector3(0, 0, sign)

  if (sine > 1e-6) {
    axis.set((sign * turn.x) / sine, (sign * turn.y) / sine, (sign * turn.z) / sine)
  }

  return { axis, angle }
}

/**
 * What the gizmo reads from the widget.
 */
export type SelectionGizmoOptions = {
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
export type SelectionGizmo = {
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
 * only object it moves, and the drag writes the corners of the selected faces from it. The axes are the **game's**, the
 * same frame the compass of the corner shows: the proxy stands turned by {@link GAME_TURN}, so the arrows point where
 * the readout and the url say (the green Y down the game's Y), and a drag moves the level the way the arrow points.
 *
 * The drag writes the model on every frame (the view follows it), and the step of the history goes on the stack when
 * the pointer is let go: the model is taken back to the start of the drag first, so the one command adds the whole
 * offset once. The middle of the selection is read again when the selection or the level changes; the gizmo is hidden
 * while nothing is selected or while the author hid it with `E` (`transformVisible`), and it can not be grabbed while
 * the camera holds the pointer (Escape releases it).
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
  // the proxy carries the frame of the game, so the gizmo of every mode turns with it
  controls.setSpace('local')

  // the step of the turn is a setting: 15 degrees by default, 45 while Shift is held. The gizmo reads it on every
  // press, so a change of the setting (or the key) needs no rebuild of the controls.
  /**
   * Writes the snap the gizmo uses now.
   */
  function applyRotationSnap(): void {
    controls.setRotationSnap(MathUtils.degToRad(rotationSnapFor(snapModifierHeld.value)))
  }

  applyRotationSnap()
  const stopSnapSetting = watch([rotationSnapDegrees, snapModifierHeld], applyRotationSnap)

  options.scene.add(helper)
  options.scene.add(proxy)

  let dragging = false
  let lastPress = Number.NEGATIVE_INFINITY
  let map: ArxMap | undefined
  let faces: number[] = []
  /**
   * Which gizmo the selection carries, or `undefined` when the author put both of them away with `E` and `Q`.
   */
  let mode: 'rotate' | 'scale' | 'translate' | undefined
  let startWorld = { x: 0, y: 0, z: 0 }
  let applied: ArxVector3 = { x: 0, y: 0, z: 0 }
  /**
   * The middle of the selection at the press, in the coordinates of the level: the point a turn turns around.
   */
  let pivot: ArxVector3 | undefined
  /**
   * The quaternion of the gizmo at the press, and the turn the model has taken since it.
   */
  let startQuaternion = new Quaternion()
  let appliedTurn = new Quaternion()
  /**
   * The scale the model has taken since the press.
   */
  let appliedScale: ArxVector3 = { x: 1, y: 1, z: 1 }
  /**
   * The snap of the translate drag, when it is on. The vertices are collected at the first frame that needs them.
   */
  let vertexSnap: VertexSnap | undefined
  /**
   * The edge rail of the translate drag: the face under a corner, and its edge along the drag.
   */
  let edgeSnap: EdgeSnap | undefined
  /**
   * The plane snap of the translate drag: the face a corner of the selection lands on.
   */
  let planeSnap: PlaneSnap | undefined
  /**
   * The move the model had taken when the snaps were built.
   *
   * @remarks
   * The snaps read the corners and the targets from the level **as it is when they are built**. A drag that starts
   * without the magnet builds them later, and the selection has already moved by then: the snaps have to see that
   * move taken out of the translation, or their sources would be one move ahead of the model and the snap would land
   * beside the plane (the case of 2026-11-21, Shift in the middle of a drag).
   */
  let snapStart: ArxVector3 = { x: 0, y: 0, z: 0 }

  /**
   * The gizmo the switches of the edit modes ask for, or `undefined` when neither is on.
   *
   * @remarks
   * The two modes are exclusive: `editModes.ts` puts the other one away when one comes on, so the order here only
   * decides which one a state with both of them on (a stored value of an older build) shows.
   *
   * @returns The mode of the gizmo.
   */
  function wantedMode(): 'rotate' | 'scale' | 'translate' | undefined {
    // the store keeps two of them apart, so a state with two of them on is not one this build makes: the order is what
    // an old value would fall back on
    if (rotateVisible.value) {
      return 'rotate'
    }

    if (scaleVisible.value) {
      return 'scale'
    }

    if (transformVisible.value) {
      return 'translate'
    }

    return undefined
  }

  /**
   * Reads the selection and puts the gizmo on the middle of its box.
   */
  function sync(): void {
    if (dragging) {
      return
    }

    map = levelStore.map.value
    faces = [...selectionStore.polygons.value]

    // the gizmos are tools of an edit: the author hides them with `E` and `Q`, and the selection stays as it is
    const wanted = wantedMode()

    if (wanted === undefined || map === undefined || faces.length === 0) {
      controls.detach()

      return
    }

    const center = selectionCenterOf(map, faces)

    if (center === undefined) {
      controls.detach()

      return
    }

    if (mode !== wanted) {
      controls.setMode(wanted)
      mode = wanted
    }

    const offset = arxVector3toVector3(map.scenePosition)
    const world = arxVector3toVector3(center).sub(offset)

    proxy.position.set(world.x, world.y, world.z)
    // a turn or a scale of the last drag left the proxy turned or sized, and the gizmo of the next one is read from it:
    // the proxy stands in the game's frame and in its own size between two drags
    proxy.quaternion.copy(GAME_TURN)
    proxy.scale.set(1, 1, 1)

    if (controls.object !== proxy) {
      controls.attach(proxy)
    }

    options.onRender()
  }

  /**
   * Whether the translate drag snaps to the vertices: the magnet, or Shift for the length of the drag.
   *
   * @returns True when the corner of the selection should take the nearest vertex.
   */
  function isSnapActive(): boolean {
    return snapEnabled.value || snapModifierHeld.value
  }

  /**
   * Puts the markers of the snaps away, except the one that won the frame.
   *
   * @param winner The snap whose marker stays, or `undefined` for none of them.
   */
  function hideSnapsExcept(winner: 'edge' | 'vertex' | 'plane' | undefined): void {
    if (winner !== 'edge') {
      edgeSnap?.hide()
    }

    if (winner !== 'vertex') {
      vertexSnap?.hide()
    }

    if (winner !== 'plane') {
      planeSnap?.hide()
    }
  }

  /**
   * Tells whether a snap would pull the selection against the drag.
   *
   * @remarks
   * A snap is there to bring the selection to a target the author is dragging it to: once the drag has gone past the
   * target, the correction points back, and holding the selection would fight the drag (a face lifted past a floor
   * stayed on it while the pointer kept going). Such a target is let go at once, so the selection passes it.
   *
   * @param correction The move the snap asks for, on the axes of the drag.
   * @param movement The translation of the drag since the snaps were built.
   *
   * @returns True when the correction runs against the drag.
   */
  function opposes(correction: ArxVector3, movement: ArxVector3): boolean {
    const x = correction.x * movement.x
    const y = correction.y * movement.y
    const z = correction.z * movement.z
    const dot = x + y + z
    const length = Math.abs(movement.x) + Math.abs(movement.y) + Math.abs(movement.z)

    // a drag that has not moved yet has no direction: every target is ahead of it
    if (length < 1e-6) {
      return false
    }

    return dot < 0
  }

  /**
   * Reads the correction of the snaps of a translate frame.
   *
   * @remarks
   * The edge rail wins when it has a target: the side of the selection rides on the edge of the level, and the vertex of
   * a corner would pull it off the rail on every frame (the zig-zag of a drag along the edge). The vertex is the target
   * when no edge is near, which is the precise snap of a corner. The plane snap is the last of the three: it lands a
   * corner on a face, which is the loose target of a drag toward a surface, and the two precise ones go before it. The
   * marker of the one that lost is put away.
   *
   * @param total The raw translation of the drag, in the coordinates of the level.
   *
   * @returns The correction to add to the translation.
   */
  function snapCorrectionOf(total: ArxVector3): ArxVector3 {
    const active = isSnapActive()
    let vertex: VertexSnapResult | undefined
    let edge: EdgeSnapResult | undefined
    let plane: PlaneSnapResult | undefined
    // the snaps were built from the level as it stood at `snapStart`: the move since then is the translation they read
    const sinceBuild: ArxVector3 = {
      x: total.x - snapStart.x,
      y: total.y - snapStart.y,
      z: total.z - snapStart.z,
    }

    if (edgeSnap !== undefined && active && snapEdgeEnabled.value) {
      edge = edgeSnap.snap(sinceBuild, controls.axis)
    }

    if (vertexSnap !== undefined && active && snapVertexEnabled.value) {
      vertex = vertexSnap.snap(sinceBuild, controls.axis)
    }

    if (planeSnap !== undefined && active && snapPlaneEnabled.value) {
      plane = planeSnap.snap(sinceBuild, controls.axis)
    }

    if (edge?.target !== undefined && !opposes(edge.correction, sinceBuild)) {
      hideSnapsExcept('edge')

      return edge.correction
    }

    if (vertex?.target !== undefined && !opposes(vertex.correction, sinceBuild)) {
      hideSnapsExcept('vertex')

      return vertex.correction
    }

    if (plane?.target !== undefined && !opposes(plane.correction, sinceBuild)) {
      hideSnapsExcept('plane')

      return plane.correction
    }

    hideSnapsExcept(undefined)

    return { x: 0, y: 0, z: 0 }
  }

  /**
   * Builds the snaps of the drag from the level the selection is on.
   *
   * @remarks
   * They are built on the first frame that needs them, not at the press: a drag that started before the magnet or Shift
   * was on has to snap too, and a drag that never snaps pays nothing for the targets of the level.
   */
  function startSnaps(): void {
    if (map === undefined || faces.length === 0) {
      return
    }

    snapStart = { x: applied.x, y: applied.y, z: applied.z }
    vertexSnap = createVertexSnap(map, faces, {
      camera: options.camera,
      canvas: options.canvas,
      scene: options.scene,
    })
    edgeSnap = createEdgeSnap(map, faces, {
      camera: options.camera,
      canvas: options.canvas,
      scene: options.scene,
    })
    planeSnap = createPlaneSnap(map, faces, {
      camera: options.camera,
      canvas: options.canvas,
      scene: options.scene,
    })
  }

  /**
   * Frees the snaps and their markers.
   */
  function stopSnaps(): void {
    vertexSnap?.dispose()
    vertexSnap = undefined
    edgeSnap?.dispose()
    edgeSnap = undefined
    planeSnap?.dispose()
    planeSnap = undefined
  }

  /**
   * Scales the selected faces by the scale the gizmo has taken since the press.
   *
   * @remarks
   * The proxy starts the drag in its own size, so its scale is the whole of the gesture: the faces take the factor of
   * it against the last frame (a step), the way a move takes the travel of the arrows. The factors are kept away from
   * zero (`MIN_SCALE_FACTOR` of `ArxMap`): a face turned into a line could not be undone, and the proxy is written back
   * to the clamped numbers so the gizmo shows what the faces do.
   */
  function scaleSelection(): void {
    if (map === undefined || pivot === undefined) {
      return
    }

    const total = {
      x: Math.max(MIN_SCALE_FACTOR, proxy.scale.x),
      y: Math.max(MIN_SCALE_FACTOR, proxy.scale.y),
      z: Math.max(MIN_SCALE_FACTOR, proxy.scale.z),
    }

    proxy.scale.set(total.x, total.y, total.z)

    const step = {
      x: total.x / appliedScale.x,
      y: total.y / appliedScale.y,
      z: total.z / appliedScale.z,
    }

    if (step.x === 1 && step.y === 1 && step.z === 1) {
      return
    }

    map.scalePolygons(faces, pivot, step)
    appliedScale = total
    lastPress = performance.now()
    bumpLevelRevision()
  }

  /**
   * Turns the selected faces by the turn the gizmo has taken since the press.
   *
   * @remarks
   * The rings turn the proxy, and the model follows by the **step** between this frame and the last one, the way a move
   * follows the travel of the arrows: a drag runs this on every frame, so the faces are turned in place and the geometry
   * is not built again. The turn is in the scene of the mesh, and the level takes it with the mirrored axis (the mirror
   * of the scene is a half turn around Z, so the angle stays).
   */
  function turnSelection(): void {
    if (map === undefined || pivot === undefined) {
      return
    }

    // the turn of the drag since the press: the proxy stands in the game's frame at the press, so the turn of it is
    // the delta of the world
    const total = proxy.quaternion.clone().multiply(startQuaternion.clone().invert())
    const step = total.clone().multiply(appliedTurn.clone().invert())

    if (Math.abs(step.w) > 1 - 1e-9) {
      return
    }

    const turn = turnAxisAngleOf(step)
    const axis = arxVector3toVector3(turn.axis)

    map.rotatePolygons(faces, pivot, { x: axis.x, y: axis.y, z: axis.z }, turn.angle)
    appliedTurn = total
    lastPress = performance.now()
    bumpLevelRevision()
  }

  /**
   * Moves the selected faces by what the gizmo did since the press, and snaps them.
   *
   * @remarks
   * The model follows the raw travel of the proxy plus the correction of the snap of this frame, so letting the snap go
   * takes the correction back instead of leaving the selection at the last snapped place.
   */
  function translateSelection(): void {
    if (map === undefined) {
      return
    }

    const world = {
      x: proxy.position.x - startWorld.x,
      y: proxy.position.y - startWorld.y,
      z: proxy.position.z - startWorld.z,
    }
    const total = arxVector3toVector3(world)

    if (vertexSnap === undefined && isSnapActive()) {
      startSnaps()
    }

    const correction = snapCorrectionOf(total)
    const snapped = { x: total.x + correction.x, y: total.y + correction.y, z: total.z + correction.z }
    const step = { x: snapped.x - applied.x, y: snapped.y - applied.y, z: snapped.z - applied.z }

    if (step.x === 0 && step.y === 0 && step.z === 0) {
      return
    }

    map.translatePolygons(faces, step)
    applied = snapped
    lastPress = performance.now()
    bumpLevelRevision()
  }

  /**
   * Moves or turns the selected faces by what the gizmo did since the press.
   */
  function onObjectChange(): void {
    if (!dragging || map === undefined) {
      return
    }

    if (mode === 'rotate') {
      turnSelection()

      return
    }

    if (mode === 'scale') {
      scaleSelection()

      return
    }

    translateSelection()
  }

  /**
   * Starts a drag: the faces, the point the gizmo stood on, and the state a turn is measured from.
   */
  function onMouseDown(): void {
    if (map === undefined || faces.length === 0) {
      return
    }

    dragging = true
    applied = { x: 0, y: 0, z: 0 }
    startWorld = { x: proxy.position.x, y: proxy.position.y, z: proxy.position.z }
    startQuaternion = proxy.quaternion.clone()
    appliedTurn = new Quaternion()
    appliedScale = { x: 1, y: 1, z: 1 }
    pivot = selectionCenterOf(map, faces)
  }

  /**
   * Ends a drag of the scale gizmo: the model goes back to where the press found it, and one step scales it once.
   *
   * @remarks
   * The same reason as the turn: a drag of the handles is a stream of small scales, and the step of the undo scales by
   * the inverse of the factors of the whole drag, so the faces have to stand where the press found them. A drag that
   * scaled nothing is a click of the view.
   */
  function endScaleDrag(): void {
    if (map === undefined || pivot === undefined) {
      return
    }

    if (appliedScale.x === 1 && appliedScale.y === 1 && appliedScale.z === 1) {
      return
    }

    lastPress = performance.now()

    const inverse = { x: 1 / appliedScale.x, y: 1 / appliedScale.y, z: 1 / appliedScale.z }

    map.scalePolygons(faces, pivot, inverse)

    const command = commandOf(createScaleFacesRecord(faces, pivot, appliedScale), map)

    if (command !== undefined) {
      runStep(command)
    }

    appliedScale = { x: 1, y: 1, z: 1 }
    sync()
  }

  /**
   * Ends a drag of the rotate gizmo: the model goes back to where the press found it, and one step turns it once.
   *
   * @remarks
   * A drag of the rings is a stream of small turns, and every one of them leaves the model a hair off the place it
   * started from: the undo of the step turns the faces by the axis and the angle of the whole drag, so the model has to
   * stand where the press found it before the step applies it. A drag that turned nothing is a click of the view.
   */
  function endTurnDrag(): void {
    if (map === undefined || pivot === undefined) {
      return
    }

    const turn = turnAxisAngleOf(appliedTurn)

    if (turn.angle === 0) {
      return
    }

    lastPress = performance.now()

    const axis = arxVector3toVector3(turn.axis)
    const levelAxis = { x: axis.x, y: axis.y, z: axis.z }

    map.rotatePolygons(faces, pivot, levelAxis, -turn.angle)

    const command = commandOf(createRotateFacesRecord(faces, pivot, levelAxis, turn.angle), map)

    if (command !== undefined) {
      runStep(command)
    }

    appliedTurn = new Quaternion()
    sync()
  }

  /**
   * Ends a drag: the model goes back to where the drag started, and the step adds the whole move or turn once.
   */
  function onMouseUp(): void {
    lastPress = performance.now()

    if (!dragging) {
      return
    }

    dragging = false
    stopSnaps()

    if (map === undefined) {
      return
    }

    if (mode === 'rotate') {
      endTurnDrag()

      return
    }

    if (mode === 'scale') {
      endScaleDrag()

      return
    }

    if (applied.x === 0 && applied.y === 0 && applied.z === 0) {
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

  const stop = watch(
    [levelStore.map, selectionStore.polygons, levelRevision, transformVisible, rotateVisible, scaleVisible],
    sync,
    { immediate: true },
  )

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
      stopSnapSetting()
      stopSnaps()
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
