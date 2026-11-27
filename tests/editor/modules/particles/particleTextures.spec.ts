import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Texture } from 'three'
import { createParticleTextures } from '../../../../src/editor/modules/particles/particleTextures.ts'

/**
 * A stand-in for the image of a decoded file: the cache only hands it to the texture.
 */
const image: ImageBitmap = {
  width: 1,
  height: 1,
  close: (): void => {
    // the browser frees the memory of an image: the stand-in has none
  },
}

/**
 * The bytes of a file of the game, for the fakes.
 */
const fileBytes = new ArrayBuffer(1)

void describe('createParticleTextures', () => {
  void it('reads the file of the game once, and keeps it', async () => {
    let reads = 0
    const textures = createParticleTextures({
      read: async () => {
        reads = reads + 1
        await Promise.resolve()

        return fileBytes
      },
      decode: async () => {
        await Promise.resolve()

        return image
      },
      placeholder: async () => {
        await Promise.resolve()

        return new Texture()
      },
    })

    const first = await textures.textureOf('fire')
    const second = await textures.textureOf('fire')

    assert.equal(first, second)
    assert.equal(reads, 1)
    assert.equal(first.image, image)
  })

  void it('reads the file of every texture of the field, each once', async () => {
    const reads: string[] = []
    const textures = createParticleTextures({
      read: async (path: string) => {
        reads.push(path)
        await Promise.resolve()

        return fileBytes
      },
      decode: async () => {
        await Promise.resolve()

        return image
      },
      placeholder: async () => {
        await Promise.resolve()

        return new Texture()
      },
    })

    const fire = await textures.textureOf('fire')
    const smoke = await textures.textureOf('smoke')

    assert.notEqual(fire, smoke)
    assert.deepEqual(reads, ['graph/particles/fire2.bmp', 'graph/particles/smoke.bmp'])
  })

  void it('tries the folder again when the placeholder stood in for it', async () => {
    let reads = 0
    const placeholder = new Texture()
    const textures = createParticleTextures({
      read: async () => {
        reads = reads + 1
        await Promise.resolve()

        // the first read comes before the data directory of the session is there, the second one after it
        if (reads === 1) {
          return undefined
        }

        return fileBytes
      },
      decode: async () => {
        await Promise.resolve()

        return image
      },
      placeholder: async () => {
        await Promise.resolve()

        return placeholder
      },
    })

    assert.equal(await textures.textureOf('fire'), placeholder)
    assert.notEqual(await textures.textureOf('fire'), placeholder)
    assert.equal(reads, 2)
  })

  void it('takes the placeholder when the file of the game can not be decoded', async () => {
    const placeholder = new Texture()
    const textures = createParticleTextures({
      read: async () => {
        await Promise.resolve()

        return fileBytes
      },
      decode: () => {
        throw new Error('a broken bmp')
      },
      placeholder: async () => {
        await Promise.resolve()

        return placeholder
      },
    })

    assert.equal(await textures.textureOf('fire'), placeholder)
  })

  void it('reads the folder again after the folder of the game changed', async () => {
    let reads = 0
    const textures = createParticleTextures({
      read: async () => {
        reads = reads + 1
        await Promise.resolve()

        return fileBytes
      },
      decode: async () => {
        await Promise.resolve()

        return image
      },
      placeholder: async () => {
        await Promise.resolve()

        return new Texture()
      },
    })

    const before = await textures.textureOf('fire')

    textures.forget()

    const after = await textures.textureOf('fire')

    assert.notEqual(after, before)
    assert.equal(reads, 2)
  })
})
