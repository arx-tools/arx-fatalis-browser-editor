import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import {
  SPAWN_FLOOR_PROBE,
  SPAWN_FLOOR_SIZE,
  floorTileOf,
  floorsUnderOf,
  isFloorUnderOf,
  nearestFaceOf,
  spawnFeetOf,
  spawnFloorProbeOf,
  spawnOutsideMapOf,
} from '../../../../../src/editor/modules/level/entities/spawnFloor.ts'

/**
 * Builds a flat face of the test, a square of a hundred units, with its middle on a point.
 *
 * @param x The X of the middle of the face.
 * @param y The Y of it.
 * @param z The Z of the middle of the face.
 *
 * @returns The face, a floor that points down.
 */
function faceAt(x: number, y: number, z: number): ArxPolygon {
  const half = 50
  const down = { x: 0, y: -1, z: 0 }

  return {
    vertices: [
      { x: x - half, y, z: z - half, u: 0, v: 0, llfColorIdx: 0 },
      { x: x + half, y, z: z - half, u: 1, v: 0, llfColorIdx: 0 },
      { x: x - half, y, z: z + half, u: 0, v: 1, llfColorIdx: 0 },
      { x: x + half, y, z: z + half, u: 1, v: 1, llfColorIdx: 0 },
    ],
    textureContainerId: 4,
    norm: { ...down },
    norm2: { ...down },
    normals: [{ ...down }, { ...down }, { ...down }, { ...down }],
    transval: 0,
    area: 10_000,
    flags: ArxPolygonFlags.Quad,
    room: 2,
  }
}

/**
 * The level of the test, the way the spawn floor reads it.
 */
type TestMap = {
  readonly player: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number }
    readonly orientation: { readonly a: number; readonly b: number; readonly c: number; readonly g: number }
  }
  readonly scenePosition: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * Builds a level of the test, with the spawn its player holds.
 *
 * @param x The X of the eye of the player, in the coordinates of the level.
 * @param y The Y of it.
 * @param z The Z of it.
 *
 * @returns The map, the way the spawn floor reads it.
 */
function mapOf(x: number, y: number, z: number): TestMap {
  // the scene position of the test: the spawn of a blank level stands at 6000, and its player at 0 from it
  return {
    player: { position: { x: x - 6000, y, z: z - 6000 }, orientation: { a: 0, b: 0, c: 0, g: 0 } },
    scenePosition: { x: 6000, y: 0, z: 6000 },
  }
}

void describe('spawnFloorProbeOf', () => {
  void it('stands under the eye the level holds, in the coordinates of the level', () => {
    const map = mapOf(6000, -170, 6000)
    const probe = spawnFloorProbeOf(map)

    assert.deepEqual(probe, { x: 6000, y: -170 + SPAWN_FLOOR_PROBE, z: 6000 })
  })

  void it('puts the feet of the spawn the height of the player under the eye', () => {
    const map = mapOf(6000, -170, 6000)

    assert.deepEqual(spawnFeetOf(map), { x: 6000, y: 0, z: 6000 })
  })
})

void describe('spawnOutsideMapOf', () => {
  void it('sees a spawn on the map', () => {
    assert.equal(spawnOutsideMapOf({ x: 6000, y: 0, z: 6000 }), false)
  })

  void it('sees a spawn off the edge of the map', () => {
    assert.equal(spawnOutsideMapOf({ x: -1, y: 0, z: 6000 }), true)
    assert.equal(spawnOutsideMapOf({ x: 16_000, y: 0, z: 6000 }), true)
    assert.equal(spawnOutsideMapOf({ x: 6000, y: 0, z: -1 }), true)
  })
})

void describe('floorsUnderOf', () => {
  void it('finds the face a spawn stands on', () => {
    const faces = [faceAt(6000, 0, 6000), faceAt(7000, 0, 6000)]
    const floors = floorsUnderOf(faces, { x: 6000, y: 10, z: 6000 })

    assert.equal(floors.length, 1)
    assert.equal(floors[0], faces[0])
  })

  void it('finds no face over a hole of the level', () => {
    const floors = floorsUnderOf([faceAt(6000, 0, 6000)], { x: 1000, y: 10, z: 1000 })

    assert.equal(floors.length, 0)
  })

  void it('does not take a ceiling for the floor', () => {
    // the same point on the X and the Z, a level above the probe
    assert.equal(isFloorUnderOf(faceAt(6000, -300, 6000), { x: 6000, y: 10, z: 6000 }), false)
  })

  void it('takes a face a couple of units under the feet for the floor', () => {
    assert.equal(isFloorUnderOf(faceAt(6000, 2, 6000), { x: 6000, y: 10, z: 6000 }), true)
  })
})

void describe('nearestFaceOf', () => {
  void it('reads the face that stands the nearest to a point', () => {
    const near = faceAt(6100, 0, 6100)
    const far = faceAt(7000, 0, 7000)

    assert.equal(nearestFaceOf([far, near], { x: 6000, y: 0, z: 6000 }), near)
  })

  void it('reads no face of an empty level', () => {
    assert.equal(nearestFaceOf([], { x: 0, y: 0, z: 0 }), undefined)
  })
})

void describe('floorTileOf', () => {
  void it('is a hundred units around the feet of the spawn', () => {
    const tile = floorTileOf({ x: 1000, y: 0, z: 1000 }, 4, 2)
    const xs = tile.vertices.map((vertex) => {
      return vertex.x
    })
    const zs = tile.vertices.map((vertex) => {
      return vertex.z
    })

    assert.equal(Math.max(...xs) - Math.min(...xs), SPAWN_FLOOR_SIZE)
    assert.equal(Math.max(...zs) - Math.min(...zs), SPAWN_FLOOR_SIZE)
  })

  void it('takes the texture, the room and the downward normal of a floor', () => {
    const tile = floorTileOf({ x: 1000, y: 0, z: 1000 }, 4, 2)

    assert.equal(tile.textureContainerId, 4)
    assert.equal(tile.room, 2)
    assert.equal(tile.norm.y, -1)
    assert.equal(tile.flags & ArxPolygonFlags.Quad, ArxPolygonFlags.Quad)
  })
})
