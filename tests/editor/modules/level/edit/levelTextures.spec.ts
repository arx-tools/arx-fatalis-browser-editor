import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { BufferAttribute, DoubleSide, FrontSide, Texture, type Material, type MeshLambertMaterial } from 'three'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import {
  createBlankLevelFiles,
  FLAT_PRESET,
  MINIMAL_PRESET,
} from '../../../../../src/editor/modules/level/blankLevel.ts'
import { applyColourKey } from '../../../../../src/editor/modules/textures/image.ts'
import { paintKeyOf, type PaintKey } from '../../../../../src/editor/modules/level/edit/levelTextures/paint.ts'
import { paintLevelTextures, unpaintLevelTextures } from '../../../../../src/editor/modules/level/edit/levelTextures.ts'
import {
  drawnRunsOf,
  faceRunsOf,
  solidPolygonsOf,
  textureNamesOf,
} from '../../../../../src/editor/modules/level/edit/levelTextures/runs.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * A polygon of the test, with the fields the runs read.
 *
 * @param textureContainerId The container it draws with.
 * @param quad Whether it is a quad (six vertices) or a triangle (three).
 *
 * @returns The polygon, with the container and the shape the test asks for.
 */
function polygonOf(textureContainerId: number, quad: boolean): ArxPolygon {
  let flags = 0

  // `ArxPolygonFlags.Quad` is the 6th bit: `isQuad` reads that
  if (quad) {
    flags = 64
  }

  return { flags, textureContainerId } as unknown as ArxPolygon
}

/**
 * The key of an opaque face of the test.
 *
 * @param name The name of its texture.
 *
 * @returns What the face draws with.
 */
function opaqueKeyOf(name: string | undefined): PaintKey {
  return { name, doubleSided: false, blend: 'opaque', trans: 1 }
}

/**
 * Builds the minimal blank level as a map.
 *
 * @returns A level of one quad, ready for the paint.
 */
function blankMap(): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

void describe('applyColourKey', () => {
  void it('makes the black pixels of a BMP transparent', () => {
    // one black pixel, with no neighbour to take a colour from
    const pixels = new Uint8ClampedArray([0, 0, 0, 255])

    applyColourKey(pixels, 1, 1)

    assert.deepEqual([...pixels], [0, 0, 0, 0])
  })

  void it('gives a transparent pixel the colour of an opaque neighbour', () => {
    // the left pixel is opaque, the right one is black: a filter must not mix black into the lit one
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 255])

    applyColourKey(pixels, 2, 1)

    assert.deepEqual([...pixels], [10, 20, 30, 255, 10, 20, 30, 0])
  })

  void it('leaves an image without a black pixel alone', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 128, 128, 128, 255])

    applyColourKey(pixels, 2, 1)

    assert.deepEqual([...pixels], [10, 20, 30, 255, 128, 128, 128, 255])
  })
})

void describe('faceRunsOf', () => {
  void it('merges the neighbouring faces of the same texture', () => {
    const runs = faceRunsOf([polygonOf(1, true), polygonOf(1, false), polygonOf(1, true)], () => {
      return opaqueKeyOf('wall')
    })

    assert.deepEqual(runs, [{ start: 0, count: 6 + 3 + 6, key: opaqueKeyOf('wall') }])
  })

  void it('starts a run where the texture changes', () => {
    const polygons = [polygonOf(1, true), polygonOf(2, false), polygonOf(1, true), polygonOf(1, true)]
    const names = new Map([
      [1, 'wall'],
      [2, 'floor'],
    ])
    const runs = faceRunsOf(polygons, (polygon) => {
      return opaqueKeyOf(names.get(polygon.textureContainerId))
    })

    assert.deepEqual(runs, [
      { start: 0, count: 6, key: opaqueKeyOf('wall') },
      { start: 6, count: 3, key: opaqueKeyOf('floor') },
      { start: 9, count: 12, key: opaqueKeyOf('wall') },
    ])
  })

  void it('gives the faces with no container a run of their own', () => {
    const runs = faceRunsOf([polygonOf(1, true), polygonOf(9, true)], () => {
      return opaqueKeyOf(undefined)
    })

    assert.deepEqual(runs, [{ start: 0, count: 12, key: opaqueKeyOf(undefined) }])
  })
})

