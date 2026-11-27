import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GENERATOR_ASSETS } from '../../../../src/generator/assets.ts'
import {
  exportTexturesFor,
  TEXTURE_FOLDER,
  type TextureOwner,
} from '../../../../src/editor/modules/export/exportTextures.ts'

/**
 * The level of the tests: the containers an imported mesh and a floor of a blank level point at, one name twice.
 *
 * @returns The owner of the textures, as the FTS holds the containers.
 */
function ownerOf(): TextureOwner {
  return {
    fts: {
      textureContainers: [
        { filename: 'jorge-[stone].jpg' },
        { filename: '[stone]_wall1.bmp' },
        { filename: '[stone]_wall1.bmp' },
      ],
    },
  }
}

/**
 * Bytes of the test, as the file of a texture would have them.
 *
 * @param name The text of the bytes.
 *
 * @returns The bytes of the file.
 */
function bytesOf(name: string): ArrayBuffer {
  return new TextEncoder().encode(name).buffer
}

/**
 * A reader of the build assets a test writes for itself.
 *
 * @param urls The urls the reader was asked for, in the order it was asked.
 * @param bytes What the reader gives back.
 *
 * @returns The reader of the export.
 */
function readerOf(urls: string[], bytes: ArrayBuffer): (url: string) => Promise<ArrayBuffer> {
  return async (url: string): Promise<ArrayBuffer> => {
    urls.push(url)
    // a reader of the build waits for a file; the test gives the bytes it wrote
    await Promise.resolve()

    return bytes
  }
}

void describe('exportTexturesFor', () => {
  void it('takes the textures of the zip of the level, with the path of the game', async () => {
    const wall = bytesOf('a wall of the level')
    const urls: string[] = []
    const textures = await exportTexturesFor(
      ownerOf(),
      { fromZip: new Map([['[stone]_wall1.bmp', wall]]) },
      readerOf(urls, bytesOf('the placeholder')),
    )

    assert.deepEqual(
      textures.textures.map((texture) => {
        return texture.path
      }),
      // the jorge comes from the build of the generator, the wall from the zip, and a name is written once
      [`${TEXTURE_FOLDER}/jorge-[stone].jpg`, `${TEXTURE_FOLDER}/[stone]_wall1.bmp`],
    )
    assert.equal(textures.skipped.length, 0)
  })

  void it('reads the own asset of the generator by its url', async () => {
    const urls: string[] = []
    const textures = await exportTexturesFor(ownerOf(), undefined, readerOf(urls, bytesOf('the placeholder')))

    assert.deepEqual(urls, [GENERATOR_ASSETS['jorge-[stone].jpg']])
    assert.deepEqual(
      textures.textures.map((texture) => {
        return texture.path
      }),
      [`${TEXTURE_FOLDER}/jorge-[stone].jpg`],
    )
    // the textures of the game are left to the game
    assert.deepEqual(textures.skipped, ['[stone]_wall1.bmp'])
  })

  void it('takes the bytes of the zip over the asset of the build, for the placeholder too', async () => {
    const own = bytesOf('a jorge of the author')
    const urls: string[] = []
    const textures = await exportTexturesFor(
      ownerOf(),
      { fromZip: new Map([['jorge-[stone].jpg', own]]) },
      readerOf(urls, bytesOf('the build')),
    )

    assert.equal(textures.textures.length, 1)
    assert.deepEqual(new Uint8Array(textures.textures[0]?.bytes), new Uint8Array(own))
    assert.deepEqual(urls, [])
  })
})
