import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { vertexToPolygonsMap } from '../../../../src/generator/polygons.ts'
import { fillAreaOf } from '../../../../src/editor/modules/selection/fillArea.ts'

/**
 * Builds a quad of the test at a place of the level, in a room, with a texture.
 *
 * @param x Where the quad starts on the X axis: two quads of the test touch when their starts differ by ten.
 * @param textureContainerId Which texture it wears.
 * @param room Which area it belongs to, or -1 for a face the file never assigned.
 *
 * @returns A quad placed at that spot.
 */
function faceAt(x: number, textureContainerId: number, room: number): ArxPolygon {
  return {
    vertices: [
      { x, y: 0, z: 0, u: 0, v: 0 },
      { x: x + 10, y: 0, z: 0, u: 1, v: 0 },
      { x: x + 10, y: 0, z: 10, u: 1, v: 1 },
      { x, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId,
    room,
  } as unknown as ArxPolygon
}

void describe('fillAreaOf', () => {
  void it('takes the welded area of one texture from the textured level', () => {
    const polygons = [faceAt(0, 1, 4), faceAt(10, 1, 4), faceAt(20, 2, 4)]
    const area = fillAreaOf('textures', polygons, vertexToPolygonsMap(polygons), 0)

    // 0 and 1 are welded to each other and wear the same texture; 2 wears another one
    assert.deepEqual(
      area.toSorted((a, b) => {
        return a - b
      }),
      [0, 1],
    )
  })

  void it('takes the whole room from the room map', () => {
    const polygons = [faceAt(0, 1, 2), faceAt(10, 2, 1), faceAt(20, 3, 2)]
    const area = fillAreaOf('rooms', polygons, vertexToPolygonsMap(polygons), 0)

    // the room and not the piece of the click: the faces of room 2 do not touch each other here
    assert.deepEqual(area, [0, 2])
  })

  void it('fills the faces without a room, and stops at the first room', () => {
    const polygons = [faceAt(0, 3, -1), faceAt(10, 3, -1), faceAt(20, 3, 5)]
    const area = fillAreaOf('rooms', polygons, vertexToPolygonsMap(polygons), 0)

    // the piece that still has to be assigned a room: no face of a room comes along
    assert.deepEqual(
      area.toSorted((a, b) => {
        return a - b
      }),
      [0, 1],
    )
  })

  void it('gives nothing when the click lands on nothing', () => {
    const polygons = [faceAt(0, 1, 2)]

    assert.deepEqual(fillAreaOf('rooms', polygons, vertexToPolygonsMap(polygons), 9), [])
    assert.deepEqual(fillAreaOf('textures', polygons, vertexToPolygonsMap(polygons), 9), [])
  })
})
