import { MathUtils, Object3D, Quaternion, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { watch } from 'vue'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetSpawnRecord } from '../../../modules/history/records/spawn.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import {
  isPlayerSelected,
  PLAYER_MODEL_HEIGHT,
  playerSpawnOf,
  setPlayerSpawn,
  spawnRevision,
  type PlayerSpawn,
} from '../../../modules/level/entities/playerSpawn.ts'
import { rotateVisible, transformVisible } from '../shared/editModes.ts'
import { GAME_TURN, LOCK_GUARD_MS, turnAxisAngleOf } from './selectionGizmo.ts'

/**
 * The spawn of a level, moved by an offset of the world of the view.
 *
 * @remarks
 * The offset is the one of the drag in the world of the view, and the game's axes are the mirrored ones: a move of +X
 * on the screen takes the game's X the other way, and the Z is the same. The yaw stays: a move does not turn the player.
 *
 * @param spawn The spawn before the move, with the feet at the spawn.
 * @param offset The offset of the drag, in the world of the view.
 *
 * @returns The spawn after the move.
 */
export function movedSpawnOf(spawn: PlayerSpawn, offset: Vector3): PlayerSpawn {
  return {
    position: { x: spawn.position.x - offset.x, y: spawn.position.y - offset.y, z: spawn.position.z + offset.z },
    yaw: spawn.yaw,
  }
}

/**
 * The spawn of a level, turned around the vertical axis by a rotation of the world of the view.
 *
 * @remarks
 * The turn of the gizmo is a rotation of the view's world, and the yaw of the game is the rotation of the model around
 * the same vertical: the two are the same angle, and only the vertical part of the turn counts. The pitch and the roll
 * of the player are not edited, because the game zeroes the pitch on a load.
 *
 * @param spawn The spawn before the turn.
 * @param turn The rotation the gizmo applied to the proxy, in the world of the view.
 *
 * @returns The spawn after the turn.
 */
export function turnedSpawnOf(spawn: PlayerSpawn, turn: Quaternion): PlayerSpawn {
  const { axis, angle } = turnAxisAngleOf(turn)
  const degrees = MathUtils.radToDeg(axis.y * angle)

  return { position: { ...spawn.position }, yaw: spawn.yaw + degrees }
}

/**
 * Where the gizmo stands on the model: the middle of the height of the player, above its feet.
 */
const MODEL_MIDDLE = new Vector3(0, PLAYER_MODEL_HEIGHT / 2, 0)

/**
 * What the spawn gizmo reads from the widget.
 */
export type SpawnGizmoOptions = {
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
   * Asks the view for a frame, so a moved gizmo or a moved spawn is drawn.
   */
  readonly onRender: () => void
}

/**
 * The gizmo of the spawn of the player.
 */
export type SpawnGizmo = {
  /**
   * Turns the pointer of the gizmo on or off.
   *
   * @param enabled False while the camera holds the pointer (the gizmo is drawn, but can not be grabbed).
   */
  readonly setEnabled: (enabled: boolean) => void
  /**
   * Whether a click of the canvas may lock the camera.
   *
   * @returns False just after a drag of the gizmo, so the click that ends it does not lock the camera.
   */
  readonly canLock: () => boolean
  /**
   * Frees the gizmo and takes it out of the scene.
   */
  readonly dispose: () => void
}

/**
 * Builds the gizmo that moves and turns the spawn of the player in the 3D view.
 *
 * @remarks
 * The gizmo of three (`TransformControls`) is attached to a proxy at the **middle** of the model of the player, which is
 * where the author reads the spawn on the screen: the spawn itself is the feet, and the eye of the DLF is a player above
 * it. The proxy stands turned by
 * {@link GAME_TURN}, so the arrows point where the compass of the corner shows the game's axes; the rotate mode keeps
 * the vertical ring only, because the game turns the player around the vertical axis and zeroes the pitch.
 *
 * The drag writes the spawn on every frame (the model of the player follows it), and the step of the history goes on
 * the stack when the pointer is let go: the step holds the spawn of the press and the one of the release, so the undo
 * puts the place and the yaw back together. The gizmo is hidden while the player is not selected or while the author
 * put the gizmos away, and it can not be grabbed while the camera holds the pointer.
 *
 * @param options What the gizmo reads from the widget.
 *
 * @returns The handle of the gizmo: the lock switch, the lock guard and the dispose.
 */
