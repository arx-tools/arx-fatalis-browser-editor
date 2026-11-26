import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ArxPolygonFlags,
  type ArxColor,
  type ArxInteractiveObject,
  type ArxLight,
  type ArxPolygon,
  type ArxPortal,
  type ArxVector3,
} from 'arx-convert/types'
import { Quaternion, Vector3 } from 'three'
import { isQuad } from 'arx-convert/utils'
import type { FaceRoom, FaceTexture } from '../../../../src/generator/ArxMap.ts'
import type { PolygonInsertion } from '../../../../src/generator/arxMap/removal.ts'
import type { PolygonTurn } from '../../../../src/generator/arxMap/transforms.ts'
import type { FaceUv } from '../../../../src/generator/arxMap/uvs.ts'
import { commandOf } from '../../../../src/editor/modules/history/commands.ts'
import { roomNameOf, setRoomNamesOf } from '../../../../src/editor/modules/rooms/roomNames.ts'
import {
  createDeleteFacesRecord,
  createPasteFacesRecord,
  createRotateFacesRecord,
  createScaleFacesRecord,
  createTranslateFacesRecord,
} from '../../../../src/editor/modules/history/records/faces.ts'
import { labelOf } from '../../../../src/editor/modules/history/records/label.ts'
import {
  type MutablePolygons,
  HISTORY_RECORD_VERSION,
  type MutableLevel,
  type SetLightEdit,
} from '../../../../src/editor/modules/history/records/types.ts'
import { createSetLightRecord } from '../../../../src/editor/modules/history/records/lights.ts'
import { createSetSpawnRecord } from '../../../../src/editor/modules/history/records/spawn.ts'
import { createSetEntityPositionRecord } from '../../../../src/editor/modules/history/records/entities.ts'
import { createImportMeshRecord } from '../../../../src/editor/modules/history/records/import.ts'
import { createDeleteRoomsRecord } from '../../../../src/editor/modules/history/records/rooms.ts'
import { createSetTextureRecord, createSetUvRecord } from '../../../../src/editor/modules/history/records/textures.ts'
import { createBuildTunnelRecord } from '../../../../src/editor/modules/history/records/tunnel.ts'

/**
 * An interactive object of the test: a mug that stands where the test puts it.
 *
 * @param index Which entity it is: the identifier follows from it, so two are never the same object.
 *
 * @returns The interactive object, with the fields a DLF holds.
 */
function entity(index: number): ArxInteractiveObject {
  return {
    name: 'items/movable/mug',
    position: { x: index, y: 0, z: 0 },
    orientation: { a: 0, b: 0, g: 0 },
    identifier: index,
  }
}

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
 * @param entityCount How many interactive objects the level carries (the entities the steps of a place move).
 *
 * @returns The level, the list of polygons behind it, the containers and the entities.
 */
