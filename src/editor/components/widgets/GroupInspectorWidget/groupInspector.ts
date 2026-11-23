import type { ArxVector3 } from 'arx-convert/types'
import type { CameraPose } from '../camera/cameraPose.ts'
import { jumpDistanceOf, jumpPoseOf } from '../camera/jumpPose.ts'
import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * Where a group of faces is and how big it is.
 */
export type FaceGroupExtent = {
  /**
   * The middle of the group: the median of the centers of its faces, in the game's coordinates.
   */
  readonly center: ArxVector3
  /**
   * The typical size of the group: the median of the distances of its faces from the middle, in the units of the level.
   */
  readonly radius: number
}

/**
 * Reads the middle of a list of numbers.
 *
 * @param values The numbers; the list is not changed.
 *
 * @returns The middle value, or the average of the two middle ones.
 */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].toSorted((one, other) => {
    return one - other
  })
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * Reads where the faces of a group are and how big the group is.
 *
 * @remarks
 * The middle and the size are **medians** of the faces, not the box of the group: a group can hold a few faces far away
 * from the rest (the texture area of a double click reaches the surfaces that share the texture of the face, wherever
 * they are), and the box of such a group is a box in the empty space between them — the jump of the inspector went out
 * of the level with it (2026-11-18, the owner). The median stays in the cluster the group is mostly made of, and the
 * middle distance is the size of that cluster.
 *
 * @param map The level the faces are on.
 * @param indices The faces of the group, by their index in the level.
 *
 * @returns The middle and the size, or `undefined` when no face of the group is on the level.
 */
export function faceGroupExtentOf(map: ArxMap, indices: readonly number[]): FaceGroupExtent | undefined {
  const centers: ArxVector3[] = []

  for (const index of indices) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    let x = 0
    let y = 0
    let z = 0

    for (const vertex of polygon.vertices) {
      x = x + vertex.x
      y = y + vertex.y
      z = z + vertex.z
    }

    const count = polygon.vertices.length

    if (count > 0) {
      centers.push({ x: x / count, y: y / count, z: z / count })
    }
  }

  if (centers.length === 0) {
    return undefined
  }

  const center = {
    x: medianOf(
      centers.map((point) => {
        return point.x
      }),
    ),
    y: medianOf(
      centers.map((point) => {
        return point.y
      }),
    ),
    z: medianOf(
      centers.map((point) => {
        return point.z
      }),
    ),
  }
  const distances = centers.map((point) => {
    return Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z)
  })

  return { center, radius: medianOf(distances) }
}

/**
 * The pose of a camera that goes to a group: the middle of its box, from the distance of the size of the box.
 *
 * @remarks
 * A group of a few faces is looked at from close, a wall of the level from further: the distance follows the radius
 * ({@link jumpDistanceOf}), so the jump frames what the group is whatever the size. The angles of the camera stay, the
 * way the Light Inspector jumps to a light (2026-11-18, the owner).
 *
 * @param pose The pose the camera has.
 * @param extent The box of the group.
 *
 * @returns The pose the camera stands at after the jump.
 */
export function faceGroupJumpPoseOf(pose: CameraPose, extent: FaceGroupExtent): CameraPose {
  return jumpPoseOf(pose, extent.center, jumpDistanceOf(extent.radius))
}
