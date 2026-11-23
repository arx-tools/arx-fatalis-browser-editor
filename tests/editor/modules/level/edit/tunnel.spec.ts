import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxColor, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  faceGroupsOf,
  nextRoomIdOf,
  TUNNEL_LIGHT,
  TUNNEL_TEXTURE_NAME,
  tunnelPlanOf,
  type TunnelLevel,
} from '../../../../../src/editor/modules/level/edit/tunnel.ts'

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
 * @param corners The corners around the perimeter.
 * @param room The room of the face.
 *
 * @returns The face of the test.
 */
function quadOf(corners: readonly ArxVector3[], room: number): ArxPolygon {
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
 * A unit square of the `x = 0` plane, walked around its perimeter.
 *
 * @param at The `x` of the square.
 * @param room The room of the face.
 *
 * @returns The face of the test.
 */
function squareAt(at: number, room: number): ArxPolygon {
  return quadOf(
    [
      { x: at, y: 0, z: 0 },
      { x: at, y: 1, z: 0 },
      { x: at, y: 1, z: 1 },
      { x: at, y: 0, z: 1 },
    ],
    room,
  )
}

/**
 * A triangle with a zero in its fourth corner, the way a level stores it.
 *
 * @param at The `x` of the triangle.
 * @param room The room of the face.
 *
 * @returns The face of the test.
 */
function triangleAt(at: number, room: number): ArxPolygon {
  return {
    vertices: [
      vertexOf({ x: at, y: 0, z: 0 }),
      vertexOf({ x: at, y: 1, z: 0 }),
      vertexOf({ x: at, y: 0, z: 1 }),
      vertexOf({ x: 0, y: 0, z: 0 }),
    ],
    textureContainerId: 1,
    norm: { x: 1, y: 0, z: 0 },
    norm2: { x: 1, y: 0, z: 0 },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.None,
    room,
  }
}

/**
 * The level of the test: the faces, a palette and the containers of the textures.
 *
 * @param polygons The faces of the level.
 * @param options The palette and the container the level already has.
 * @param options.colors The palette of the level, one color when it is left out.
 * @param options.textureId The id of the container the level already has, when it has one.
 *
 * @returns The level as the builder reads it.
 */
function fakeLevel(
  polygons: readonly ArxPolygon[],
  options: { colors?: readonly ArxColor[]; textureId?: number } = {},
): TunnelLevel {
  return {
    polygons,
    llf: { colors: options.colors ?? [{ r: 1, g: 2, b: 3, a: 1 }] },
    textureContainerIdOfName: (name: string): number | undefined => {
      if (name === TUNNEL_TEXTURE_NAME) {
        return options.textureId
      }

      return undefined
    },
    nextTextureContainerId: (): number => {
      return 2
    },
  }
}

/**
 * The two faces of an opening of the test: one hole of room 17 and one of room 26.
 *
 * @returns The two faces, one at each side of the wall.
 */
function openingOfTest(): ArxPolygon[] {
  return [squareAt(0, 17), squareAt(10, 26)]
}

void describe('faceGroupsOf', () => {
  void it('puts two faces that share an edge into one group', () => {
    const first = squareAt(0, 17)
    const second = quadOf(
      [
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 2, z: 1 },
        { x: 0, y: 1, z: 1 },
      ],
      17,
    )

    assert.deepEqual(faceGroupsOf([first, second], [0, 1]), [[0, 1]])
  })

  void it('keeps two faces that do not touch apart', () => {
    assert.deepEqual(faceGroupsOf(openingOfTest(), [0, 1]), [[0], [1]])
  })

  void it('does not join two triangles through the zero of their fourth corner', () => {
    const level = [triangleAt(0, 17), triangleAt(20, 17)]

    assert.deepEqual(faceGroupsOf(level, [0, 1]), [[0], [1]])
  })
})

void describe('nextRoomIdOf', () => {
  void it('is one above the biggest room of the level', () => {
    const level = [squareAt(0, 1), squareAt(1, 26), squareAt(2, 5)]

    assert.equal(nextRoomIdOf(level), 27)
  })

  void it('gives a room for a level without one', () => {
    assert.equal(nextRoomIdOf([]), 1)
  })
})