function fakeLevel(
  count: number,
  entityCount = 0,
): {
  level: MutableLevel
  polygons: ArxPolygon[]
  containers: Map<number, string>
  lighting: ArxColor[]
  portals: ArxPortal[]
  lights: ArxLight[]
  entities: ArxInteractiveObject[]
} {
  // the list of the level: an array of polygons with the operations a step calls (the map owns the real one)
  const polygons = Array.from({ length: count }, (_, index) => {
    return triangle(index)
  }) as ArxPolygon[] & MutablePolygons
  const containers = new Map<number, string>([[1, '[stone]_wall1.bmp']])
  const lighting: ArxColor[] = [{ r: 1, g: 2, b: 3, a: 1 }]
  const portals: ArxPortal[] = []
  const lights: ArxLight[] = []
  // the interactive objects of the level: the entity editor writes their place, the way the DLF of the map holds them
  const entities: ArxInteractiveObject[] = Array.from({ length: entityCount }, (_, index) => {
    return entity(index)
  })

  Object.assign(polygons, {
    remove: (removed: readonly ArxPolygon[]): void => {
      const gone = new Set(removed)
      const kept = polygons.filter((polygon) => {
        return !gone.has(polygon)
      })

      polygons.splice(0, polygons.length, ...kept)
    },
    insert: (insertions: readonly PolygonInsertion[]): void => {
      for (const insertion of insertions) {
        polygons.splice(insertion.index, 0, insertion.polygon)
      }
    },
    translate: (faces: readonly number[], delta: ArxVector3): void => {
      for (const index of faces) {
        const polygon = polygons[index]

        if (polygon === undefined) {
          continue
        }

        let corners = 3

        if (isQuad(polygon)) {
          corners = 4
        }

        for (let corner = 0; corner < corners; corner++) {
          const vertex = polygon.vertices[corner]

          if (vertex !== undefined) {
            vertex.x = vertex.x + delta.x
            vertex.y = vertex.y + delta.y
            vertex.z = vertex.z + delta.z
          }
        }
      }
    },
    rotate: (faces: readonly number[], turnOfList: PolygonTurn): void => {
      const { angle, axis, pivot } = turnOfList
      const turn = new Quaternion().setFromAxisAngle(new Vector3(axis.x, axis.y, axis.z).normalize(), angle)
      const center = new Vector3(pivot.x, pivot.y, pivot.z)
      const point = new Vector3()

      for (const index of faces) {
        const polygon = polygons[index]

        if (polygon === undefined) {
          continue
        }

        let corners = 3

        if (isQuad(polygon)) {
          corners = 4
        }

        for (let corner = 0; corner < corners; corner++) {
          const vertex = polygon.vertices[corner]

          if (vertex === undefined) {
            continue
          }

          point.set(vertex.x, vertex.y, vertex.z).sub(center).applyQuaternion(turn).add(center)
          vertex.x = point.x
          vertex.y = point.y
          vertex.z = point.z
        }
      }
    },
    scale: (faces: readonly number[], pivot: ArxVector3, scale: ArxVector3): void => {
      for (const index of faces) {
        const polygon = polygons[index]

        if (polygon === undefined) {
          continue
        }

        let corners = 3

        if (isQuad(polygon)) {
          corners = 4
        }

        for (let corner = 0; corner < corners; corner++) {
          const vertex = polygon.vertices[corner]

          if (vertex === undefined) {
            continue
          }

          const offsetX = (vertex.x - pivot.x) * scale.x
          const offsetY = (vertex.y - pivot.y) * scale.y
          const offsetZ = (vertex.z - pivot.z) * scale.z

          vertex.x = pivot.x + offsetX
          vertex.y = pivot.y + offsetY
          vertex.z = pivot.z + offsetZ
        }
      }
    },
  })

  return {
    polygons,
    containers,
    lighting,
    portals,
    lights,
    entities,
    level: {
      polygons,
      llf: { colors: lighting },
      portals,
      setPortals: (next: readonly ArxPortal[]): void => {
        portals.splice(0, portals.length, ...next)
      },
      setFaceTextures: (changes: readonly FaceTexture[]): void => {
        for (const change of changes) {
          const polygon = polygons[change.index]

          if (polygon !== undefined) {
            polygon.textureContainerId = change.textureContainerId
          }
        }
      },
      setFaceRooms: (changes: readonly FaceRoom[]): void => {
        for (const change of changes) {
          const polygon = polygons[change.index]

          if (polygon !== undefined) {
            polygon.room = change.room
          }
        }
      },
      addTextureContainer: (id: number, filename: string): void => {
        containers.set(id, filename)
      },
      removeTextureContainer: (id: number): void => {
        containers.delete(id)
      },
      addLightingColors: (colors: readonly ArxColor[]): void => {
        lighting.push(...colors)
      },
      removeLightingColors: (count: number): void => {
        lighting.splice(Math.max(0, lighting.length - count), count)
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
      lights,
      player: { position: { x: 100, y: -170, z: 200 }, orientation: { a: 0, b: 90, g: 0 } },
      setLights: (changes: ReadonlyArray<{ readonly index: number; readonly light: ArxLight }>): void => {
        for (const change of changes) {
          if (lights[change.index] !== undefined) {
            lights[change.index] = change.light
          }
        }
      },
      entities,
      setEntityPositions: (changes: ReadonlyArray<{ readonly index: number; readonly position: ArxVector3 }>): void => {
        for (const change of changes) {
          const object = entities[change.index]

          if (object !== undefined) {
            object.position.x = change.position.x
            object.position.y = change.position.y
            object.position.z = change.position.z
          }
        }
      },
    },
  }
}

/**
 * A light of the test, with every field of an LLF light.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 1, y: 2, z: 3 },
    color: { r: 255, g: 255, b: 255, a: 255 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 255 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
    ...overrides,
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

void describe('createSetLightRecord', () => {
  void it('sorts the lights by their index, and reads one twice once', () => {
    const first = light()
    const second = light()
    const edits: SetLightEdit[] = [
      { index: 3, before: first, after: first },
      { index: 1, before: second, after: second },
      { index: 3, before: second, after: second },
    ]
    const record = createSetLightRecord(edits)

    assert.deepEqual(record.indices, [1, 3])
    assert.equal(record.before.length, 2)
    assert.equal(record.after.length, 2)
    assert.equal(record.version, HISTORY_RECORD_VERSION)
  })

  void it('copies the snapshots, so a later edit of the light does not reach them', () => {
    const before = light()
    const after = light({ intensity: 2 })
    const record = createSetLightRecord([{ index: 0, before, after }])

    before.color.r = 0
    after.color.g = 0

    assert.equal(record.before[0]?.color.r, 255)
    assert.equal(record.after[0]?.color.g, 255)
  })

  void it('writes the number of the lights in the caption', () => {
    const one = createSetLightRecord([{ index: 3, before: light(), after: light() }])
    const many = createSetLightRecord([
      { index: 1, before: light(), after: light() },
      { index: 2, before: light(), after: light() },
    ])

    assert.equal(labelOf(one), 'Edit light 3')
    assert.equal(labelOf(many), 'Edit 2 lights')
  })
})

void describe('createPasteFacesRecord', () => {
  void it('copies the polygons, so a later edit of the source does not reach the record', () => {
    const polygon = triangle(3)
    const record = createPasteFacesRecord([polygon])

    polygon.vertices[0].x = 42

    assert.equal(record.polygons[0]?.vertices[0].x, 3)
    assert.equal(record.version, HISTORY_RECORD_VERSION)
    assert.equal(record.kind, 'pasteFaces')
  })

  void it('keeps the colors of the corners when the clipboard has them', () => {
    const record = createPasteFacesRecord(
      [triangle(1)],
      [
        { r: 10, g: 0, b: 0, a: 255 },
        { r: 11, g: 0, b: 0, a: 255 },
        { r: 12, g: 0, b: 0, a: 255 },
      ],
    )

    assert.deepEqual(
      record.colors?.map((color) => {
        return color.r
      }),
      [10, 11, 12],
    )
  })
})

void describe('commandOf', () => {
  void it('puts the faces of the paste at the end on apply, and takes them out on revert', () => {
    const { level, polygons } = fakeLevel(2)
    const record = createPasteFacesRecord([triangle(9)])
    const command = commandOf(record, level)

    assert.notEqual(command, undefined)
    assert.equal(command?.label, 'Paste face')

    command?.apply()
    assert.equal(polygons.length, 3)
    assert.equal(polygons.at(-1)?.area, 9)

    // the level got a copy, not the object the record holds
    assert.notEqual(polygons.at(-1), record.polygons[0])

    command?.revert()
    assert.equal(polygons.length, 2)
  })

  void it('leaves the room of the source behind: a pasted face is in no room yet', () => {
    const { level, polygons } = fakeLevel(2)
    const source = triangle(9)

    source.room = 242
    const command = commandOf(createPasteFacesRecord([source]), level)

    command?.apply()
    // a face that kept the room of the source would take its flat color in the room map, and hide over a floor of it
    assert.equal(polygons.at(-1)?.room, -1)

    command?.revert()
  })

  void it('moves the colors of the pasted faces into a block of their own', () => {
    const { level, polygons, lighting } = fakeLevel(2)
    const record = createPasteFacesRecord(
      [triangle(9)],
      [
        { r: 10, g: 0, b: 0, a: 255 },
        { r: 11, g: 0, b: 0, a: 255 },
        { r: 12, g: 0, b: 0, a: 255 },
      ],
    )
    const command = commandOf(record, level)

    command?.apply()
    assert.equal(lighting.length, 4)
    // the copy points at the block appended to the palette, not at the entries of the source
    assert.equal(polygons.at(-1)?.vertices[0]?.llfColorIdx, 1)

    command?.revert()
    assert.equal(lighting.length, 1)
    assert.equal(polygons.length, 2)
  })

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

void describe('createTranslateFacesRecord', () => {
  void it('writes the faces sorted, once each, and the delta', () => {
    const record = createTranslateFacesRecord([3, 1, 3], { x: 1, y: -2, z: 3 })

    assert.deepEqual(record.faces, [1, 3])
    assert.deepEqual(record.delta, { x: 1, y: -2, z: 3 })
    assert.equal(record.kind, 'translateFaces')
    assert.equal(record.version, HISTORY_RECORD_VERSION)
  })

  void it('copies the delta, so the record does not follow the drag', () => {
    const delta = { x: 1, y: 2, z: 3 }
    const record = createTranslateFacesRecord([0], delta)

    delta.x = 9

    assert.equal(record.delta.x, 1)
  })

  void it('says how many faces it moves', () => {
    assert.equal(labelOf(createTranslateFacesRecord([1, 2], { x: 1, y: 0, z: 0 })), 'Move 2 face(s)')
  })
})

void describe('commandOf a move', () => {
  void it('moves the corners on apply, and takes them back on revert', () => {
    const { polygons, level } = fakeLevel(2)
    const command = commandOf(createTranslateFacesRecord([1], { x: 10, y: -5, z: 2 }), level)

    command?.apply()

    const moved = polygons[1]?.vertices[0]

    assert.deepEqual([moved?.x, moved?.y, moved?.z], [11, -5, 2])

    command?.revert()

    const back = polygons[1]?.vertices[0]

    assert.deepEqual([back?.x, back?.y, back?.z], [1, 0, 0])
  })

  void it('gives no command when the face is not in the level', () => {
    const { level } = fakeLevel(2)

    assert.equal(commandOf(createTranslateFacesRecord([5], { x: 1, y: 0, z: 0 }), level), undefined)
  })
})

void describe('createRotateFacesRecord', () => {
  void it('writes the faces sorted and once each, with the pivot, the axis and the angle', () => {
    const record = createRotateFacesRecord([3, 1, 3], { x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 0.5)

    assert.deepEqual(record.faces, [1, 3])
    assert.deepEqual(record.pivot, { x: 1, y: 2, z: 3 })
    assert.deepEqual(record.axis, { x: 0, y: 0, z: 1 })
    assert.equal(record.angle, 0.5)
    assert.equal(record.kind, 'rotateFaces')
    assert.equal(record.version, HISTORY_RECORD_VERSION)
  })

  void it('copies the pivot and the axis, so the record does not follow the drag', () => {
    const pivot = { x: 1, y: 2, z: 3 }
    const axis = { x: 0, y: 0, z: 1 }
    const record = createRotateFacesRecord([0], pivot, axis, 0.5)

    pivot.x = 9
    axis.z = 9

    assert.equal(record.pivot.x, 1)
    assert.equal(record.axis.z, 1)
  })

  void it('says how many faces it turns', () => {
    const record = createRotateFacesRecord([1, 2], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1)

    assert.equal(labelOf(record), 'Rotate 2 face(s)')
  })
})

void describe('commandOf a turn', () => {
  void it('turns the corners on apply, and turns them back on revert', () => {
    const { polygons, level } = fakeLevel(2)
    const record = createRotateFacesRecord([1], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2)
    const command = commandOf(record, level)

    command?.apply()

    // a quarter turn around Z: (x, y) becomes (-y, x), up to the rounding of the maths
    const turned = polygons[1]?.vertices[0] ?? { x: 0, y: 0, z: 0 }

    assert.ok(Math.abs(turned.x) < 1e-9)
    assert.ok(Math.abs(turned.y - 1) < 1e-9)
    assert.ok(Math.abs(turned.z) < 1e-9)

    command?.revert()

    const back = polygons[1]?.vertices[0] ?? { x: 0, y: 0, z: 0 }

    assert.ok(Math.abs(back.x - 1) < 1e-9)
    assert.ok(Math.abs(back.y) < 1e-9)
    assert.ok(Math.abs(back.z) < 1e-9)
  })

  void it('gives no command when the face is not in the level', () => {
    const { level } = fakeLevel(2)
    const record = createRotateFacesRecord([5], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1)

    assert.equal(commandOf(record, level), undefined)
  })
})

void describe('createScaleFacesRecord', () => {
  void it('writes the faces sorted and once each, with the pivot and the factors', () => {
    const record = createScaleFacesRecord([3, 1, 3], { x: 1, y: 2, z: 3 }, { x: 2, y: 0.5, z: 1 })

    assert.deepEqual(record.faces, [1, 3])
    assert.deepEqual(record.pivot, { x: 1, y: 2, z: 3 })
    assert.deepEqual(record.scale, { x: 2, y: 0.5, z: 1 })
    assert.equal(record.kind, 'scaleFaces')
    assert.equal(record.version, HISTORY_RECORD_VERSION)
  })

  void it('copies the pivot and the factors, so the record does not follow the drag', () => {
    const pivot = { x: 1, y: 2, z: 3 }
    const scale = { x: 2, y: 2, z: 2 }
    const record = createScaleFacesRecord([0], pivot, scale)

    pivot.x = 9
    scale.x = 9

    assert.equal(record.pivot.x, 1)
    assert.equal(record.scale.x, 2)
  })

  void it('says how many faces it scales', () => {
    const record = createScaleFacesRecord([1, 2], { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 })

    assert.equal(labelOf(record), 'Scale 2 face(s)')
  })
})

void describe('commandOf a scale', () => {
  void it('scales the corners on apply, and scales them back on revert', () => {
    const { polygons, level } = fakeLevel(2)
    const record = createScaleFacesRecord([1], { x: 1, y: 0, z: 0 }, { x: 2, y: 2, z: 2 })
    const command = commandOf(record, level)

    command?.apply()

    // the pivot is the left corner of the triangle: the next one is twice as far from it
    const scaled = polygons[1]?.vertices[1] ?? { x: 0, y: 0, z: 0 }

    assert.ok(Math.abs(scaled.x - 3) < 1e-9)
    assert.ok(Math.abs(scaled.z) < 1e-9)

    command?.revert()

    const back = polygons[1]?.vertices[1] ?? { x: 0, y: 0, z: 0 }

    assert.ok(Math.abs(back.x - 2) < 1e-9)
    assert.ok(Math.abs(back.z) < 1e-9)
  })

  void it('gives no command when the face is not in the level', () => {
    const { level } = fakeLevel(2)
    const record = createScaleFacesRecord([5], { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 })

    assert.equal(commandOf(record, level), undefined)
  })
})

/**
 * The portal of the test, between room 17 and the tunnel room 27.
 *
 * @returns The portal, with four corners around a square.
 */
function tunnelPortal(): ArxPortal {
  const corners = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
  ]
  const vertices = corners.map((position, index) => {
    let rhw = 0

    if (index === 0) {
      rhw = 1
    }

    return { position, rhw }
  }) as ArxPortal['polygon']['vertices']

  return {
    polygon: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 0 },
      norm: { x: 0, y: 0, z: 1 },
      norm2: { x: 2, y: 0, z: 0 },
      vertices,
      center: { x: 0.5, y: 0.5, z: 0 },
    },
    room1: 17,
    room2: 27,
    usePortal: 0,
  }
}

