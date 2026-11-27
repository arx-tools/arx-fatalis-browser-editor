import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import {
  SURFACE_SAMPLE,
  anchorOfPoint,
  isOnView,
  nearestSurfaceIndexOf,
  pointOfAnchor,
  surfaceCandidatesOf,
  surfaceOf,
} from '../../../../../src/editor/components/widgets/View3DWidget/gizmoPlace.ts'

/**
 * Builds a face of the test, in the coordinates of the level.
 *
 * @param corners The corners, in the order of the polygon.
 * @param quad Whether the face is a quad (the fourth corner is used) or a triangle.
 *
 * @returns The face with those corners and that shape.
 */
function faceOf(corners: ReadonlyArray<readonly [number, number, number]>, quad: boolean): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (quad) {
    flags = ArxPolygonFlags.Quad
  }

  return {
    vertices: corners.map(([x, y, z]) => {
      return { x, y, z, u: 0, v: 0 }
    }),
    flags,
  } as unknown as ArxPolygon
}

/**
 * Builds a level of the test from its faces.
 *
 * @param faces The faces it has.
 *
 * @returns The level, ready to be read.
 */
function levelOf(faces: readonly ArxPolygon[]): ArxMap {
  return { polygons: faces } as unknown as ArxMap
}

/**
 * The faces of a selection of the tests: a quad and a triangle.
 *
 * @remarks
 * The quad is written in the order the game keeps one: `a, b, c, d` with the diagonal `b-c`, so the shape walks
 * `a, b, d, c` around it. Its triangles are (a, b, c) and (c, b, d).
 *
 * @returns The two faces, in the coordinates of the level.
 */
function twoFaces(): ArxPolygon[] {
  return [
    // the rectangle of (0, 0, 0) to (2, 0, 4)
    faceOf(
      [
        [0, 0, 0],
        [2, 0, 0],
        [0, 0, 4],
        [2, 0, 4],
      ],
      true,
    ),
    // the middle is (10, 10, 10)
    faceOf(
      [
        [8, 8, 8],
        [12, 8, 12],
        [10, 14, 10],
      ],
      false,
    ),
  ]
}

/**
 * A camera with a perspective, looking at the origin from ten units away.
 *
 * @returns The camera the tests project through.
 */
function perspectiveOf(): Camera {
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000)

  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  return camera
}

/**
 * The points of a list, as one point per row.
 *
 * @param points The numbers of the buffer, three each.
 *
 * @returns The points of the test.
 */
function rowsOf(points: Float32Array): Vector3[] {
  const rows: Vector3[] = []

  for (let index = 0; index < points.length; index = index + 3) {
    rows.push(new Vector3(points[index] ?? 0, points[index + 1] ?? 0, points[index + 2] ?? 0))
  }

  return rows
}

/**
 * Tells whether two points are the same, up to the precision of a float.
 *
 * @param actual The point the code gave.
 * @param expected The point the test wants.
 */
function assertPoint(actual: Vector3 | undefined, expected: readonly number[]): void {
  assert.notStrictEqual(actual, undefined)

  if (actual === undefined) {
    return
  }

  const numbers = [actual.x, actual.y, actual.z]

  for (const [index, value] of expected.entries()) {
    const found = numbers[index] ?? 0

    assert.ok(Math.abs(found - value) < 1e-6, `coordinate ${String(index)} is ${String(found)}`)
  }
}

/**
 * Tells whether two lists of weights are the same, up to the precision of a float.
 *
 * @param actual The weights the code gave.
 * @param expected The weights the test wants.
 */
function assertWeights(actual: readonly number[] | undefined, expected: readonly number[]): void {
  assert.notStrictEqual(actual, undefined)

  if (actual === undefined) {
    return
  }

  assert.equal(actual.length, expected.length)

  for (const [index, value] of expected.entries()) {
    assert.ok(Math.abs((actual[index] ?? 0) - value) < 1e-6, `weight ${String(index)} is ${String(actual[index])}`)
  }
}

