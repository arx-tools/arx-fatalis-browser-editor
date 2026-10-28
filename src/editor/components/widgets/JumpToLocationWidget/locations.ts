import type { CameraPose } from '../cameraPose.ts'

/**
 * The id of the spawn target: the pose the editor starts with when the url carries no position.
 */
export const SPAWN_TARGET_ID = 'spawn'

/**
 * One point the camera can jump to.
 *
 * @remarks
 * The two kinds are what a target can do, not what it is: `spawn` asks the walkable view for its own
 * spawn (the same code the load uses), `pose` carries the game coordinates of a point. The list is an
 * array of these, so a new source of points is a new entry and nothing else.
 */
export type JumpTarget =
  | {
      /**
       * The kind of the target: the spawn of the level.
       */
      readonly kind: 'spawn'
      /**
       * The stable id, also the value of the `<option>`.
       */
      readonly id: string
      /**
       * The text of the `<option>`.
       */
      readonly label: string
    }
  | {
      /**
       * The kind of the target: a point in the game's coordinates.
       */
      readonly kind: 'pose'
      /**
       * The stable id, also the value of the `<option>`.
       */
      readonly id: string
      /**
       * The text of the `<option>`.
       */
      readonly label: string
      /**
       * Where the camera goes.
       */
      readonly pose: CameraPose
    }

/**
 * The part of the camera store a jump needs.
 *
 * @remarks
 * It is the two commands and nothing else, so the jump logic is tested with a stand-in and the widget
 * does not have to know the store.
 */
export interface JumpCamera {
  /**
   * Puts the camera to the spawn of the level.
   */
  readonly moveToSpawn: () => void
  /**
   * Moves the camera to a pose of the game's coordinates.
   *
   * @param pose The pose to set.
   */
  readonly moveCamera: (pose: CameraPose) => void
}

/**
 * The targets the select offers.
 *
 * @remarks
 * The list is an **array from the start**, even though it holds one entry today: a new source of points
 * is a new entry, not a rewrite of the widget. The sources that are still open (TODO 87):
 * - the entities of the DLF (the `human_base_0069` style instance scripts) of the loaded level
 * - the points the user drops on the level, kept in a persisted ref so they survive a reload
 *
 * @returns The targets, in the order the select shows them.
 */
export function jumpTargets(): JumpTarget[] {
  return [{ kind: 'spawn', id: SPAWN_TARGET_ID, label: 'Spawn' }]
}

/**
 * Moves the camera to one target.
 *
 * @param targets The targets the select offers.
 * @param targetId The id of the chosen target.
 * @param camera The camera the jump acts on.
 *
 * @returns `true` when the target was found and the camera moved.
 */
export function jumpTo(targets: readonly JumpTarget[], targetId: string, camera: JumpCamera): boolean {
  const target = targets.find((candidate) => {
    return candidate.id === targetId
  })

  if (target === undefined) {
    return false
  }

  if (target.kind === 'spawn') {
    camera.moveToSpawn()

    return true
  }

  camera.moveCamera(target.pose)

  return true
}