/**
 * A quad of the tunnel of the test.
 *
 * @param index Which quad it is: its corners start at the index.
 *
 * @returns The face of the tunnel, in room 27.
 */
function tunnelQuad(index: number): ArxPolygon {
  return {
    ...triangle(index),
    vertices: [
      { x: index, y: 0, z: 0, u: 0, v: 0, llfColorIdx: 1 },
      { x: index + 1, y: 0, z: 0, u: 1, v: 0, llfColorIdx: 2 },
      { x: index + 1, y: 1, z: 0, u: 1, v: 1, llfColorIdx: 3 },
      { x: index, y: 1, z: 0, u: 0, v: 1, llfColorIdx: 4 },
    ],
    flags: ArxPolygonFlags.Quad,
    room: 27,
  }
}

/**
 * The tunnel of the test: two quads that a step adds after the wall it takes out.
 *
 * @returns The record, with the wall face 1 and the two quads.
 */
function tunnelRecord(): ReturnType<typeof createBuildTunnelRecord> {
  return createBuildTunnelRecord({
    removed: [1],
    added: [tunnelQuad(10), tunnelQuad(20)],
    texture: { id: 9, name: 'l5_snake_[marble]_wall04.jpg' },
    addedTexture: true,
    lighting: [
      { r: 128, g: 128, b: 128, a: 1 },
      { r: 128, g: 128, b: 128, a: 1 },
      { r: 128, g: 128, b: 128, a: 1 },
      { r: 128, g: 128, b: 128, a: 1 },
    ],
    portals: [tunnelPortal()],
  })
}

