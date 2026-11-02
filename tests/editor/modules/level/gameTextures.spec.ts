import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fetchGameTexture,
  GAME_TEXTURES_PARAMETER,
  gameTextureUrl,
  gameTexturesFromUrl,
} from '../../../../src/editor/modules/level/gameTextures.ts'
import type { UrlAdapter } from '../../../../src/editor/modules/persistedRef/url.ts'

/**
 * A query string as the url of the page would give it.
 *
 * @param search The parameters, without the leading `?`.
 *
 * @returns The adapter the sources read.
 */
function urlOf(search: string): UrlAdapter {
  return {
    read: (): string => {
      return search
    },
    write: (): void => {
      // the test never writes
    },
  }
}

void describe('gameTexturesFromUrl', () => {
  void it('reads the folder of the game', () => {
    assert.equal(
      gameTexturesFromUrl(urlOf(`${GAME_TEXTURES_PARAMETER}=/home/lali/arx/textures`)),
      '/home/lali/arx/textures',
    )
    assert.equal(
      gameTexturesFromUrl(urlOf(`${GAME_TEXTURES_PARAMETER}=https://example.com/textures`)),
      'https://example.com/textures',
    )
  })

  void it('says nothing when the parameter is missing or empty', () => {
    assert.equal(gameTexturesFromUrl(urlOf('')), undefined)
    assert.equal(gameTexturesFromUrl(urlOf(`${GAME_TEXTURES_PARAMETER}=`)), undefined)
    assert.equal(gameTexturesFromUrl(urlOf(`${GAME_TEXTURES_PARAMETER}=   `)), undefined)
    assert.equal(gameTexturesFromUrl(undefined), undefined)
  })
})

void describe('gameTextureUrl', () => {
  void it('asks the development server for a folder of the disk', () => {
    assert.equal(
      gameTextureUrl('/home/lali/arx/textures', '[stone]_wall.bmp', true),
      '/__local-textures?dir=%2Fhome%2Flali%2Farx%2Ftextures&name=%5Bstone%5D_wall.bmp',
    )
    assert.equal(
      gameTextureUrl('file:///home/lali/arx/textures', 'wall.jpg', true),
      '/__local-textures?dir=%2Fhome%2Flali%2Farx%2Ftextures&name=wall.jpg',
    )
  })

  void it('takes a folder url as the base of the texture', () => {
    assert.equal(
      gameTextureUrl('https://example.com/textures/', 'wall.jpg', true),
      'https://example.com/textures/wall.jpg',
    )
    // a path of the site is a url outside the development server: only a file url names a folder for sure
    assert.equal(gameTextureUrl('https://example.com/t', 'wall.jpg', false), 'https://example.com/t/wall.jpg')
  })

  void it('says why a folder of the disk needs the development server', () => {
    assert.throws(() => {
      return gameTextureUrl('file:///home/lali/arx/textures', 'wall.jpg', false)
    }, /needs its development server/u)
  })
})

void describe('fetchGameTexture', () => {
  void it('walks the extensions of a name without one', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      // only the .jpg is there, like the game's own `[glass]_windows2.jpg`
      if (typeof input === 'string' && input.endsWith('.jpg')) {
        return new Response('bytes')
      }

      return new Response(null, { status: 404 })
    }

    const bytes = await fetchGameTexture('https://example.com/t', '[glass]_windows2', fetchImpl, false)

    assert.equal(bytes?.byteLength, 5)
    assert.deepEqual(calls, [
      'https://example.com/t/%5Bglass%5D_windows2',
      'https://example.com/t/%5Bglass%5D_windows2.jpg',
    ])
  })

  void it('gives nothing when the folder has none of the names', async () => {
    async function fetchImpl(): Promise<Response> {
      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    assert.equal(await fetchGameTexture('https://example.com/t', 'missing.bmp', fetchImpl, false), undefined)
  })

  void it('asks the development server once, it finds the extension', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response('bytes')
    }

    await fetchGameTexture('/home/lali/tex', 'wall', fetchImpl, true)

    assert.deepEqual(calls, ['/__local-textures?dir=%2Fhome%2Flali%2Ftex&name=wall'])
  })
})