void describe('surfaceOf', () => {
  void it('reads the corners of every selected face, in the world', () => {
    const level = levelOf(twoFaces())
    const surface = surfaceOf(level, [0, 1], new Vector3())
    const rows = rowsOf(surface.points)
    const first = rows[0]
    const third = rows[2]
    const triangleFirst = rows[4]

    // four corners of the quad, three of the triangle
    assert.equal(rows.length, 7)
    assert.equal(surface.anchors.length, 7)
    // the level mirrors the corners on X and Y: the corner (0, 0, 0) is the world (0, 0, 0), the corner (0, 0, 4) is
    // the world (0, 0, 4)
    assertPoint(first, [0, 0, 0])
    assertPoint(third, [0, 0, 4])
    assertPoint(triangleFirst, [-8, -8, 8])
  })

  void it('anchors every point to the face and the share of its corners', () => {
    const level = levelOf(twoFaces())
    const surface = surfaceOf(level, [0, 1], new Vector3())
    const first = surface.anchors[0]
    const third = surface.anchors[2]
    const triangleFirst = surface.anchors[4]

    assert.notStrictEqual(first, undefined)
    assert.notStrictEqual(third, undefined)
    assert.notStrictEqual(triangleFirst, undefined)
    assert.equal(first.face, 0)
    assertWeights(first.weights, [1, 0, 0, 0])
    assertWeights(third.weights, [0, 0, 1, 0])
    assert.equal(triangleFirst.face, 1)
    assertWeights(triangleFirst.weights, [1, 0, 0])
  })

  void it('subtracts the scene position of the level', () => {
    const level = levelOf(twoFaces())
    const surface = surfaceOf(level, [0], new Vector3(5, 7, 11))
    const first = rowsOf(surface.points)[0]

    assert.equal(rowsOf(surface.points).length, 4)
    // the first corner of the quad
    assertPoint(first, [0 - 5, 0 - 7, 0 - 11])
  })

  void it('leaves a face that is not in the level out of the points', () => {
    const level = levelOf(twoFaces())
    const surface = surfaceOf(level, [0, 7], new Vector3())

    assert.equal(rowsOf(surface.points).length, 4)
    assert.equal(surface.anchors.length, 4)
    assert.equal(
      rowsOf(surface.points).every((row) => {
        return row.x >= -2 && row.x <= 0
      }),
      true,
    )
  })

  void it('samples a big selection down, and keeps every face of a small one', () => {
    const faces = Array.from({ length: 1000 }, () => {
      return faceOf(
        [
          [0, 0, 0],
          [2, 0, 0],
          [2, 0, 4],
          [0, 0, 4],
        ],
        true,
      )
    })
    const level = levelOf(faces)
    const every = surfaceOf(level, [0, 1], new Vector3())

    // a small selection keeps every point of every face of it: four corners of each
    assert.equal(every.points.length, 24)

    const sampled = surfaceOf(level, faces.keys().toArray(), new Vector3())

    assert.equal(sampled.points.length, SURFACE_SAMPLE * 3)
    assert.equal(sampled.anchors.length, SURFACE_SAMPLE)
    assert.equal(sampled.anchors[0]?.face, 0)
  })
})

void describe('nearestSurfaceIndexOf', () => {
  void it('takes the point nearest to the middle of the view', () => {
    const points = new Float32Array([
      // far to the right: on the view, but not where the author looks
      5, 0, 0,
      // the nearest one
      1, 0, 0,
    ])

    assert.equal(nearestSurfaceIndexOf(points, perspectiveOf()), 1)
  })

  void it('keeps the height of the crosshair, and takes the point beside it over one high on the mesh', () => {
    // a point near the middle of the view, but well above the line of the crosshair, and one beside the middle on it
    const points = new Float32Array([0.2, 0.6, 0, 2, 0, 0])

    assert.equal(nearestSurfaceIndexOf(points, perspectiveOf()), 1)
  })

  void it('takes a point near the line of the crosshair over a far one on it', () => {
    // a point a little above the line, near the middle, and one exactly on the line at the edge of the view
    const points = new Float32Array([0.2, 0.1, 0, 4.5, 0, 0])

    assert.equal(nearestSurfaceIndexOf(points, perspectiveOf()), 0)
  })

  void it('keeps the points off the view out of the choice', () => {
    const points = new Float32Array([
      // far past the edge of the canvas
      400, 0, 0,
      // behind the camera
      0, 0, 40,
      // the only one on the view
      2, 0, 0,
    ])

    assert.equal(nearestSurfaceIndexOf(points, perspectiveOf()), 2)
  })

  void it('gives no place when no point of the selection is on the view', () => {
    const points = new Float32Array([400, 0, 0, 0, 0, 40])

    assert.equal(nearestSurfaceIndexOf(points, perspectiveOf()), undefined)
  })

  void it('reads the same place through a flat camera', () => {
    const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    assert.equal(nearestSurfaceIndexOf(new Float32Array([0, 0, 0, 5, 5, 0]), camera), 0)
  })
})