void describe('createBuildTunnelRecord', () => {
  void it('writes the removed faces, the added polygons, the texture and the lighting', () => {
    const record = tunnelRecord()

    assert.equal(record.version, HISTORY_RECORD_VERSION)
    assert.equal(record.kind, 'buildTunnel')
    assert.deepEqual(record.removed, [1])
    assert.deepEqual(
      record.added.map((polygon) => {
        return polygon.room
      }),
      [27, 27],
    )
    assert.deepEqual(record.texture, { id: 9, name: 'l5_snake_[marble]_wall04.jpg' })
    assert.equal(record.addedTexture, true)
    assert.equal(record.lighting.length, 4)
    assert.equal(record.portals.length, 1)
  })

  void it('sorts the faces of the wall, so the same selection is the same record', () => {
    const record = createBuildTunnelRecord({
      removed: [3, 1, 3],
      added: [],
      texture: { id: 9, name: 'a.png' },
      addedTexture: false,
      lighting: [],
      portals: [],
    })

    assert.deepEqual(record.removed, [1, 3])
  })

  void it('says how many faces the tunnel has', () => {
    assert.equal(labelOf(tunnelRecord()), 'Build a tunnel of 2 face(s)')
  })
})

void describe('commandOf a tunnel', () => {
  void it('takes the wall out, adds the tunnel, the container and the colors', () => {
    const { level, polygons, containers, lighting, portals } = fakeLevel(3)
    const command = commandOf(tunnelRecord(), level)

    command?.apply()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 2, 10, 20],
    )
    assert.equal(polygons[2]?.room, 27)
    assert.equal(containers.get(9), 'l5_snake_[marble]_wall04.jpg')
    assert.equal(lighting.length, 5)
    assert.deepEqual(lighting.at(-1), { r: 128, g: 128, b: 128, a: 1 })
    assert.equal(portals.length, 1)
    assert.deepEqual([portals[0]?.room1, portals[0]?.room2], [17, 27])
  })

  void it('puts the wall back and takes the tunnel, the container and the colors out', () => {
    const { level, polygons, containers, lighting, portals } = fakeLevel(3)
    const command = commandOf(tunnelRecord(), level)

    command?.apply()
    command?.revert()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.area
      }),
      [0, 1, 2],
    )
    assert.equal(containers.has(9), false)
    assert.equal(lighting.length, 1)
    assert.equal(portals.length, 0)
  })

  void it('gives no command when the wall is not in the level', () => {
    const { level } = fakeLevel(2)
    const record = createBuildTunnelRecord({
      removed: [5],
      added: [],
      texture: { id: 9, name: 'a.png' },
      addedTexture: false,
      lighting: [],
      portals: [],
    })

    assert.equal(commandOf(record, level), undefined)
  })
})

