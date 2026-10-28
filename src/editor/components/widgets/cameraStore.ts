import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import { isGameAngleInRange, type CameraPose } from './cameraPose.ts'
import { cameraAngle, cameraPosition } from './cameraState.ts'

/**
 * The 3D view the camera store talks to.
 *
 * @remarks
 * The camera belongs to the view (a `PerspectiveCamera` of three), not to the store: the store holds the
 * pose the widgets show and the commands they send, and the view translates both. That is why the view
 * registers a driver: a dock layout can throw the 3D widget away, and the camera controls widget has to
 * survive it (it shows the last pose and its fields go read only).
 */
export interface CameraDriver {
  /**
   * Moves the camera of the view.
   *
   * @param pose The pose to set, in the game's coordinates.
   */
  readonly applyPose: (pose: CameraPose) => void
  /**
   * Puts the camera to the spawn of the level.
   *
   * @remarks
   * The spawn is the pose the editor starts with when the url carries no position and no rotation, so it
   * is the view's own: the store does not rebuild it from the level.
   */
  readonly moveToSpawn: () => void
}

/**
 * The state of the camera the widgets share.
 */
export interface CameraStore {
  /**
   * Where the camera stands and looks, in the game's coordinates.
   *
   * @remarks
   * It is `undefined` until a view reports a pose, and it stays set after the view goes away (so the
   * form can show where the camera was).
   */
  readonly pose: ShallowRef<CameraPose | undefined>
  /**
   * Tells whether a 3D view is there to move.
   */
  readonly hasView: ComputedRef<boolean>
  /**
   * Takes the pose of a view.
   *
   * @param pose The pose the view reports.
   */
  readonly setPose: (pose: CameraPose) => void
  /**
   * Registers the view the commands go to, or drops it.
   *
   * @param driver The view, or `undefined` when it was disposed.
   */
  readonly setDriver: (driver: CameraDriver | undefined) => void
  /**
   * Moves the camera of the view, if there is one.
   *
   * @param pose The pose to set.
   */
  readonly moveCamera: (pose: CameraPose) => void
  /**
   * Jumps to the spawn of the level, if there is a view.
   */
  readonly moveToSpawn: () => void
}

/**
 * Reads the pose the url carries, so a shared link shows the numbers before the view mounts.
 *
 * @returns The pose of the url, or `undefined` when it does not hold a usable one.
 */
function storedPose(): CameraPose | undefined {
  const position = cameraPosition.value
  const angle = cameraAngle.value

  if (position === undefined || angle === undefined) {
    return undefined
  }

  const [x, y, z] = position
  const [pitch, yaw] = angle
  const gameAngle = { pitch, yaw }

  if (!isGameAngleInRange(gameAngle)) {
    return undefined
  }

  return { position: { x, y, z }, angle: gameAngle }
}

/**
 * Builds the camera store.
 *
 * @returns The state the camera controls widget and the 3D view share.
 */
export function createCameraStore(): CameraStore {
  const pose = shallowRef<CameraPose | undefined>(storedPose())
  const driver = shallowRef<CameraDriver>()

  return {
    pose,
    hasView: computed(() => {
      return driver.value !== undefined
    }),
    setPose: (next: CameraPose): void => {
      pose.value = next
    },
    setDriver: (next: CameraDriver | undefined): void => {
      driver.value = next
    },
    moveCamera: (next: CameraPose): void => {
      driver.value?.applyPose(next)
    },
    moveToSpawn: (): void => {
      driver.value?.moveToSpawn()
    },
  }
}

/**
 * The camera of the editor.
 *
 * @remarks
 * A module level singleton, for the same reason as the level store: a dock widget is its own Vue app, so
 * the widgets can not pass values down a component tree. The tests build their own with
 * {@link createCameraStore}.
 */
export const cameraStore: CameraStore = createCameraStore()
