import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { MAP_LIMIT, clippedToMapOf } from '../../src/generator/clipToMap.ts'

/**
 * Builds a face of the test, flat at zero.
 *
 * @param corners The corners of the shape, around it.
 * @param quad Whether the face is a quad (the fourth corner is used) or a triangle.
 *
 * @returns The face, with the uv of the corners and a normal that points down.
 */
function faceOf(corners: ReadonlyArray<readonly [number, number, number]>, quad: boolean): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (quad) {
    flags = ArxPolygonFlags.Quad
  }

  const vertices = corners.map(([x, y, z], index) => {
    return { x, y, z, u: index / 10, v: 0, llfColorIdx: index }
  })

  const down = { x: 0, y: -1, z: 0 }

  return {
    vertices: [vertices[0], vertices[1], vertices[2], vertices[3] ?? vertices[2]],
    textureContainerId: 7,
    norm: { ...down },
    norm2: { ...down },
    normals: [{ ...down }, { ...down }, { ...down }, { ...down }],
    transval: 0,
    area: 10_000,
    flags,
    room: 3,
  } as unknown as ArxPolygon
}

/**
 * Reads the corners of a face, as the X and the Z of each.
 *
 * @param polygon The face to read.
 *
 * @returns The X and the Z of its corners.
 */
function shapeOf(polygon: ArxPolygon): number[][] {
  return polygon.vertices.map((vertex) => {
    return [vertex.x, vertex.z]
  })
}

/**
 * Tells whether every corner of a face stands inside the map.
 *
 * @param polygon The face to read.
 *
 * @returns True when the face is inside the square of the map.
 */
function isInside(polygon: ArxPolygon): boolean {
  return polygon.vertices.every((vertex) => {
    return vertex.x >= 0 && vertex.x <= MAP_LIMIT && vertex.z >= 0 && vertex.z <= MAP_LIMIT
  })
}

void describe('clippedToMapOf', () => {
  void it('leaves a face that stands inside the map alone', () => {
    const face = faceOf(
      [
        [100, 0, 100],
        [200, 0, 100],
        [100, 0, 200],
        [200, 0, 200],
      ],
      true,
    )
    const clip = clippedToMapOf([face])

    assert.equal(clip.polygons.length, 1)
    assert.equal(clip.polygons[0], face)
    assert.equal(clip.clipped, 0)
    assert.equal(clip.dropped, 0)
  })

  void it('cuts the part of a face that stands past the origin, and keeps the rest', () => {
    // a quad from -100 to 100 on both axes: half of it stands outside the map
    const face = faceOf(
      [
        [-100, 0, -100],
        [100, 0, -100],
        [-100, 0, 100],
        [100, 0, 100],
      ],
      true,
    )
    const clip = clippedToMapOf([face])

    assert.equal(clip.clipped, 1)
    assert.equal(clip.dropped, 0)
    assert.ok(clip.polygons.length > 0)
    assert.ok(
      clip.polygons.every((polygon) => {
        return isInside(polygon)
      }),
    )
    // the area of the piece that is kept is the quarter of the face, and no corner stands past the origin
    const area = clip.polygons.reduce((sum, polygon) => {
      return sum + polygon.area
    }, 0)

    assert.ok(Math.abs(area - 10_000) < 1)
    assert.ok(
      clip.polygons.every((polygon) => {
        return shapeOf(polygon).every(([x, z]) => {
          return x >= 0 && z >= 0
        })
      }),
    )
  })

  void it('cuts the part of a face that stands past the far edge', () => {
    const face = faceOf(
      [
        [MAP_LIMIT - 100, 0, 100],
        [MAP_LIMIT + 100, 0, 100],
        [MAP_LIMIT - 100, 0, 200],
      ],
      false,
    )
    const clip = clippedToMapOf([face])

    assert.equal(clip.clipped, 1)
    assert.equal(clip.dropped, 0)
    assert.ok(
      clip.polygons.every((polygon) => {
        return isInside(polygon)
      }),
    )
  })

  void it('drops a face that stands outside the map whole', () => {
    const face = faceOf(
      [
        [-300, 0, -300],
        [-200, 0, -300],
        [-300, 0, -200],
      ],
      false,
    )
    const clip = clippedToMapOf([face])

    assert.equal(clip.polygons.length, 0)
    assert.equal(clip.clipped, 0)
    assert.equal(clip.dropped, 1)
  })

  void it('keeps the room, the texture and the flags of the face, but not the quad', () => {
    const face = faceOf(
      [
        [-100, 0, 100],
        [100, 0, 100],
        [-100, 0, 200],
        [100, 0, 200],
      ],
      true,
    )
    const clip = clippedToMapOf([face])
    const [piece] = clip.polygons

    assert.notStrictEqual(piece, undefined)
    assert.equal(piece?.room, 3)
    assert.equal(piece?.textureContainerId, 7)
    assert.equal((piece?.flags ?? 0) & ArxPolygonFlags.Quad, 0)
    assert.notStrictEqual(piece?.normals, undefined)
  })

  void it('reads the uv of the new corner between the two it stands on', () => {
    // the edge from x = -100 (u = 0) to x = 100 (u = 0.1) meets the origin in the middle: the corner takes u = 0.05
    const face = faceOf(
      [
        [100, 0, 100],
        [-100, 0, 100],
        [100, 0, 200],
      ],
      false,
    )
    const clip = clippedToMapOf([face])
    const us = clip.polygons.flatMap((polygon) => {
      return polygon.vertices.map((vertex) => {
        return vertex.u
      })
    })

    assert.ok(
      us.some((u) => {
        return Math.abs(u - 0.05) < 1e-9
      }),
    )
  })
})