/**
 * A portal of the test between two rooms.
 *
 * @param room1 The room on one side.
 * @param room2 The room on the other side.
 *
 * @returns The portal, with the parts the command reads.
 */
function portal(room1: number, room2: number): ArxPortal {
  return { room1, room2 } as unknown as ArxPortal
}

void describe('createDeleteRoomsRecord', () => {
  void it('writes the faces sorted with their rooms, and the portals unique', () => {
    const record = createDeleteRoomsRecord(
      [
        { index: 2, room: 1 },
        { index: 0, room: 3 },
        { index: 0, room: 3 },
      ],
      [4, 2, 4],
    )

    assert.deepEqual(record, {
      version: HISTORY_RECORD_VERSION,
      kind: 'deleteRooms',
      faces: [0, 2],
      from: [3, 1],
      portals: [2, 4],
      names: [],
    })
  })

  void it('says how many rooms the step takes out', () => {
    const record = createDeleteRoomsRecord(
      [
        { index: 0, room: 7 },
        { index: 1, room: 7 },
        { index: 2, room: 8 },
      ],
      [],
    )

    assert.equal(labelOf(record), 'Delete 2 room(s)')
  })
})

void describe('commandOf a room delete', () => {
  void it('takes the rooms out on apply, and puts them back with their portals on revert', () => {
    const { level, polygons, portals } = fakeLevel(3)

    polygons[0].room = 1
    polygons[1].room = 2
    polygons[2].room = 1
    portals.push(portal(1, 2), portal(2, 3))

    const command = commandOf(
      createDeleteRoomsRecord(
        [
          { index: 0, room: 1 },
          { index: 2, room: 1 },
        ],
        [0],
      ),
      level,
    )

    command?.apply()

    // the faces stay, and only their room goes; the portal of the room goes with it
    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.room
      }),
      [-1, 2, -1],
    )
    assert.deepEqual([portals[0]?.room1, portals[0]?.room2], [2, 3])

    command?.revert()

    assert.deepEqual(
      polygons.map((polygon) => {
        return polygon.room
      }),
      [1, 2, 1],
    )
    assert.deepEqual([portals[0]?.room1, portals[0]?.room2], [1, 2])
    assert.deepEqual([portals[1]?.room1, portals[1]?.room2], [2, 3])
  })

  void it('forgets the names of the rooms, and brings them back on revert', () => {
    const { level } = fakeLevel(2)

    setRoomNamesOf(
      'arx:8',
      '1a2b3c4d:2f',
      new Map([
        [1, 'The yard'],
        [2, 'The hall'],
      ]),
    )

    const command = commandOf(
      createDeleteRoomsRecord([{ index: 0, room: 1 }], [], [{ room: 1, name: 'The yard' }]),
      level,
    )

    command?.apply()
    assert.equal(roomNameOf(1), undefined)
    assert.equal(roomNameOf(2), 'The hall')

    command?.revert()
    assert.equal(roomNameOf(1), 'The yard')
    assert.equal(roomNameOf(2), 'The hall')
  })

  void it('gives no command when a portal of the record is not in the level', () => {
    const { level } = fakeLevel(2)
    const record = createDeleteRoomsRecord([{ index: 0, room: 1 }], [3])

    assert.equal(commandOf(record, level), undefined)
  })

  void it('gives no command when a face of the record is not in the level', () => {
    const { level } = fakeLevel(2)
    const record = createDeleteRoomsRecord([{ index: 5, room: 1 }], [])

    assert.equal(commandOf(record, level), undefined)
  })
})

