import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import type { FaceTexture } from '../../../../src/generator/ArxMap.ts'
import type { PolygonInsertion } from '../../../../src/generator/arxMap/removal.ts'
import type { FaceUv } from '../../../../src/generator/arxMap/uvs.ts'
import {
  commandOf,
  createDeleteFacesRecord,
  createSetTextureRecord,
  createSetUvRecord,
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
 * A level of the test: a list of polygons, their texture containers, and the halves of the steps that only keep them.
 *
 * @remarks
 * The polygons start on the container `1` (the wall of the test), so a paint has a container to leave and the undo has
 * one to come back to. The level keeps its containers in a map, the way the FTS keeps them in a list.
 *
 * @param count How many polygons it starts with.
 *
 * @returns The level, the list of polygons behind it and the containers.
 */
function fakeLevel(count: number): {
  level: MutableLevel
  polygons: ArxPolygon[]
  containers: Map<number, string>
} {
  const polygons = Array.from({ length: count }, (_, index) => {
    return triangle(index)
  })
  const containers = new Map<number, string>([[1, '[stone]_wall1.bmp']])

  return {
    polygons,
    containers,
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
      setFaceTextures: (changes: readonly FaceTexture[]): void => {
        for (const change of changes) {
          const polygon = polygons[change.index]

          if (polygon !== undefined) {
            polygon.textureContainerId = change.textureContainerId
          }
        }
      },
      addTextureContainer: (id: number, filename: string): void => {
        containers.set(id, filename)
      },
      removeTextureContainer: (id: number): void => {
        containers.delete(id)
      },
      setFaceUvs: (faceIndex: number, uvs: readonly FaceUv[]): void => {
        const polygon = polygons[faceIndex]

        for (const [corner, uv] of uvs.entries()) {
          const vertex = polygon?.vertices[corner]

          if (vertex !== undefined) {
            vertex.u = uv.u
            vertex.v = uv.v
          }
        }
      },
    },
  }
}

/**
 * The paint of the test: the faces 0 and 2 take the container 9, which the level does not have yet.
 *
 * @param added Whether the level gets the container of the texture from the step.
 *
 * @returns The step, with the faces, the containers they leave and the one they take.
 */
function paintRecord(added = true): ReturnType<typeof createSetTextureRecord> {
  return createSetTextureRecord(
    [
      { index: 2, from: 1 },
      { index: 0, from: 1 },
    ],
    { id: 9, name: 'dropped-wall.png' },
    added,
  )
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

void describe('createSetTextureRecord', () => {
  void it('writes the faces sorted, with the containers they leave and the one they take', () => {
    assert.deepEqual(paintRecord(), {
      version: HISTORY_RECORD_VERSION,
      kind: 'setTexture',
      faces: [0, 2],
      from: [1, 1],
      to: { id: 9, name: 'dropped-wall.png' },
      added: true,
    })
  })

  void it('follows the old containers with the faces they belong to', () => {
    const record = createSetTextureRecord(
      [
        { index: 5, from: 2 },
        { index: 1, from: 7 },
      ],
      { id: 9, name: 'a.png' },
      false,
    )

    assert.deepEqual(record.faces, [1, 5])
    assert.deepEqual(record.from, [7, 2])
  })

  void it('says how many faces the step paints', () => {
    assert.equal(labelOf(paintRecord()), 'Set texture on 2 face(s)')
  })
})

void describe('commandOf a paint', () => {
  void it('puts the container on the faces, and adds it to the level', () => {
    const { level, polygons, containers } = fakeLevel(3)
    const command = commandOf(paintRecord(), level)

    command?.apply()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.textureContainerId
      }),
      [9, 1, 9],
    )
    assert.equal(containers.get(9), 'dropped-wall.png')
  })

  void it('puts every face back on the container it had, and takes the added one out', () => {
    const { level, polygons, containers } = fakeLevel(3)
    const command = commandOf(paintRecord(), level)

    command?.apply()
    command?.revert()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.textureContainerId
      }),
      [1, 1, 1],
    )
    assert.equal(containers.has(9), false)
  })

  void it('does not touch the containers of a level that had the texture', () => {
    const { level, containers } = fakeLevel(3)
    const command = commandOf(paintRecord(false), level)

    command?.apply()
    command?.revert()

    assert.deepEqual(containers.keys().toArray(), [1])
  })

  void it('carries the record it was built from', () => {
    const { level } = fakeLevel(3)
    const record = paintRecord()

    assert.deepEqual(commandOf(record, level)?.record, record)
  })

  void it('gives no command when the level does not have the faces', () => {
    const { level } = fakeLevel(2)

    assert.equal(
      commandOf(createSetTextureRecord([{ index: 5, from: 1 }], { id: 9, name: 'a.png' }, true), level),
      undefined,
    )
  })
})

void describe('createSetUvRecord', () => {
  void it('writes the faces and the two states of their corners', () => {
    const record = createSetUvRecord(
      [7],
      [
        { u: 0, v: 0 },
        { u: 1, v: 1 },
      ],
      [
        { u: 0.25, v: 0 },
        { u: 1, v: 0.5 },
      ],
    )

    assert.deepEqual(record, {
      version: HISTORY_RECORD_VERSION,
      kind: 'setUv',
      faces: [7],
      from: [
        { u: 0, v: 0 },
        { u: 1, v: 1 },
      ],
      to: [
        { u: 0.25, v: 0 },
        { u: 1, v: 0.5 },
      ],
    })
  })

  void it('copies the corners, so the record does not follow the drag', () => {
    const corners = [{ u: 0, v: 0 }]
    const record = createSetUvRecord([0], corners, corners)

    ;(corners[0] as { u: number }).u = 0.5

    assert.equal(record.from[0]?.u, 0)
  })

  void it('writes the faces sorted, and once each', () => {
    const record = createSetUvRecord([9, 3, 9], [{ u: 0, v: 0 }], [{ u: 0.5, v: 0.5 }])

    assert.deepEqual(record.faces, [3, 9])
  })

  void it('says which face it moves', () => {
    assert.equal(labelOf(createSetUvRecord([26_375], [], [])), 'Move the uv of face 26375')
  })

  void it('says how many faces it moves', () => {
    assert.equal(labelOf(createSetUvRecord([1, 2], [], [])), 'Move the uv of 2 face(s)')
  })
})

void describe('commandOf a uv edit', () => {
  void it('writes the new corners, and takes the old ones back', () => {
    const { level, polygons } = fakeLevel(2)
    const command = commandOf(
      createSetUvRecord(
        [1],
        [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
        ],
        [
          { u: 0.1, v: 0.1 },
          { u: 0.9, v: 0.1 },
          { u: 0.9, v: 0.9 },
        ],
      ),
      level,
    )

    command?.apply()

    assert.deepEqual(
      polygons[1]?.vertices.slice(0, 3).map((vertex) => {
        return [vertex.u, vertex.v]
      }),
      [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.9],
      ],
    )

    command?.revert()

    assert.deepEqual(
      polygons[1]?.vertices.slice(0, 3).map((vertex) => {
        return [vertex.u, vertex.v]
      }),
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    )
  })

  void it('gives no command when the face is not in the level', () => {
    const { level } = fakeLevel(2)

    assert.equal(commandOf(createSetUvRecord([5], [], []), level), undefined)
  })
})
