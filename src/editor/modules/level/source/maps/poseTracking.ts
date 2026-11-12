import { watch } from 'vue'
import { cameraAngle, cameraPosition } from '../../../../components/widgets/camera/cameraState.ts'
import { writeMapPoses, type StoredPose, type StoredPoses } from './mapPoses.ts'

/**
 * How long the poses wait before they are written.
 *
 * @remarks
 * The camera reports its pose on every frame it moves, so the writes are collected and one write happens in this many
 * milliseconds, the same way the url takes the pose (`persistedRef` throttle).
 */
const POSE_WRITE_DELAY_IN_MS = 150

/**
 * The key of the pose the camera reports belong to.
 *
 * @remarks
 * The key is the one of the map that is on the screen, and it is set by the map that opened, never read from the map of
 * the editor: a level that is loading builds its camera before the value of the map changes, and a key read at that
 * moment would put the pose of the old map on the new level.
 */
let trackedKey: string | undefined

/**
 * Says which map the pose the camera reports belongs to.
 *
 * @param key The pose key of the map that is on the screen, or `undefined` when no map is.
 */
export function trackPoseOf(key: string | undefined): void {
  trackedKey = key
}

/**
 * Keeps the pose of each map in the browser, as the camera moves on it.
 *
 * @remarks
 * - a pose belongs to the map on the screen: while there is none (the notice of a link, a failed load) nothing is tracked
 * - the pose is written under the key it had when the camera reported it, so a waiting write lands on the map it came from
 * - the pose goes to the storage **only**: the url is the view of the visit, the storage is the memory of the maps
 * - undo and redo do not touch it: the camera is not part of the history
 *
 * @param write Where the poses go, the localStorage of the page by default.
 *
 * @returns A function that stops the tracking, which the tests use to start a clean one.
 */
export function startPoseTracking(write: (poses: StoredPoses) => void = writeMapPoses): () => void {
  const pending = new Map<string, StoredPose>()
  let timer: ReturnType<typeof setTimeout> | undefined

  /**
   * Writes the collected poses and empties the collection.
   */
  function flush(): void {
    timer = undefined

    if (pending.size === 0) {
      return
    }

    const poses = Object.fromEntries(pending)

    pending.clear()
    write(poses)
  }

  const stop = watch(
    [cameraPosition, cameraAngle],
    (): void => {
      if (trackedKey === undefined) {
        return
      }

      const position = cameraPosition.value
      const rotation = cameraAngle.value

      // the camera went to the spawn: the numbers are the level's own, and the pose this map had has nothing to say
      if (position === undefined || rotation === undefined) {
        pending.delete(trackedKey)

        return
      }

      pending.set(trackedKey, { position, rotation })

      if (timer !== undefined) {
        return
      }

      timer = setTimeout(flush, POSE_WRITE_DELAY_IN_MS)
    },
    { flush: 'sync' },
  )

  return (): void => {
    stop()

    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
}