void describe('surfaceCandidatesOf', () => {
  void it('lists the points in the order of their distance from the line of the crosshair', () => {
    const points = new Float32Array([
      // high on the mesh, near the middle of the view
      0.2, 0.6, 0,
      // beside the middle, on the line of the crosshair
      2, 0, 0,
      // further to the side, on the line too
      4, 0, 0,
    ])

    const candidates = surfaceCandidatesOf(points, perspectiveOf(), 3)

    assert.deepEqual(
      candidates.map((candidate) => {
        return candidate.index
      }),
      [1, 2, 0],
    )
  })

  void it('reads at most the number of points asked for', () => {
    const points = new Float32Array([0, 0, 0, 2, 0, 0, 4, 0, 0])

    const candidates = surfaceCandidatesOf(points, perspectiveOf(), 2)

    assert.equal(candidates.length, 2)
    assert.equal(candidates[0]?.index, 0)
  })

  void it('keeps the points off the view out of the list', () => {
    const points = new Float32Array([400, 0, 0, 2, 0, 0])

    const candidates = surfaceCandidatesOf(points, perspectiveOf(), 4)

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.index, 1)
  })
})

void describe('anchorOfPoint', () => {
  void it('reads a corner of a face as that corner', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    // the corner (2, 0, 0) of the level is the world (-2, 0, 0)
    const anchor = anchorOfPoint(new Vector3(-2, 0, 0), quad, 0, new Vector3())

    assert.notStrictEqual(anchor, undefined)
    assertWeights(anchor?.weights, [0, 1, 0, 0])
  })

  void it('reads a point inside the first triangle of a quad as the share of its corners', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    // the centroid of (a, b, c): (2/3, 0, 4/3) of the level, which is the world (-2/3, 0, 4/3)
    const anchor = anchorOfPoint(new Vector3(-2 / 3, 0, 4 / 3), quad, 0, new Vector3())

    assert.notStrictEqual(anchor, undefined)
    assertWeights(anchor?.weights, [1 / 3, 1 / 3, 1 / 3, 0])
  })

  void it('reads a point inside the other triangle of a quad as the share of its corners', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    // the centroid of (c, b, d): (4/3, 0, 8/3) of the level, which is the world (-4/3, 0, 8/3)
    const anchor = anchorOfPoint(new Vector3(-4 / 3, 0, 8 / 3), quad, 0, new Vector3())

    assert.notStrictEqual(anchor, undefined)
    assertWeights(anchor?.weights, [0, 1 / 3, 1 / 3, 1 / 3])
  })

  void it('reads a point of a triangle', () => {
    const [, triangle] = twoFaces()

    assert.notStrictEqual(triangle, undefined)
    // the middle (10, 10, 10) of the level is the world (-10, -10, 10)
    const anchor = anchorOfPoint(new Vector3(-10, -10, 10), triangle, 1, new Vector3())

    assert.notStrictEqual(anchor, undefined)
    assert.equal(anchor?.face, 1)
    assertWeights(anchor?.weights, [1 / 3, 1 / 3, 1 / 3])
  })

  void it('reads a point of a level that is not around the origin', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    // the corner (2, 0, 0) of the level, in a level whose scene position is (5, 7, 11): the world takes the mirrored
    // scene position off it, so the point is (-7, -7, -11)
    const anchor = anchorOfPoint(new Vector3(-7, -7, -11), quad, 0, new Vector3(5, 7, 11))

    assert.notStrictEqual(anchor, undefined)
    assertWeights(anchor?.weights, [0, 1, 0, 0])
  })

  void it('gives no anchor for a point off the face', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    // beside the quad, on its plane
    const anchor = anchorOfPoint(new Vector3(-3, 0, 2), quad, 0, new Vector3())

    assert.equal(anchor, undefined)
  })
})

void describe('pointOfAnchor', () => {
  void it('reads the point of a face the anchor asks for', () => {
    const level = levelOf(twoFaces())
    const anchor = { face: 0, weights: [0.5, 0.5, 0, 0] }
    // the middle of the a-b edge of the level: (1, 0, 0), which is the world (-1, 0, 0)
    const point = pointOfAnchor(anchor, level, new Vector3())

    assert.notStrictEqual(point, undefined)
    assertPoint(point, [-1, 0, 0])
  })

  void it('takes the point with the face when the level moves, which is the handle staying on the mesh', () => {
    const [quad] = twoFaces()

    assert.notStrictEqual(quad, undefined)
    const level = levelOf([quad])
    const anchor = { face: 0, weights: [0.25, 0.25, 0.25, 0.25] }
    const before = pointOfAnchor(anchor, level, new Vector3())

    for (const vertex of quad.vertices) {
      vertex.x = vertex.x + 10
    }

    const after = pointOfAnchor(anchor, level, new Vector3())

    assertPoint(before, [-1, 0, 2])
    // a step of ten units in the level is ten units in the world too, the mirror only turns the sign of the axis
    assertPoint(after, [-11, 0, 2])
  })
})

void describe('isOnView', () => {
  void it('sees a point of the middle, and not one far beside the view', () => {
    assert.equal(isOnView(new Vector3(0, 0, 0), perspectiveOf()), true)
    assert.equal(isOnView(new Vector3(400, 0, 0), perspectiveOf()), false)
  })
})
