import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import { MathUtils, Vector3 } from 'three'
import { boundaryLoopsOf, fittedQuadOf, resampleLoop, tunnelPolygonsOf } from '../../src/generator/tunnel.ts'

/**
 * A corner of a face, with the fields a face needs.
 *
 * @param point The position of the corner.
 *
 * @returns The corner of the test face.
 */
function vertexOf(point: ArxVector3): ArxPolygon['vertices'][number] {
  return { x: point.x, y: point.y, z: point.z, u: 0, v: 0, llfColorIdx: 0 }
}

/**
 * A quad from its perimeter corners.
 *
 * @remarks
 * The four corners of an FTS quad are not a loop: the first two are one edge and the last two the opposite one, so the
 * perimeter is `0, 1, 3, 2` (see `meshes.ts`).
 *
 * @param corners The corners of the quad around its perimeter.
 * @param room The room of the face.
 *
 * @returns The face of the test.
 */
function quadOf(corners: readonly ArxVector3[], room = 17): ArxPolygon {
  return {
    vertices: [vertexOf(corners[0]), vertexOf(corners[1]), vertexOf(corners[3]), vertexOf(corners[2])],
    textureContainerId: 1,
    norm: { x: 1, y: 0, z: 0 },
    norm2: { x: 1, y: 0, z: 0 },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.Quad,
    room,
  }
}

/**
 * A triangle from its three corners.
 *
 * @remarks
 * An FTS triangle keeps a fourth corner in its record, and the game never reads it: a level stores a zero there. The
 * perimeter of the triangle is its three corners, and the fourth one must not reach the rim of a hole.
 *
 * @param corners The three corners of the triangle.
 *
 * @returns The face of the test.
 */
function triangleOf(corners: readonly ArxVector3[]): ArxPolygon {
  return {
    vertices: [vertexOf(corners[0]), vertexOf(corners[1]), vertexOf(corners[2]), vertexOf({ x: 0, y: 0, z: 0 })],
    textureContainerId: 1,
    norm: { x: 1, y: 0, z: 0 },
    norm2: { x: 1, y: 0, z: 0 },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.NoShadow,
    room: 17,
  }
}

/**
 * A unit square of the `x = 0` plane, walked around its perimeter.
 *
 * @param at The `x` of the square.
 *
 * @returns The four corners of the square.
 */
function squareAt(at: number): ArxVector3[] {
  return [
    { x: at, y: 0, z: 0 },
    { x: at, y: 1, z: 0 },
    { x: at, y: 1, z: 1 },
    { x: at, y: 0, z: 1 },
  ]
}

/**
 * The corners of a face around its perimeter.
 *
 * @param polygon The face to read.
 *
 * @returns The corners of the perimeter, in order.
 */
function perimeterOf(polygon: ArxPolygon): ArxVector3[] {
  const [a, b, c, d] = polygon.vertices

  return [a, b, d, c].map((vertex) => {
    return { x: vertex.x, y: vertex.y, z: vertex.z }
  })
}

/**
 * The distance of a point from a segment.
 *
 * @param point The point to measure.
 * @param one One end of the segment.
 * @param other The other end of the segment.
 *
 * @returns The distance, in game units.
 */
function distanceToSegment(point: ArxVector3, one: ArxVector3, other: ArxVector3): number {
  const at = new Vector3(point.x, point.y, point.z)
  const from = new Vector3(one.x, one.y, one.z)
  const to = new Vector3(other.x, other.y, other.z)
  const direction = to.clone().sub(from)
  const lengthSquared = direction.lengthSq()
  const ratio = MathUtils.clamp(at.clone().sub(from).dot(direction) / lengthSquared, 0, 1)

  return at.distanceTo(from.clone().add(direction.multiplyScalar(ratio)))
}

/**
 * The distance of a point from the perimeter of a rim.
 *
 * @param point The point to measure.
 * @param rim The corners of the rim.
 *
 * @returns The distance to the closest edge of the rim.
 */
function distanceToRim(point: ArxVector3, rim: readonly ArxVector3[]): number {
  let distance = Number.POSITIVE_INFINITY

  for (let index = 0; index < rim.length; index = index + 1) {
    distance = Math.min(distance, distanceToSegment(point, rim[index], rim[(index + 1) % rim.length]))
  }

  return distance
}

/**
 * Tells whether two positions are the same one.
 *
 * @param one A position.
 * @param other Another position.
 *
 * @returns True when the two are the same point of the level.
 */
function samePoint(one: ArxVector3, other: ArxVector3): boolean {
  return Math.abs(one.x - other.x) < 1e-9 && Math.abs(one.y - other.y) < 1e-9 && Math.abs(one.z - other.z) < 1e-9
}