void describe('tunnelPlanOf', () => {
  void it('plans the tunnel between the two holes of the selection', () => {
    const level = fakeLevel(openingOfTest(), { colors: [{ r: 1, g: 2, b: 3, a: 1 }] })
    const plan = tunnelPlanOf(level, [1, 0, 1])

    assert.equal(plan?.removed.length, 2)
    assert.deepEqual(plan?.removed, [0, 1])
    assert.equal(plan?.added.length, 4)
    assert.equal(plan?.room, 27)
    assert.equal(plan?.textureName, TUNNEL_TEXTURE_NAME)
    assert.equal(plan?.textureContainerId, 2)
    assert.equal(plan?.addedTexture, true)
    assert.deepEqual(plan?.lighting, [
      { r: TUNNEL_LIGHT, g: TUNNEL_LIGHT, b: TUNNEL_LIGHT, a: 1 },
      { r: TUNNEL_LIGHT, g: TUNNEL_LIGHT, b: TUNNEL_LIGHT, a: 1 },
      { r: TUNNEL_LIGHT, g: TUNNEL_LIGHT, b: TUNNEL_LIGHT, a: 1 },
      { r: TUNNEL_LIGHT, g: TUNNEL_LIGHT, b: TUNNEL_LIGHT, a: 1 },
    ])
    assert.ok(
      plan?.added.every((polygon) => {
        return polygon.room === 27 && polygon.textureContainerId === 2
      }),
    )
    // the palette of the test has one color, so the block of the tunnel starts after it
    assert.deepEqual(
      plan?.added[0]?.vertices.map((vertex) => {
        return vertex.llfColorIdx
      }),
      [1, 2, 3, 4],
    )
  })

  void it('takes the container of the level when it already has the texture', () => {
    const level = fakeLevel(openingOfTest(), { textureId: 5 })
    const plan = tunnelPlanOf(level, [0, 1])

    assert.equal(plan?.textureContainerId, 5)
    assert.equal(plan?.addedTexture, false)
  })

  void it('makes a portal for both openings, facing their rooms', () => {
    const level = fakeLevel([squareAt(0, 17), squareAt(10, 26), squareAt(-50, 17), squareAt(60, 26)])
    const plan = tunnelPlanOf(level, [0, 1])

    assert.equal(plan?.portals.length, 2)
    assert.deepEqual(
      plan?.portals.map((portal) => {
        return [portal.room1, portal.room2]
      }),
      [
        [17, 27],
        [26, 27],
      ],
    )

    const toRoom17 = plan?.portals[0]?.polygon.norm.x ?? 0
    const toRoom26 = plan?.portals[1]?.polygon.norm.x ?? 0

    // the normal points into the room of the opening, as the game reads room1
    assert.ok(toRoom17 < -0.5)
    assert.ok(toRoom26 > 0.5)

    assert.ok(
      (plan?.portals ?? []).every((portal) => {
        const normalLength = Math.hypot(portal.polygon.norm.x, portal.polygon.norm.y, portal.polygon.norm.z)

        return (
          portal.polygon.vertices.length === 4 &&
          (portal.polygon.vertices[0]?.rhw ?? 0) > 0 &&
          Math.abs(normalLength - 1) < 1e-9
        )
      }),
    )
  })

  void it('does not touch the palette of a level without one', () => {
    const level = fakeLevel(openingOfTest(), { colors: [] })
    const plan = tunnelPlanOf(level, [0, 1])

    assert.deepEqual(plan?.lighting, [])
    assert.deepEqual(
      plan?.added[0]?.vertices.map((vertex) => {
        return vertex.llfColorIdx
      }),
      [0, 1, 2, 3],
    )
  })

  void it('refuses a selection of one hole', () => {
    const level = fakeLevel(openingOfTest())
    const plan = tunnelPlanOf(level, [0])

    assert.equal(plan, undefined)
  })

  void it('refuses a selection of three holes', () => {
    const level = fakeLevel([squareAt(0, 17), squareAt(10, 17), squareAt(20, 26)])
    const plan = tunnelPlanOf(level, [0, 1, 2])

    assert.equal(plan, undefined)
  })

  void it('refuses a face that is not in the level', () => {
    const level = fakeLevel(openingOfTest())

    assert.equal(tunnelPlanOf(level, [0, 5]), undefined)
  })

  void it('refuses a group with a hole of its own', () => {
    // a 3x3 patch of quads without the middle one: the group has an outer rim and an inner one
    const level: ArxPolygon[] = []

    for (let tileY = 0; tileY < 3; tileY = tileY + 1) {
      for (let tileZ = 0; tileZ < 3; tileZ = tileZ + 1) {
        if (tileY === 1 && tileZ === 1) {
          continue
        }

        level.push(
          quadOf(
            [
              { x: 0, y: tileY, z: tileZ },
              { x: 0, y: tileY + 1, z: tileZ },
              { x: 0, y: tileY + 1, z: tileZ + 1 },
              { x: 0, y: tileY, z: tileZ + 1 },
            ],
            17,
          ),
        )
      }
    }

    const ring = level.length
    const secondRing = level.map((polygon) => {
      return quadOf(
        polygon.vertices.map((vertex) => {
          return { x: 10, y: vertex.y, z: vertex.z }
        }),
        26,
      )
    })

    const plan = tunnelPlanOf(
      fakeLevel([...level, ...secondRing]),
      Array.from({ length: ring * 2 }, (_unused, index) => {
        return index
      }),
    )

    assert.equal(plan, undefined)
  })
})