void describe('the paint of a level', () => {
  void it('reads the solid polygons and their texture names', () => {
    const map = blankMap()
    const polygons = solidPolygonsOf(map)

    assert.equal(polygons.length, 1)
    assert.deepEqual(textureNamesOf(map), ['jorge-[stone].jpg'])
  })

  void it('puts one material per texture and groups the geometry', () => {
    const map = blankMap()
    const textures = new Map([['jorge-[stone].jpg', new Texture()]])
    const painted = paintLevelTextures(map, textures)
    const geometry = map.solidMeshes[0]?.geometry

    assert.equal(painted, 1)
    assert.deepEqual(geometry?.groups, [{ start: 0, count: 6, materialIndex: 0 }])
    assert.equal(Array.isArray(map.solidMeshes[0]?.material), true)
  })

  void it('keeps the faces flat where the zip has no texture', () => {
    const map = blankMap()
    const painted = paintLevelTextures(map, new Map())
    const geometry = map.solidMeshes[0]?.geometry

    assert.equal(painted, 0)
    assert.deepEqual(geometry?.groups, [{ start: 0, count: 6, materialIndex: 0 }])
  })

  void it('draws the containers the zip has none for with the placeholder', () => {
    const map = blankMap()
    const missing = new Texture()

    paintLevelTextures(map, new Map(), missing)

    const materials = map.solidMeshes[0]?.material
    let first: Material | undefined

    if (Array.isArray(materials)) {
      first = materials[0]
    }

    assert.deepEqual((first as MeshLambertMaterial).map, missing)
  })

  void it('draws the two-sided faces with a material of two sides', () => {
    // a floor of many tiles, so an edit can rebuild the runs: the side of a face is part of a run, and the runs are
    // built with the index (a flag set after the build needs a rebuild)
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf)
    const textures = new Map([['jorge-[stone].jpg', new Texture()]])
    const polygon = map.polygons[0]

    assert.notEqual(polygon, undefined)

    if (polygon === undefined) {
      return
    }

    ;(polygon as { flags: number }).flags = polygon.flags | 2

    map.deletePolygons([map.polygons.length - 1])
    paintLevelTextures(map, textures)

    const materials = map.solidMeshes[0]?.material
    const groups = map.solidMeshes[0]?.geometry.groups ?? []

    assert.equal(Array.isArray(materials), true)

    if (!Array.isArray(materials)) {
      return
    }

    // the keys are the materials in the order the faces appear, and the flagged tile is the first polygon: its
    // two-sided material is the first one
    assert.equal((materials[0] as MeshLambertMaterial).side, DoubleSide)
    assert.equal((materials[1] as MeshLambertMaterial).side, FrontSide)
    // the index is in the run order: the one-sided faces first, the two-sided one after them
    assert.equal(groups.length, 2)
    assert.equal(groups[0]?.materialIndex, 1)
    assert.equal(groups[1]?.materialIndex, 0)
  })

  void it('covers the whole index with the groups, in the order the geometry draws', () => {
    const map = blankMap()
    const textures = new Map([['jorge-[stone].jpg', new Texture()]])

    paintLevelTextures(map, textures)

    const index = map.solidMeshes[0]?.geometry.getIndex() ?? new BufferAttribute(new Float32Array(0), 1)

    // the picking builds a BVH, and its tree writes an index: the groups have to be in that order, not the plain one
    assert.equal(index.count > 0, true)

    const key = paintKeyOf(opaqueKeyOf('jorge-[stone].jpg'))
    const runs = drawnRunsOf(map, index, new Map([[key, 0]]))

    // every face of the blank level stands on the same texture, so one run covers the whole index from its first place
    assert.deepEqual(runs, [{ start: 0, count: index.count, index: 0 }])
  })

  void it('builds the groups from the runs of the map, the same ones the walk gives', () => {
    const map = blankMap()
    const textures = new Map([['jorge-[stone].jpg', new Texture()]])

    paintLevelTextures(map, textures)

    const geometry = map.solidMeshes[0]?.geometry
    const index = geometry?.getIndex() ?? null

    assert.notEqual(index, null)

    if (geometry === undefined || index === null) {
      return
    }

    const key = paintKeyOf(opaqueKeyOf('jorge-[stone].jpg'))
    const expected = drawnRunsOf(map, index, new Map([[key, 0]]))

    assert.deepEqual(
      geometry.groups.map((group) => {
        return { start: group.start, count: group.count, materialIndex: group.materialIndex }
      }),
      expected.map((run) => {
        return { start: run.start, count: run.count, materialIndex: run.index }
      }),
    )
  })

  void it('falls back to the walk over the triangles when the runs do not cover the index', () => {
    const map = blankMap()

    // a map whose runs are gone (the guard of a consumer that replaced the geometry): the walk is the answer
    ;(map as unknown as { textureRuns: unknown[] }).textureRuns = []

    paintLevelTextures(map, new Map([['jorge-[stone].jpg', new Texture()]]))

    const geometry = map.solidMeshes[0]?.geometry
    const index = geometry?.getIndex() ?? null

    assert.notEqual(index, null)
    assert.equal(geometry?.groups.length, 1)
    assert.equal(geometry?.groups[0]?.count, index?.count)
  })

  void it('puts the flat material back and drops the groups', () => {
    const map = blankMap()
    const geometry = map.solidMeshes[0]?.geometry

    paintLevelTextures(map, new Map([['jorge-[stone].jpg', new Texture()]]))
    unpaintLevelTextures(map)

    assert.deepEqual(geometry?.groups, [])
    assert.equal(Array.isArray(map.solidMeshes[0]?.material), false)
  })
})
