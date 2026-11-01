import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import type { PolygonInsertion } from '../../../../src/generator/ArxMap.ts'
import {
  commandOf,
  createDeleteFacesRecord,
  HISTORY_RECORD_VERSION,
  labelOf,
  type MutableLevel,
} from '../../../../src/editor/modules/history/records.ts'

/**
 * A triangle of the test, with everything a polygon has: four vertices (the file holds four, the flag says how many
 * of them are used), the normal, the area and the room.
 *
 * @param index Which triangle it is: the area and the texture follow from it, so two are never the same object.
 *
 * @returns The polygon.
 */
function triangle(index: number): ArxPolygon {
  return {
    // a polygon holds four vertices in the file, a triangle keeps the fourth one (the flag says which shape it is)
    vertices: [
      { x: index, y: 0, z: 0, u: 0, v: 0 },
      { x: index + 1, y: 0, z: 0, u: 1, v: 0 },
      { x: index + 1, y: 0, z: 1, u: 1, v: 1 },
      { x: index, y: 0, z: 0, u: 0, v: 0 },
    ],
    textureContainerId: 1,
    norm: { x: 0, y: 1, z: 0 },
    norm2: { x: 0, y: 1, z: 0 },
    transval: 0,
    area: index,
    flags: ArxPolygonFlags.None,
    room: 1,
  }
}

/**
 * A level of the test: a list of polygons, and the two halves of a delete that only keep the list.
 *
 * @param count How many polygons it starts with.
 *
 * @returns The level and the list behind it.
 */
function fakeLevel(count: number): { level: MutableLevel; polygons: ArxPolygon[] } {
  const polygons = Array.from({ length: count }, (_, index) => {
    return triangle(index)
  })

  return {
    polygons,
    level: {
      polygons,
      removePolygons: (removed: readonly ArxPolygon[]): void => {
        const gone = new Set(removed)
        const kept = polygons.filter((polygon) => {
          return !gone.has(polygon)
        })

        polygons.splice(0, polygons.length, ...kept)
      },
      insertPolygons: (insertions: readonly PolygonInsertion[]): void => {
        for (const insertion of insertions) {
          polygons.splice(insertion.index, 0, insertion.polygon)
        }
      },
    },
  }
}

void describe('createDeleteFacesRecord', () => {
  void it('writes the version, the kind and the faces', () => {
    assert.deepEqual(createDeleteFacesRecord([4, 7]), {
      version: HISTORY_RECORD_VERSION,
      kind: 'deleteFaces',
      faces: [4, 7],
    })
  })

  void it('sorts and makes the faces unique, so the same set is the same record', () => {
    assert.deepEqual(createDeleteFacesRecord([7, 4, 7]).faces, [4, 7])
  })

  void it('takes any number of faces, and none at all', () => {
    assert.deepEqual(createDeleteFacesRecord(new Set<number>()).faces, [])
  })
})

void describe('labelOf', () => {
  void it('says how many faces the step takes out', () => {
    assert.equal(labelOf(createDeleteFacesRecord([1, 2, 3])), 'Delete 3 face(s)')
  })
})

void describe('commandOf', () => {
  void it('takes the faces out on apply, and puts them back on revert', () => {
    const { level, polygons } = fakeLevel(3)
    const command = commandOf(createDeleteFacesRecord([1]), level)

    assert.notEqual(command, undefined)
    command?.apply()

    // the middle one is gone, the other two stay in their order
    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 2],
    )

    command?.revert()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 1, 2],
    )
  })

  void it('carries the record it was built from', () => {
    const { level } = fakeLevel(2)
    const record = createDeleteFacesRecord([0])

    assert.deepEqual(commandOf(record, level)?.record, record)
  })

  void it('takes the polygons of the level it is given, so a replay finds them again', () => {
    const first = fakeLevel(3)
    const second = fakeLevel(3)

    commandOf(createDeleteFacesRecord([2]), first.level)?.apply()

    // the same record on another level: the replay of a reload runs against the parsed files
    commandOf(createDeleteFacesRecord([2]), second.level)?.apply()

    assert.deepEqual(
      first.polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 1],
    )
    assert.deepEqual(
      second.polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 1],
    )
  })

  void it('gives no command for a record of another version', () => {
    const { level } = fakeLevel(2)
    const record = { ...createDeleteFacesRecord([0]), version: HISTORY_RECORD_VERSION + 1 }

    assert.equal(commandOf(record, level), undefined)
  })

  void it('gives no command for a kind this build does not know', () => {
    const { level } = fakeLevel(2)
    const record = { ...createDeleteFacesRecord([0]), kind: 'moveVertex' } as unknown as ReturnType<
      typeof createDeleteFacesRecord
    >

    assert.equal(commandOf(record, level), undefined)
  })

  void it('gives no command when the level does not have the faces', () => {
    const { level } = fakeLevel(2)

    assert.equal(commandOf(createDeleteFacesRecord([5]), level), undefined)
  })
})
