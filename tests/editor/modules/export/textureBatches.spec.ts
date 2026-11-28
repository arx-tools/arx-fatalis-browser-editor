import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxTextureContainer } from 'arx-convert/types'
import {
  MAX_BUCKET_INDICES,
  MAX_TEXTURE_CORNERS,
  batchBucketOf,
  splitTextureBatchesOf,
  textureStemOf,
} from '../../../../src/editor/modules/export/textureBatches.ts'

/**
 * A face of the test: a quad whose corners are not read by the split.
 *
 * @param container The id of the container the face draws with.
 * @param room The id of the room it belongs to.
 * @param options Whether it is transparent, and how much.
 * @param options.transparent Whether it carries the transparent flag.
 * @param options.transval How transparent it is, in the units of the game.
 *
 * @returns The face.
 */
function quadOf(
  container: number,
  room: number,
  options: { transparent?: boolean; transval?: number } = {},
): ArxPolygon {
  const corner = { x: 0, y: 0, z: 0, u: 0, v: 0 }
  let flags: number = ArxPolygonFlags.Quad

  if (options.transparent === true) {
    flags = flags | ArxPolygonFlags.Transparent
  }

  return {
    vertices: [corner, corner, corner, corner],
    textureContainerId: container,
    norm: { x: 0, y: 1, z: 0 },
    norm2: { x: 0, y: 1, z: 0 },
    transval: options.transval ?? 0,
    area: 1,
    flags,
    room,
  }
}

/**
 * A triangle of the test.
 *
 * @param container The id of the container the face draws with.
 * @param room The id of the room it belongs to.
 *
 * @returns The face.
 */
function triangleOf(container: number, room: number): ArxPolygon {
  const corner = { x: 0, y: 0, z: 0, u: 0, v: 0 }

  return {
    vertices: [corner, corner, corner, corner],
    textureContainerId: container,
    norm: { x: 0, y: 1, z: 0 },
    norm2: { x: 0, y: 1, z: 0 },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.None,
    room,
  }
}

/**
 * Fills a list with the same face, so a batch can be measured at the limit.
 *
 * @param count How many faces to make.
 * @param face The face to repeat.
 *
 * @returns The faces.
 */
function repeatedFaceOf(count: number, face: ArxPolygon): ArxPolygon[] {
  return Array.from({ length: count }, () => {
    return face
  })
}

/**
 * A container of the test.
 *
 * @param id The number the polygons name the container with.
 * @param filename The texture file the container draws with.
 *
 * @returns A container with that id and file name.
 */
function containerOf(id: number, filename: string): ArxTextureContainer {
  return { id, filename }
}

void describe('textureStemOf', () => {
  void it('takes the last extension off the name', () => {
    assert.equal(textureStemOf('[stone]_wall1.bmp'), '[stone]_wall1')
    assert.equal(textureStemOf('jorge-[stone].jpg'), 'jorge-[stone]')
  })

  void it('leaves a name without an extension alone', () => {
    assert.equal(textureStemOf('[glass]_windows2'), '[glass]_windows2')
  })

  void it('takes an extension the game does not know off too, the way the game does', () => {
    assert.equal(textureStemOf('[stone]_wall.v2'), '[stone]_wall')
  })
})

void describe('batchBucketOf', () => {
  void it('draws a face without the transparent flag in the opaque pass', () => {
    assert.equal(batchBucketOf(quadOf(1, 0)), 'opaque')
  })

  void it('sorts a transparent face by its transval, the way the game does', () => {
    const faces = [0, 0.5, 1, 1.5, 2, 3].map((transval) => {
      return batchBucketOf(quadOf(1, 0, { transparent: true, transval }))
    })

    assert.deepEqual(faces, ['subtractive', 'blended', 'additive', 'additive', 'multiplicative', 'multiplicative'])
  })
})