void describe('a move of the spawn', () => {
  void it('copies the two snapshots, so a later edit of the level does not reach them', () => {
    const before = { position: { x: 100, y: 0, z: 200 }, yaw: 90 }
    const after = { position: { x: 150, y: 0, z: 250 }, yaw: 180 }
    const record = createSetSpawnRecord(before, after)

    before.position.x = 0
    after.position.z = 0

    assert.deepEqual(record.before, { position: { x: 100, y: 0, z: 200 }, yaw: 90 })
    assert.deepEqual(record.after, { position: { x: 150, y: 0, z: 250 }, yaw: 180 })
    assert.equal(record.version, HISTORY_RECORD_VERSION)
    assert.equal(record.kind, 'setSpawn')
  })

  void it('writes the feet as the eye of the DLF on apply, and puts them back on revert', () => {
    const { level } = fakeLevel(2)
    const command = commandOf(
      createSetSpawnRecord(
        { position: { x: 100, y: 0, z: 200 }, yaw: 90 },
        { position: { x: 150, y: 10, z: 250 }, yaw: 180 },
      ),
      level,
    )

    assert.notEqual(command, undefined)

    command?.apply()
    // the DLF keeps the eye: the feet are the height of the player above it in the game's Y, which points down
    assert.deepEqual(level.player.position, { x: 150, y: 10 - 170, z: 250 })
    assert.equal(level.player.orientation.b, 180)

    command?.revert()
    assert.deepEqual(level.player.position, { x: 100, y: 0 - 170, z: 200 })
    assert.equal(level.player.orientation.b, 90)
  })

  void it('says whether the step moved the spawn, or only turned it', () => {
    const moved = createSetSpawnRecord(
      { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
      { position: { x: 10, y: 0, z: 0 }, yaw: 0 },
    )
    const turned = createSetSpawnRecord(
      { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
      { position: { x: 0, y: 0, z: 0 }, yaw: 90 },
    )

    assert.equal(labelOf(moved), 'Move the spawn')
    assert.equal(labelOf(turned), 'Turn the spawn')
  })
})

void describe('createSetEntityPositionRecord', () => {
  void it('sorts the entities by their index, and reads one twice once', () => {
    const record = createSetEntityPositionRecord([
      { index: 3, before: { x: 0, y: 0, z: 0 }, after: { x: 1, y: 2, z: 3 } },
      { index: 1, before: { x: 4, y: 5, z: 6 }, after: { x: 7, y: 8, z: 9 } },
      { index: 3, before: { x: 1, y: 1, z: 1 }, after: { x: 2, y: 2, z: 2 } },
    ])

    assert.deepEqual(record.indices, [1, 3])
    // the first edit of an entity is the one the step keeps, whatever came after it
    assert.deepEqual(record.after, [
      { x: 7, y: 8, z: 9 },
      { x: 1, y: 2, z: 3 },
    ])
    assert.equal(record.version, HISTORY_RECORD_VERSION)
    assert.equal(record.kind, 'setEntityPosition')
  })

  void it('copies the two places, so a later edit of the level does not reach them', () => {
    const before = { x: 100, y: 0, z: 200 }
    const after = { x: 100, y: -40, z: 200 }
    const record = createSetEntityPositionRecord([{ index: 0, before, after }])

    before.x = 0
    after.y = 0

    assert.deepEqual(record.before, [{ x: 100, y: 0, z: 200 }])
    assert.deepEqual(record.after, [{ x: 100, y: -40, z: 200 }])
  })

  void it('writes the number of the entities in the caption', () => {
    const one = createSetEntityPositionRecord([{ index: 3, before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 1, z: 0 } }])
    const many = createSetEntityPositionRecord([
      { index: 1, before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 1, z: 0 } },
      { index: 2, before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 1, z: 0 } },
    ])

    assert.equal(labelOf(one), 'Move entity 3')
    assert.equal(labelOf(many), 'Move 2 entities')
  })
})