/**
 * The distance of a quad from the middle of its tube.
 *
 * @param polygon A quad of the tunnel.
 * @param axis The middle of the tube.
 *
 * @returns The dot product of the normal and the direction to the middle, so the inside is positive.
 */
function inwardnessOf(polygon: ArxPolygon, axis: ArxVector3): number {
  const perimeter = perimeterOf(polygon)
  const middle = new Vector3()

  for (const point of perimeter) {
    middle.add(new Vector3(point.x, point.y, point.z))
  }

  middle.divideScalar(perimeter.length)

  return new Vector3(polygon.norm.x, polygon.norm.y, polygon.norm.z).dot(
    new Vector3(axis.x, axis.y, axis.z).sub(middle),
  )
}

void describe('boundaryLoopsOf', () => {
  void it('chains the free edges of two faces that share one of them into one loop', () => {
    const quads = [
      quadOf([
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 0, y: 0, z: 1 },
      ]),
      quadOf([
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 2, z: 1 },
        { x: 0, y: 1, z: 1 },
      ]),
    ]

    const loops = boundaryLoopsOf(quads)

    assert.equal(loops.length, 1)
    assert.deepEqual(loops[0], [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 2, z: 1 },
      { x: 0, y: 1, z: 1 },
      { x: 0, y: 0, z: 1 },
    ])
  })

  void it('gives one loop per hole of a group', () => {
    const first = quadOf(squareAt(0))
    const other = quadOf(
      [
        { x: 0, y: 5, z: 0 },
        { x: 0, y: 6, z: 0 },
        { x: 0, y: 6, z: 1 },
        { x: 0, y: 5, z: 1 },
      ],
      26,
    )

    const loops = boundaryLoopsOf([first, other])

    assert.equal(loops.length, 2)
    assert.deepEqual(
      loops.map((loop) => {
        return loop.length
      }),
      [4, 4],
    )
  })

  void it('leaves the unused fourth corner of a triangle out', () => {
    const triangle = triangleOf([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 0, y: 0, z: 2 },
    ])

    assert.deepEqual(boundaryLoopsOf([triangle]), [
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 0, z: 2 },
      ],
    ])
  })

  void it('reads no loop from no face', () => {
    assert.deepEqual(boundaryLoopsOf([]), [])
  })
})

void describe('fittedQuadOf', () => {
  void it('fits the square of a flat rim', () => {
    const rim = squareAt(0)
    const quad = fittedQuadOf(rim)
    const expected = rim
      .map((point) => {
        return `${point.x},${point.y},${point.z}`
      })
      .toSorted()
    const actual = quad.corners
      .map((point) => {
        return `${point.x},${point.y},${point.z}`
      })
      .toSorted()

    assert.deepEqual(actual, expected)
    assert.ok(Math.abs(Math.abs(quad.normal.x) - 1) < 1e-9)
    assert.ok(Math.abs(quad.center.y - 0.5) < 1e-9)
    assert.ok(Math.abs(quad.center.z - 0.5) < 1e-9)
  })

  void it('puts the corners on the best plane of a rim that is not flat', () => {
    const rim = squareAt(0).map((point) => {
      return { x: point.x + 0.4, y: point.y, z: point.z }
    })
    const quad = fittedQuadOf(rim)
    const normal = new Vector3(quad.normal.x, quad.normal.y, quad.normal.z)
    const offsets = quad.corners.map((corner) => {
      return new Vector3(corner.x - quad.center.x, corner.y - quad.center.y, corner.z - quad.center.z).dot(normal)
    })

    assert.equal(quad.corners.length, 4)
    assert.ok(
      offsets.every((offset) => {
        return Math.abs(offset) < 1e-9
      }),
    )
    assert.ok(Math.abs(Math.hypot(quad.normal.x, quad.normal.y, quad.normal.z) - 1) < 1e-9)
  })
})

void describe('resampleLoop', () => {
  void it('keeps the points of a loop that already has the count', () => {
    const rim = squareAt(0)

    assert.deepEqual(resampleLoop(rim, 4), rim)
  })

  void it('spreads the points of a rim along its perimeter', () => {
    const rim = squareAt(0)
    const resampled = resampleLoop(rim, 7)
    const onRim = resampled.map((point) => {
      return distanceToRim(point, rim) < 1e-9
    })

    assert.equal(resampled.length, 7)
    assert.deepEqual(resampled[0], rim[0])
    assert.ok(onRim.every(Boolean))
  })
})