void describe('splitTextureBatchesOf', () => {
  void it('leaves a level under the limits as it is', () => {
    const polygons = [...repeatedFaceOf(3, quadOf(1, 0)), triangleOf(1, 1)]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.deepEqual(split.containerIds, [1, 1, 1, 1])
    assert.deepEqual(split.containers, containers)
    assert.deepEqual(split.copies, [])
  })

  void it('copies the texture of a batch that is too big, and keeps the faces of the level on their own', () => {
    // a batch holds 10 922 quads (65 535 indices of six), so the eleventh thousand opens a copy
    const polygons = repeatedFaceOf(12_000, quadOf(1, 0))
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.equal(split.containerIds[0], 1)
    assert.equal(split.containerIds[10_921], 1)
    assert.equal(split.containerIds[10_922], 2)
    assert.equal(split.containerIds[11_999], 2)
    assert.deepEqual(split.containers, [containerOf(1, '[stone]_wall1.bmp'), containerOf(2, '[stone]_wall1~2.bmp')])
    assert.deepEqual(split.copies, [{ name: '[stone]_wall1~2.bmp', from: '[stone]_wall1.bmp' }])
  })

  void it('counts the triangles as three indices, so more of them fit in a batch', () => {
    const polygons = repeatedFaceOf(21_845, triangleOf(1, 0))
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    // 65 535 indices of three is 21 845 triangles: the first batch takes all of them, and no copy is made
    assert.deepEqual(split.copies, [])
  })

  void it('merges the containers of one stem into one batch, the way the game looks a texture up', () => {
    // the game takes the extension off the name, so a level that says .bmp and .jpg has one batch of 12 000 quads
    const polygons = [...repeatedFaceOf(6000, quadOf(1, 0)), ...repeatedFaceOf(6000, quadOf(2, 0))]
    const containers = [containerOf(1, '[stone]_wall1.bmp'), containerOf(2, '[stone]_wall1.jpg')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.deepEqual(split.containers, [
      containerOf(1, '[stone]_wall1.bmp'),
      containerOf(2, '[stone]_wall1.jpg'),
      containerOf(3, '[stone]_wall1~2.bmp'),
    ])
    assert.equal(split.containerIds[10_921], 2)
    assert.equal(split.containerIds[10_922], 3)
    assert.deepEqual(split.copies, [{ name: '[stone]_wall1~2.bmp', from: '[stone]_wall1.bmp' }])
  })

  void it('opens a copy when the corners of a texture pass the limit, even if every bucket has room', () => {
    // 9 000 opaque and 9 000 blended quads: both buckets stay under 65 535 indices, but the 18 000 quads are 72 000
    // corners, and the index of a corner is a 16 bit value
    const polygons = [
      ...repeatedFaceOf(9000, quadOf(1, 0)),
      ...repeatedFaceOf(9000, quadOf(1, 0, { transparent: true, transval: 0.5 })),
    ]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)
    const first = split.containerIds.slice(0, 9000).filter((id) => {
      return id === 1
    }).length
    const second = split.containerIds.slice(9000).filter((id) => {
      return id === 2
    }).length

    // the first batch takes 7 383 of the blended quads too, the copy takes the rest
    assert.equal(first, 9000)
    assert.equal(second, 1617)
    assert.equal(split.containers.length, 2)

    // 9 000 + 7 383 quads is 65 532 corners: under the limit, and one more quad would pass it
    const corners = (9000 + 7383) * 4

    assert.ok(corners <= MAX_TEXTURE_CORNERS)
    assert.ok(corners + 4 > MAX_TEXTURE_CORNERS)
  })

  void it('makes one copy for a texture two rooms overflow, and splits both', () => {
    const polygons = [...repeatedFaceOf(12_000, quadOf(1, 0)), ...repeatedFaceOf(12_000, quadOf(1, 1))]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.equal(split.containers.length, 2)
    assert.equal(split.copies.length, 1)
    // the first room's faces stay on the level's container up to the limit, and so do the second room's
    assert.equal(split.containerIds[10_921], 1)
    assert.equal(split.containerIds[10_922], 2)
    assert.equal(split.containerIds[12_000 + 10_921], 1)
    assert.equal(split.containerIds[12_000 + 10_922], 2)
  })

  void it('never takes a name the level already has', () => {
    const polygons = repeatedFaceOf(12_000, quadOf(1, 0))
    const containers = [containerOf(1, '[stone]_wall1.bmp'), containerOf(2, '[stone]_wall1~2.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.deepEqual(split.copies, [{ name: '[stone]_wall1~3.bmp', from: '[stone]_wall1.bmp' }])
    assert.deepEqual(split.containers.at(-1), containerOf(3, '[stone]_wall1~3.bmp'))
  })

  void it('leaves the faces of no room and of no container alone', () => {
    const polygons = [
      ...repeatedFaceOf(12_000, quadOf(1, -1)),
      ...repeatedFaceOf(12_000, quadOf(9, 0)),
      triangleOf(0, 0),
    ]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)

    assert.deepEqual(split.copies, [])
    assert.deepEqual(split.containers, containers)
    assert.equal(split.containerIds[24_000], 0)
  })

  void it('splits the same list into the same copies', () => {
    const polygons = [...repeatedFaceOf(12_000, quadOf(1, 0)), ...repeatedFaceOf(12_000, quadOf(1, 1))]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const first = splitTextureBatchesOf(polygons, containers)
    const second = splitTextureBatchesOf(polygons, containers)

    assert.deepEqual(second, first)
  })

  void it('keeps every index of a batch under the limit of the game', () => {
    const polygons = [
      ...repeatedFaceOf(30_000, quadOf(1, 0)),
      ...repeatedFaceOf(30_000, quadOf(1, 0, { transparent: true, transval: 0.5 })),
      ...repeatedFaceOf(30_000, triangleOf(1, 0)),
    ]
    const containers = [containerOf(1, '[stone]_wall1.bmp')]

    const split = splitTextureBatchesOf(polygons, containers)
    const corners = new Map<number, number>()
    const indices = new Map<string, number>()

    for (const [index, id] of split.containerIds.entries()) {
      const polygon = polygons[index]

      if (polygon === undefined) {
        continue
      }

      const quad = (polygon.flags & ArxPolygonFlags.Quad) !== 0
      const bucket = `${String(id)}:${batchBucketOf(polygon)}`
      let cornerCount = 3
      let indexCount = 3

      if (quad) {
        cornerCount = 4
        indexCount = 6
      }

      corners.set(id, (corners.get(id) ?? 0) + cornerCount)
      indices.set(bucket, (indices.get(bucket) ?? 0) + indexCount)
    }

    const cornerCounts = corners.values().toArray()
    const indexCounts = indices.values().toArray()

    assert.ok(
      cornerCounts.every((count) => {
        return count <= MAX_TEXTURE_CORNERS
      }),
      `a container has ${cornerCounts.join(', ')} corners`,
    )
    assert.ok(
      indexCounts.every((count) => {
        return count <= MAX_BUCKET_INDICES
      }),
      `a bucket has ${indexCounts.join(', ')} indices`,
    )
  })
})