void describe('commandOf an entity move', () => {
  void it('writes the place of the entity on apply, and puts it back on revert', () => {
    const { level, entities } = fakeLevel(2, 2)
    const command = commandOf(
      createSetEntityPositionRecord([{ index: 1, before: { x: 1, y: 0, z: 0 }, after: { x: 1, y: 240, z: 0 } }]),
      level,
    )

    assert.notEqual(command, undefined)

    command?.apply()
    assert.deepEqual(entities[1]?.position, { x: 1, y: 240, z: 0 })
    // the entity the step does not hold stays where it was
    assert.deepEqual(entities[0]?.position, { x: 0, y: 0, z: 0 })

    command?.revert()
    assert.deepEqual(entities[1]?.position, { x: 1, y: 0, z: 0 })
  })

  void it('writes the entities of a step together, so one undo takes them all back', () => {
    const { level, entities } = fakeLevel(2, 2)
    const command = commandOf(
      createSetEntityPositionRecord([
        { index: 0, before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 50, z: 0 } },
        { index: 1, before: { x: 1, y: 0, z: 0 }, after: { x: 1, y: 60, z: 0 } },
      ]),
      level,
    )

    command?.apply()
    assert.deepEqual(
      entities.map((object) => {
        return object.position.y
      }),
      [50, 60],
    )

    command?.revert()
    assert.deepEqual(
      entities.map((object) => {
        return object.position.y
      }),
      [0, 0],
    )
  })

  void it('gives no command when an entity of the record is not in the level', () => {
    const { level } = fakeLevel(2, 1)
    const record = createSetEntityPositionRecord([
      { index: 4, before: { x: 0, y: 0, z: 0 }, after: { x: 0, y: 1, z: 0 } },
    ])

    assert.equal(commandOf(record, level), undefined)
  })
})

