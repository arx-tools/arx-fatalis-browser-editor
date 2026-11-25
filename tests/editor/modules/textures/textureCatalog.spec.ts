import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import JSZip from 'jszip'
import type { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { bytesOf, publishLevelTextures } from '../../../../src/editor/modules/textures/textureCatalog.ts'

/**
 * A zip that carries one image, the way the zip of a level carries its textures.
 *
 * @param name The name of the file inside the zip.
 * @param bytes The content of the file.
 *
 * @returns The bytes of the archive.
 */
async function zipOf(name: string, bytes: Uint8Array): Promise<ArrayBuffer> {
  const archive = new JSZip()

  archive.file(`graph/obj3d/textures/${name}`, bytes)

  return await archive.generateAsync({ type: 'arraybuffer' })
}

/**
 * A level, as much as the texture list reads of it: the identity the custom group belongs to.
 */
const LEVEL = {} as unknown as ArxMap

void describe('bytesOf', () => {
  void it('reads an image of the zip the level does not use yet', async () => {
    const content = new Uint8Array([1, 2, 3, 4])
    const zip = await zipOf('pcgame_box_art_big_rigs.png', content)

    publishLevelTextures({
      map: LEVEL,
      fromZip: new Map(),
      fromDataDir: [],
      zipImages: ['pcgame_box_art_big_rigs.png'],
      zip,
    })

    const bytes = await bytesOf({ source: 'custom', name: 'pcgame_box_art_big_rigs.png' })

    assert.deepEqual(new Uint8Array(bytes ?? new ArrayBuffer(0)), content)
  })

  void it('reads the images of the same zip once it is opened', async () => {
    const first = new Uint8Array([5, 6])
    const second = new Uint8Array([7, 8])
    const archive = new JSZip()

    archive.file('graph/obj3d/textures/one.png', first)
    archive.file('graph/obj3d/textures/two.png', second)

    const zip = await archive.generateAsync({ type: 'arraybuffer' })

    publishLevelTextures({ map: LEVEL, fromZip: new Map(), fromDataDir: [], zipImages: ['one.png', 'two.png'], zip })

    const one = await bytesOf({ source: 'custom', name: 'one.png' })
    const two = await bytesOf({ source: 'custom', name: 'two.png' })

    assert.deepEqual(new Uint8Array(one ?? new ArrayBuffer(0)), first)
    assert.deepEqual(new Uint8Array(two ?? new ArrayBuffer(0)), second)
  })

  void it('finds a name without its case, the way the files of the game are named', async () => {
    const content = new Uint8Array([9])
    const zip = await zipOf('Screen-Neofetch.JPG', content)

    publishLevelTextures({ map: LEVEL, fromZip: new Map(), fromDataDir: [], zipImages: ['Screen-Neofetch.JPG'], zip })

    const bytes = await bytesOf({ source: 'custom', name: 'screen-neofetch.jpg' })

    assert.deepEqual(new Uint8Array(bytes ?? new ArrayBuffer(0)), content)
  })

  void it('gives nothing for a name no source of the level has', async () => {
    const zip = await zipOf('one.png', new Uint8Array([1]))

    publishLevelTextures({ map: LEVEL, fromZip: new Map(), fromDataDir: [], zipImages: ['one.png'], zip })

    assert.equal(await bytesOf({ source: 'custom', name: 'two.png' }), undefined)
  })
})
