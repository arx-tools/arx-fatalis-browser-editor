import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import type { CameraBounds } from '../../../../src/editor/components/widgets/cameraBounds.ts'
import {
  alignPose,
  frustumOf,
  type CameraFrustum,
  type CameraViewMode,
} from '../../../../src/editor/components/widgets/FixedViewWidget/cameraAlign.ts'
import {
  applyGameAngle,
  gamePositionToWorld,
  setCameraPose,
  type CameraPose,
} from '../../../../src/editor/components/widgets/cameraPose.ts'

/**
 * The scene position of the test level.
 */
const scene: ArxVector3 = { x: 5250, y: 1225, z: 4350 }

/**
 * The field of view of the 3D widget.
 */
const fieldOfView = 75

/**
 * The aspect ratio of the canvas in the probe of the widget.
 */
const aspect = 1.157

/**
 * A 2000 x 800 x 2000 box: wide enough to cut off on the near side with a centre-distance heuristic.
 */
const bounds: CameraBounds = {
  min: { x: -1000, y: -200, z: -500 },
  max: { x: 1000, y: 600, z: 1500 },
}

/**
 * The frustum of that canvas.
 */
const frustum: CameraFrustum = {
  tanVertical: Math.tan((fieldOfView * Math.PI) / 360),
  tanHorizontal: Math.tan((fieldOfView * Math.PI) / 360) * aspect,
}

/**
 * The centre of {@link bounds}, in the game's coordinates.
 */
const centre: ArxVector3 = { x: 0, y: 200, z: 500 }

/**
 * The modes of the align row.
 */
const modes: readonly CameraViewMode[] = ['top', 'front', 'left', 'bottom', 'back', 'right']

/**
 * Reads the direction the camera of a pose looks to, in the three.js space.
 *
 * @param pose The pose to look from.
 *
 * @returns The normalized direction of the camera.
 */
function lookDirection(pose: CameraPose): Vector3 {
  const camera = new PerspectiveCamera(fieldOfView, aspect, 0.1, 1_000_000)

  setCameraPose(camera, scene, pose)
  camera.updateMatrixWorld()

  return camera.getWorldDirection(new Vector3())
}

/**
 * Measures how much a pose misses the centre of the box.
 *
 * @param pose The pose of a view.
 *
 * @returns The cosine between the view and the line to the centre, so `1` is a direct hit.
 */
function cosineToCentre(pose: CameraPose): number {
  const eye = gamePositionToWorld(pose.position, scene)
  const toCentre = gamePositionToWorld(centre, scene).sub(eye).normalize()

  return lookDirection(pose).dot(toCentre)
}

/**
 * Projects the corners of the box with the camera of a view.
 *
 * @param pose The pose of the view.
 *
 * @returns The corners in normalized device coordinates, where `1` is the edge of the frame.
 */
function projectedCorners(pose: CameraPose): Array<{ x: number; y: number }> {
  const camera = new PerspectiveCamera(fieldOfView, aspect, 0.1, 1_000_000)

  setCameraPose(camera, scene, pose)
  camera.updateMatrixWorld()

  const corners: Array<{ x: number; y: number }> = []

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = gamePositionToWorld({ x, y, z }, scene).project(camera)
        corners.push({ x: projected.x, y: projected.y })
      }
    }
  }

  return corners
}

