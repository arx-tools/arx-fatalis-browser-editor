import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { MAP_GUARD_FAR, MAP_GUARD_SIZE, guardPolygonsOf } from '../../../../src/editor/modules/level/mapGuards.ts'
import { NO_ROOM } from '../../../../src/editor/modules/rooms/roomList.ts'

/**
 * Reads the box of a polygon: the lowest and the highest corner on each axis.
 *
 * @param polygon The face to read.
 *
 * @returns The X, the Z and the Y box of it, in that order.
 */
function boxOf(polygon: ArxPolygon): number[] {
  const xs = polygon.vertices.map((vertex) => {
    return vertex.x
  })
  const zs = polygon.vertices.map((vertex) => {
    return vertex.z
  })
  const ys = polygon.vertices.map((vertex) => {
    return vertex.y
  })

  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)]
}

void describe('guardPolygonsOf', () => {
  void it('reads the two quads of the corners, in no room', () => {
    const guards = guardPolygonsOf(1)

    const far = MAP_GUARD_FAR - MAP_GUARD_SIZE

    assert.equal(guards.length, 2)
    // the game draws a face of a room only, and the corner of the map is thousands of units from the floor: a guard
    // in no room is never in the picture and nothing walks on it
    assert.deepEqual(
      guards.map((guard) => {
        return guard.room
      }),
      [NO_ROOM, NO_ROOM],
    )
    assert.deepEqual(
      guards.map((guard) => {
        return guard.flags
      }),
      [ArxPolygonFlags.Quad, ArxPolygonFlags.Quad],
    )
    assert.deepEqual(
      guards.map((guard) => {
        return guard.textureContainerId
      }),
      [1, 1],
    )
    assert.deepEqual(
      guards.map((guard) => {
        return boxOf(guard)
      }),
      [
        [0, MAP_GUARD_SIZE, 0, MAP_GUARD_SIZE, 0, 0],
        [far, MAP_GUARD_FAR, far, MAP_GUARD_FAR, 0, 0],
      ],
    )
  })
})
