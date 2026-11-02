import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import JSZip from 'jszip'
import { BufferAttribute, Texture, type Material, type MeshLambertMaterial } from 'three'
import { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import {
  drawnRunsOf,
  faceRunsOf,
  findTextureFiles,
  paintLevelTextures,
  solidPolygonsOf,
  textureNamesOf,
  unpaintLevelTextures,
} from '../../../../src/editor/modules/level/levelTextures.ts'
import { Settings } from '../../../../src/generator/Settings.ts'

/**
 * Builds a zip in memory.
 *
 * @param files The path of every file and its content.
 *
 * @returns The bytes of the zip.
 */
async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const archive = new JSZip()

  for (const [path, content] of Object.entries(files)) {
    archive.file(path, content)
  }

  return await archive.generateAsync({ type: 'arraybuffer' })
}

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
 * Builds the minimal blank level as a map.
 *
 * @returns A level of one quad, ready for the paint.
 */
function blankMap(): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

void describe('findTextureFiles', () => {
  const names = ['[stone]_wall.bmp', '[wood]_floor.jpg', 'missing.bmp']

  void it('finds the textures of the level in the zip by their name', async () => {
    const data = await zipOf({
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
      'graph/obj3d/textures/[wood]_floor.jpg': 'jpg',
      'sfx/click.wav': 'wav',
    })
    const files = await findTextureFiles(data, names)

    assert.deepEqual(files.keys().toArray().toSorted(), ['[stone]_wall.bmp', '[wood]_floor.jpg'])
  })

  void it('takes only the files the manifest lists', async () => {
    const data = await zipOf({
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
      // a texture the zip still carries but the level no longer uses: the manifest does not list it
      'graph/obj3d/textures/[wood]_floor.jpg': 'jpg',
      'manifest.json': JSON.stringify({
        name: 'A level',
        // the real manifest names the installed files with absolute machine paths
        files: ['/home/lali/maps/mine/graph/obj3d/textures/[stone]_wall.bmp', '/home/lali/maps/mine/sfx/click.wav'],
      }),
    })
    const files = await findTextureFiles(data, names)

    assert.deepEqual(files.keys().toArray(), ['[stone]_wall.bmp'])
  })

  void it('finds a texture the level names without its extension', async () => {
    const data = await zipOf({ 'graph/obj3d/textures/[glass]_windows2.jpg': 'jpg' })
    const files = await findTextureFiles(data, ['[glass]_windows2'])

    assert.deepEqual(files.keys().toArray(), ['[glass]_windows2'])
  })

  void it('finds the textures when the manifest is not JSON', async () => {
    const data = await zipOf({
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
      'manifest.json': 'not a json at all',
    })
    const files = await findTextureFiles(data, names)

    assert.deepEqual(files.keys().toArray(), ['[stone]_wall.bmp'])
  })
})

void describe('faceRunsOf', () => {
  void it('merges the neighbouring faces of the same texture', () => {
    const runs = faceRunsOf([polygonOf(1, true), polygonOf(1, false), polygonOf(1, true)], () => {
      return 'wall'
    })

    assert.deepEqual(runs, [{ start: 0, count: 6 + 3 + 6, name: 'wall' }])
  })

  void it('starts a run where the texture changes', () => {
    const polygons = [polygonOf(1, true), polygonOf(2, false), polygonOf(1, true), polygonOf(1, true)]
    const names = new Map([
      [1, 'wall'],
      [2, 'floor'],
    ])
    const runs = faceRunsOf(polygons, (polygon) => {
      return names.get(polygon.textureContainerId)
    })

    assert.deepEqual(runs, [
      { start: 0, count: 6, name: 'wall' },
      { start: 6, count: 3, name: 'floor' },
      { start: 9, count: 12, name: 'wall' },
    ])
  })

  void it('gives the faces with no container a run of their own', () => {
    const runs = faceRunsOf([polygonOf(1, true), polygonOf(9, true)], () => {
      return undefined
    })

    assert.deepEqual(runs, [{ start: 0, count: 12, name: undefined }])
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
    assert.deepEqual(geometry?.groups, [{ start: 0, count: 6, materialIndex: 1 }])
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

  void it('covers the whole index with the groups, in the order the geometry draws', () => {
    const map = blankMap()
    const textures = new Map([['jorge-[stone].jpg', new Texture()]])

    paintLevelTextures(map, textures)

    const index = map.solidMeshes[0]?.geometry.getIndex() ?? new BufferAttribute(new Float32Array(0), 1)

    // the picking builds a BVH, and its tree writes an index: the groups have to be in that order, not the plain one
    assert.equal(index.count > 0, true)

    const runs = drawnRunsOf(map, index, new Map([['jorge-[stone].jpg', 1]]))

    // every face of the blank level stands on the same texture, so one run covers the whole index from its first place
    assert.deepEqual(runs, [{ start: 0, count: index.count, index: 1 }])
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