void describe('createImportMeshRecord', () => {
  void it('copies the polygons and the colors, so a later edit of the mesh does not reach the step', () => {
    const polygon = triangle(1)
    const record = createImportMeshRecord([polygon], { id: 9, name: 'jorge-[stone].jpg' }, true, [
      { r: 1, g: 2, b: 3, a: 255 },
    ])

    polygon.vertices[0].x = 42

    assert.equal(record.polygons[0]?.vertices[0].x, 1)
    assert.deepEqual(record.colors, [{ r: 1, g: 2, b: 3, a: 255 }])
    assert.deepEqual(record.texture, { id: 9, name: 'jorge-[stone].jpg' })
    assert.equal(record.addedTexture, true)
    assert.equal(record.kind, 'importMesh')
    assert.equal(record.version, HISTORY_RECORD_VERSION)
  })

  void it('writes the number of the faces in the caption', () => {
    const one = createImportMeshRecord([triangle(1)], { id: 1, name: 'a.bmp' }, false)
    const many = createImportMeshRecord([triangle(1), triangle(2)], { id: 1, name: 'a.bmp' }, false)

    assert.equal(labelOf(one), 'Import a face')
    assert.equal(labelOf(many), 'Import 2 faces')
  })
})

void describe('commandOf an import', () => {
  void it('puts the faces at the end of the level with their colors, and adds the container', () => {
    const { level, polygons, containers, lighting } = fakeLevel(2)
    const record = createImportMeshRecord([triangle(7), triangle(8)], { id: 9, name: 'jorge-[stone].jpg' }, true)
    const command = commandOf(record, level)

    assert.notEqual(command, undefined)

    command?.apply()

    assert.equal(polygons.length, 4)
    assert.equal(containers.get(9), 'jorge-[stone].jpg')
    // the two triangles take three colors each, appended to the palette of the level
    assert.equal(lighting.length, 7)
    assert.deepEqual(
      polygons.slice(2).map((polygon) => {
        return polygon.vertices[0]?.llfColorIdx
      }),
      [1, 4],
    )
    // the colors of the corners follow each other, and the fourth corner of a triangle takes the first
    assert.deepEqual(
      polygons[2]?.vertices.map((vertex) => {
        return vertex.llfColorIdx
      }),
      [1, 2, 3, 1],
    )

    command?.revert()

    assert.equal(polygons.length, 2)
    assert.equal(containers.get(9), undefined)
    assert.equal(lighting.length, 1)
  })

  void it('keeps the room of the imported faces, and the container the level already had', () => {
    const { level, polygons } = fakeLevel(2)
    const imported = triangle(7)

    imported.room = 3

    const command = commandOf(createImportMeshRecord([imported], { id: 1, name: '[stone]_wall1.bmp' }, false), level)

    command?.apply()

    assert.equal(polygons[2]?.room, 3)
    // the level has the container 1 already: the step does not touch it, so the undo must not take it away
    assert.notEqual(level.llf.colors.length, 0)
  })
})
