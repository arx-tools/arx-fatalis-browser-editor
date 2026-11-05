import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import JSZip from 'jszip'
import { findTextureFiles, zipImageNames } from '../../../../../../src/editor/modules/level/edit/levelTextures/load.ts'

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

void describe('zipImageNames', () => {
  void it('lists the images of the zip by their base name', async () => {
    const data = await zipOf({
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
      'graph/obj3d/textures/[wood]_floor.jpg': 'jpg',
      'graph/obj3d/textures/[grass]_ground.png': 'png',
    })

    assert.deepEqual(await zipImageNames(data), ['[stone]_wall.bmp', '[wood]_floor.jpg', '[grass]_ground.png'])
  })

  void it('leaves the files that are not images out', async () => {
    // a zip of a level has its level files, its scripts and its sounds beside the textures
    const data = await zipOf({
      'graph/levels/level1.dlf': 'dlf',
      'graph/levels/level1.fts': 'fts',
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
      'misc/level.asl': 'asl',
      'sfx/click.wav': 'wav',
      'manifest.json': '{}',
    })

    assert.deepEqual(await zipImageNames(data), ['[stone]_wall.bmp'])
  })

  void it('lists an image once, in the order of the zip', async () => {
    const data = await zipOf({
      'graph/obj3d/textures/[wood]_floor.jpg': 'jpg',
      'custom/[wood]_floor.jpg': 'jpg',
      'graph/obj3d/textures/[stone]_wall.bmp': 'bmp',
    })

    assert.deepEqual(await zipImageNames(data), ['[wood]_floor.jpg', '[stone]_wall.bmp'])
  })

  void it('knows the images under a name of any case', async () => {
    // the game came from Windows, and the zips of the authors do not always keep the case of the extension
    const data = await zipOf({ 'graph/obj3d/textures/[stone]_wall.BMP': 'bmp' })

    assert.deepEqual(await zipImageNames(data), ['[stone]_wall.BMP'])
  })
})
