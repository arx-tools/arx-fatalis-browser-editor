import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { Vector3 } from 'three'
import type { ArxMap } from '../../../../../../src/generator/ArxMap.ts'
import { arxPolygonsToGeometry } from '../../../../../../src/generator/meshes.ts'
import {
  applyTemporaryUvsOf,
  planarUvsOf,
} from '../../../../../../src/editor/modules/level/edit/levelTextures/temporaryUvs.ts'

/**
 * Builds a face of the test from its four corners, all of them on the uv (0, 0).
 *
 * @param corners The four corners, in the order the level stores them.
 * @param normal The normal of its plane, which looks up the Y axis by default.
 *
 * @returns A quad with those corners and that normal (the `Quad` flag is what makes it a quad).
 *
 * @throws When the corners are not the four of a quad, which is a mistake of the test itself.
 */
function faceOf(
  corners: ReadonlyArray<Readonly<[number, number, number]>>,
  normal?: Readonly<{ x: number; y: number; z: number }>,
): ArxPolygon {
  const [a, b, c, d] = corners

  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error('a face of the test is a quad: four corners')
  }

  const stored = normal ?? { x: 0, y: -1, z: 0 }

  return {
    vertices: [a, b, c, d].map(([x, y, z]) => {
      return { x, y, z, u: 0, v: 0, llfColorIdx: 0 }
    }),
    flags: ArxPolygonFlags.Quad,
    norm: stored,
    norm2: stored,
    normals: [stored, stored, stored, stored],
    transval: 0,
    textureContainerId: 0,
    room: 1,
  } as unknown as ArxPolygon
}

/**
 * Builds a face of the test on the floor plane, at the origin.
 *
 * @param width Its side along the X axis.
 * @param depth Its side along the Z axis.
 *
 * @returns A quad of those sides, on the XZ plane.
 */
function floorOf(width: number, depth: number): ArxPolygon {
  const corners: Array<Readonly<[number, number, number]>> = [
    [0, 0, 0],
    [width, 0, 0],
    [width, 0, depth],
    [0, 0, depth],
  ]

  return faceOf(corners)
}

/**
 * Builds a face of the test on a wall plane, at the origin.
 *
 * @param width Its side along the X axis.
 * @param height Its side along the Y axis, downwards (the game's Y points down).
 *
 * @returns A quad of those sides, on the XY plane.
 */
function wallOf(width: number, height: number): ArxPolygon {
  const top = 0 - height
  const corners: Array<Readonly<[number, number, number]>> = [
    [0, 0, 0],
    [width, 0, 0],
    [width, top, 0],
    [0, top, 0],
  ]

  return faceOf(corners, { x: 0, y: 0, z: -1 })
}

/**
 * Moves a face of the test.
 *
 * @param face The face to move.
 * @param offset How far it goes on the three axes.
 *
 * @returns The face, moved.
 */
function movedBy(face: ArxPolygon, offset: Readonly<[number, number, number]>): ArxPolygon {
  const moved = face.vertices.map((vertex) => {
    return { ...vertex, x: vertex.x + offset[0], y: vertex.y + offset[1], z: vertex.z + offset[2] }
  })

  return { ...face, vertices: moved } as unknown as ArxPolygon
}

/**
 * Reads the span of the u or the v of some uvs.
 *
 * @param uvs The uvs to read.
 * @param part Which of the two to read.
 *
 * @returns The smallest and the largest value, in that order.
 */
function spanOf(uvs: ReadonlyArray<{ readonly u: number; readonly v: number }>, part: 'u' | 'v'): [number, number] {
  let smallest = Number.POSITIVE_INFINITY
  let largest = Number.NEGATIVE_INFINITY

  for (const uv of uvs) {
    smallest = Math.min(smallest, uv[part])
    largest = Math.max(largest, uv[part])
  }

  return [smallest, largest]
}

/**
 * Builds a level of the test: only the names of the containers are read.
 *
 * @param names The names of the containers, by the id a polygon points at.
 *
 * @returns A level that names those containers and nothing else.
 */