void describe('tunnelPolygonsOf', () => {
  void it('builds one quad for every corner of two rims of the same count', () => {
    const from = squareAt(0)
    const to = squareAt(10)
    const polygons = tunnelPolygonsOf({ from, to, textureContainerId: 3, room: 27, lightingBase: 10 })

    assert.equal(polygons.length, 4)
    assert.deepEqual(
      polygons.map((polygon) => {
        return [polygon.room, polygon.textureContainerId, polygon.transval, polygon.flags & ArxPolygonFlags.Quad]
      }),
      [
        [27, 3, 0, ArxPolygonFlags.Quad],
        [27, 3, 0, ArxPolygonFlags.Quad],
        [27, 3, 0, ArxPolygonFlags.Quad],
        [27, 3, 0, ArxPolygonFlags.Quad],
      ],
    )
    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.vertices.map((vertex) => {
          return vertex.llfColorIdx
        })
      }),
      [
        [10, 11, 12, 13],
        [10, 11, 12, 13],
        [10, 11, 12, 13],
        [10, 11, 12, 13],
      ],
    )
    // a side of a unit tube ten units long
    assert.ok(
      polygons.every((polygon) => {
        return Math.abs(polygon.area - 10) < 1e-9
      }),
    )
  })

  void it('turns the quads toward the inside of the tube', () => {
    const from = squareAt(0)
    const to = squareAt(10)
    const axis = { x: 5, y: 0.5, z: 0.5 }
    const polygons = tunnelPolygonsOf({ from, to, textureContainerId: 3, room: 27, lightingBase: 0 })

    assert.ok(
      polygons.every((polygon) => {
        return inwardnessOf(polygon, axis) > 0
      }),
    )
    // the two triangles of the quad turn the same way
    assert.ok(
      polygons.every((polygon) => {
        return (
          new Vector3(polygon.norm.x, polygon.norm.y, polygon.norm.z).dot(
            new Vector3(polygon.norm2.x, polygon.norm2.y, polygon.norm2.z),
          ) > 0.999
        )
      }),
    )
  })

  void it('pairs a rim of four corners with a rim of six', () => {
    const from = squareAt(0)
    const to = Array.from({ length: 6 }, (_unused, index) => {
      const angle = (Math.PI * index) / 3
      const radiusY = 0.5 * Math.cos(angle)
      const radiusZ = 0.5 * Math.sin(angle)

      return { x: 10, y: 0.5 + radiusY, z: 0.5 + radiusZ }
    })
    const polygons = tunnelPolygonsOf({ from, to, textureContainerId: 3, room: 27, lightingBase: 0 })
    const corners = polygons.flatMap(perimeterOf)
    const onTheSquare = corners
      .filter((corner) => {
        return corner.x === 0
      })
      .map((corner) => {
        return distanceToRim(corner, from) < 1e-9
      })

    assert.equal(polygons.length, 6)
    // the rim with fewer corners is read along its own edges: every point of it is on the square
    assert.ok(onTheSquare.every(Boolean))
    // the rim with more corners keeps all of its corners
    assert.ok(
      to.every((point) => {
        return corners.some((corner) => {
          return samePoint(corner, point)
        })
      }),
    )
  })

  void it('builds the same tube from rims that are walked the other way', () => {
    const from = squareAt(0)
    const to = squareAt(10).toReversed()
    const axis = { x: 5, y: 0.5, z: 0.5 }
    const polygons = tunnelPolygonsOf({ from, to, textureContainerId: 3, room: 27, lightingBase: 0 })

    assert.equal(polygons.length, 4)
    assert.ok(
      polygons.every((polygon) => {
        return inwardnessOf(polygon, axis) > 0
      }),
    )
  })

  void it('makes a closed strip around the rims', () => {
    const from = squareAt(0)
    const to = squareAt(10)
    const polygons = tunnelPolygonsOf({ from, to, textureContainerId: 3, room: 27, lightingBase: 0 })
    const edges = new Map<string, number>()

    for (const polygon of polygons) {
      const perimeter = perimeterOf(polygon)

      for (let index = 0; index < perimeter.length; index = index + 1) {
        const one = perimeter[index]
        const other = perimeter[(index + 1) % perimeter.length]
        const first = `${one.x},${one.y},${one.z}`
        const second = `${other.x},${other.y},${other.z}`
        let key = `${second}|${first}`

        if (first < second) {
          key = `${first}|${second}`
        }

        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }

    const counts = edges.values().toArray()

    // a side of the tube belongs to two quads, and the two rims belong to one
    assert.equal(
      counts.filter((count) => {
        return count === 2
      }).length,
      4,
    )
    assert.equal(
      counts.filter((count) => {
        return count === 1
      }).length,
      8,
    )
  })
})