export function createSpawnGizmo(options: SpawnGizmoOptions): SpawnGizmo {
  const controls = new TransformControls(options.camera, options.canvas)
  const proxy = new Object3D()
  const helper = controls.getHelper()

  controls.setMode('translate')
  controls.setSpace('local')

  options.scene.add(helper)
  options.scene.add(proxy)

  let dragging = false
  let lastPress = Number.NEGATIVE_INFINITY
  /**
   * What the gizmo does now: the place of the spawn, or the yaw of the player.
   */
  let mode: 'rotate' | 'translate' | undefined
  const startWorld = new Vector3()
  const startTurn = new Quaternion()
  const turn = new Quaternion()
  /**
   * The spawn of the press, with a position of its own: the live write moves the level, and the step needs the spawn
   * the press found.
   */
  let startSpawn: PlayerSpawn | undefined

  /**
   * The mode the gizmo takes from the switches of the edit, or `undefined` when none of them is on.
   *
   * @returns The mode of the gizmo.
   */
  function wantedMode(): 'rotate' | 'translate' | undefined {
    if (rotateVisible.value) {
      return 'rotate'
    }

    if (transformVisible.value) {
      return 'translate'
    }

    return undefined
  }

  /**
   * Puts the gizmo on the spawn, or takes it away when the player is not selected.
   */
  function sync(): void {
    if (dragging) {
      return
    }

    const map = levelStore.map.value
    const wanted = wantedMode()

    if (map === undefined || wanted === undefined || !isPlayerSelected.value) {
      controls.detach()

      return
    }

    if (mode !== wanted) {
      controls.setMode(wanted)
      mode = wanted
      // the player turns around the vertical axis only: the game zeroes the pitch, and a roll is not an angle of it
      controls.showX = wanted !== 'rotate'
      controls.showZ = wanted !== 'rotate'
    }

    const spawn = playerSpawnOf(map)

    // the middle of the model, not the feet: the spawn is edited where the player is on the screen, the way the gizmo of
    // a light stands at the light
    proxy.position.copy(arxVector3toVector3(spawn.position)).add(MODEL_MIDDLE)
    // the frame of the game is the same on every drag: the gizmo reads it between two drags
    proxy.quaternion.copy(GAME_TURN)
    proxy.scale.set(1, 1, 1)

    if (controls.object !== proxy) {
      controls.attach(proxy)
    }

    options.onRender()
  }

  /**
   * Starts a drag: the spawn of the press, and the frame of the gizmo.
   */
  function onMouseDown(): void {
    const map = levelStore.map.value

    if (map === undefined) {
      return
    }

    dragging = true
    startSpawn = playerSpawnOf(map)
    startWorld.copy(proxy.position)
    startTurn.copy(proxy.quaternion)
  }

  /**
   * Writes the spawn on every frame of the drag, so the model of the player walks with the gizmo.
   */
  function onObjectChange(): void {
    const map = levelStore.map.value

    if (!dragging || map === undefined || startSpawn === undefined) {
      return
    }

    if (mode === 'rotate') {
      turn.copy(proxy.quaternion).multiply(startTurn.clone().invert())
      setPlayerSpawn(map, turnedSpawnOf(startSpawn, turn))

      return
    }

    const offset = proxy.position.clone().sub(startWorld)

    setPlayerSpawn(map, movedSpawnOf(startSpawn, offset))
  }

  /**
   * Ends a drag: the spawn stays where it left it, and one step holds the whole move.
   *
   * @remarks
   * A drag that moved nothing is a click of the view. The step is the two snapshots of the spawn, so a redo writes the
   * one of the release even after the level was edited in between.
   */
  function onMouseUp(): void {
    lastPress = performance.now()

    if (!dragging) {
      return
    }

    dragging = false

    const map = levelStore.map.value
    const before = startSpawn

    startSpawn = undefined

    if (map === undefined || before === undefined) {
      sync()

      return
    }

    const after = playerSpawnOf(map)
    const changed =
      before.yaw !== after.yaw ||
      before.position.x !== after.position.x ||
      before.position.y !== after.position.y ||
      before.position.z !== after.position.z

    if (changed) {
      lastPress = performance.now()

      const command = commandOf(createSetSpawnRecord(before, after), map)

      if (command !== undefined) {
        runStep(command)
      }
    }

    sync()
  }

  const stop = watch([levelStore.map, isPlayerSelected, spawnRevision, transformVisible, rotateVisible], sync, {
    immediate: true,
  })

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