function levelOf(names: ReadonlyMap<number, string>): ArxMap {
  return {
    textureNameOf: (id: number): string | undefined => {
      return names.get(id)
    },
  } as unknown as ArxMap
}

void describe('planarUvsOf', () => {
  void it('lays a rectangle on the square of its plane, the longer side over the whole texture', () => {
    const uvs = planarUvsOf(floorOf(100, 50))

    assert.equal(uvs.length, 4)
    // the 100 long side takes the whole texture, the 50 long one the half of it
    assert.deepEqual(spanOf(uvs, 'v'), [0, 1])
    assert.deepEqual(spanOf(uvs, 'u'), [0, 0.5])
  })

  void it('lays a square on the whole texture', () => {
    const uvs = planarUvsOf(floorOf(50, 50))

    assert.deepEqual(spanOf(uvs, 'u'), [0, 1])
    assert.deepEqual(spanOf(uvs, 'v'), [0, 1])
  })

  void it('gives the same uvs wherever the face stands', () => {
    const one = planarUvsOf(floorOf(50, 50))
    const other = planarUvsOf(movedBy(floorOf(50, 50), [300, 400, -900]))

    assert.deepEqual(one, other)
  })

  void it('gives a wall the four corners of the texture', () => {
    const corners = planarUvsOf(wallOf(50, 50)).map((uv) => {
      return [uv.u, uv.v]
    })

    assert.deepEqual(
      corners.toSorted((one, other) => {
        if (one[0] !== other[0]) {
          return one[0] - other[0]
        }

        return one[1] - other[1]
      }),
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ],
    )
  })

  void it('gives the middle of the texture to a face without a plane', () => {
    const corners: Array<Readonly<[number, number, number]>> = [
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ]
    const uvs = planarUvsOf(faceOf(corners))

    assert.deepEqual(
      uvs.map((uv) => {
        return [uv.u, uv.v]
      }),
      [
        [0.5, 0.5],
        [0.5, 0.5],
        [0.5, 0.5],
        [0.5, 0.5],
      ],
    )
  })

  void it('falls back to the corners when the level stores no normal', () => {
    const face = floorOf(50, 50)
    const uvs = planarUvsOf({ ...face, norm: { x: 0, y: 0, z: 0 } })

    assert.deepEqual(spanOf(uvs, 'u'), [0, 1])
    assert.deepEqual(spanOf(uvs, 'v'), [0, 1])
  })
})

void describe('applyTemporaryUvsOf', () => {
  void it('writes the uvs of the faces without a texture, and leaves the others alone', () => {
    const textured = { ...floorOf(10, 10), textureContainerId: 7 }
    const bare = movedBy(floorOf(50, 50), [100, 0, 0])
    const polygons = [textured, bare]
    const geometry = arxPolygonsToGeometry(polygons, new Vector3(0, 0, 0))
    const attribute = geometry.getAttribute('uv')

    // the face the level has a container for keeps the uvs of the level (all of them on one corner of the texture)
    attribute.setXY(0, 0.25, 0.75)

    applyTemporaryUvsOf(levelOf(new Map([[7, 'a.bmp']])), polygons, geometry)

    assert.deepEqual([attribute.getX(0), attribute.getY(0)], [0.25, 0.75])

    // the bare face takes the square of its plane, on the six vertices of the quad
    const bareUvs = [6, 7, 8, 9, 10, 11].map((vertex) => {
      return [attribute.getX(vertex), attribute.getY(vertex)]
    })

    assert.deepEqual(bareUvs, [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
      [1, 1],
    ])
  })

  void it('leaves the uvs of the level on the face', () => {
    const bare = movedBy(floorOf(50, 50), [100, 0, 0])
    const geometry = arxPolygonsToGeometry([bare], new Vector3(0, 0, 0))

    applyTemporaryUvsOf(levelOf(new Map()), [bare], geometry)

    assert.deepEqual(
      bare.vertices.map((vertex) => {
        return [vertex.u, vertex.v]
      }),
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    )
  })
})