void describe('alignPose', () => {
  void it('puts the top view above the centre, looking straight down', () => {
    const pose = alignPose('top', bounds, frustum)

    assert.equal(pose.position.x, centre.x)
    assert.equal(pose.position.z, centre.z)
    // the game's Y points down, so "above" is a smaller Y
    assert.ok(pose.position.y < centre.y)
    assert.deepEqual(pose.angle, { pitch: 90, yaw: 0 })
  })

  void it('puts the front view on the smaller Z, looking along the positive Z of the game', () => {
    const pose = alignPose('front', bounds, frustum)

    assert.equal(pose.position.x, centre.x)
    assert.equal(pose.position.y, centre.y)
    assert.ok(pose.position.z < centre.z)
    assert.deepEqual(pose.angle, { pitch: 0, yaw: 0 })
  })

  void it('puts the left view on the smaller X, looking at the centre', () => {
    const pose = alignPose('left', bounds, frustum)

    assert.ok(pose.position.x < centre.x)
    assert.equal(pose.position.y, centre.y)
    assert.equal(pose.position.z, centre.z)
    // 270 and not 90: the game mirrors X, so 90 would look away from the level (TODO 59)
    assert.deepEqual(pose.angle, { pitch: 0, yaw: 270 })
  })

  void it('puts the bottom view below the centre, looking straight up', () => {
    const pose = alignPose('bottom', bounds, frustum)

    assert.equal(pose.position.x, centre.x)
    assert.equal(pose.position.z, centre.z)
    // the game's Y points down, so "below" is a larger Y
    assert.ok(pose.position.y > centre.y)
    assert.deepEqual(pose.angle, { pitch: -90, yaw: 0 })
  })

  void it('puts the back view on the larger Z, looking along the negative Z of the game', () => {
    const pose = alignPose('back', bounds, frustum)

    assert.equal(pose.position.x, centre.x)
    assert.equal(pose.position.y, centre.y)
    assert.ok(pose.position.z > centre.z)
    assert.deepEqual(pose.angle, { pitch: 0, yaw: 180 })
  })

  void it('puts the right view on the larger X, looking at the centre', () => {
    const pose = alignPose('right', bounds, frustum)

    assert.ok(pose.position.x > centre.x)
    assert.equal(pose.position.y, centre.y)
    assert.equal(pose.position.z, centre.z)
    // the pair of the left view, a half turn away
    assert.deepEqual(pose.angle, { pitch: 0, yaw: 90 })
  })

  void it('keeps a minimum distance for a small level', () => {
    const small: CameraBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } }

    const pose = alignPose('top', small, frustum)

    assert.equal(pose.position.y, 50 - 400)
  })

  void it('frames every corner of the level in every view', () => {
    const misses = modes.flatMap((mode) => {
      return projectedCorners(alignPose(mode, bounds, frustum)).filter((corner) => {
        return Math.abs(corner.x) > 0.951 || Math.abs(corner.y) > 0.951
      })
    })

    assert.deepEqual(misses, [])
  })

  void it('uses the frame of a narrow canvas, not just the width of the level', () => {
    const narrow: CameraFrustum = { tanVertical: frustum.tanVertical, tanHorizontal: frustum.tanVertical / 2 }

    const pose = alignPose('front', bounds, narrow)
    const wide = alignPose('front', bounds, frustum)

    assert.ok(pose.position.z < wide.position.z)
  })

  void it('looks at the centre of the level in every view', () => {
    const misses = modes.filter((mode) => {
      // the dot product of two unit vectors is 1 when they point the same way
      return cosineToCentre(alignPose(mode, bounds, frustum)) <= 0.999
    })

    assert.deepEqual(misses, [])
  })

  void it('keeps every pair of the fixed views opposite each other', () => {
    const pairs: ReadonlyArray<readonly [CameraViewMode, CameraViewMode]> = [
      ['front', 'back'],
      ['left', 'right'],
      ['top', 'bottom'],
    ]

    const misses = pairs.filter(([first, second]) => {
      const a = alignPose(first, bounds, frustum)
      const b = alignPose(second, bounds, frustum)
      const between = new Vector3(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
      const way = new Vector3(centre.x - a.position.x, centre.y - a.position.y, centre.z - a.position.z)

      // the two cameras stand on the same line through the centre, on its two sides
      return between.normalize().dot(way.normalize()) < 0.999
    })

    assert.deepEqual(misses, [])
  })

  void it('keeps the roll at zero', () => {
    const rolls = modes.map((mode) => {
      const camera = new PerspectiveCamera(fieldOfView, aspect, 0.1, 1_000_000)

      setCameraPose(camera, scene, alignPose(mode, bounds, frustum))
      applyGameAngle(camera, alignPose(mode, bounds, frustum).angle)

      return Math.abs(camera.rotation.z)
    })

    assert.deepEqual(
      rolls.filter((roll) => {
        return roll > 1e-9
      }),
      [],
    )
  })
})

void describe('frustumOf', () => {
  void it('gives the tangent of the half angle', () => {
    const expectedVertical = Math.tan((75 * Math.PI) / 360)
    const expectedHorizontal = expectedVertical * 1.5
    const computed = frustumOf(75, 1.5)

    assert.ok(Math.abs(computed.tanVertical - expectedVertical) < 1e-12)
    assert.ok(Math.abs(computed.tanHorizontal - expectedHorizontal) < 1e-12)
  })

  void it('is the frustum the align covers the frame with', () => {
    assert.deepEqual(frustumOf(fieldOfView, aspect), frustum)
  })
})
