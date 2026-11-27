import { ClampToEdgeWrapping, LinearFilter, SRGBColorSpace, Texture } from 'three'
import { createLevelTexture, loadMissingTexture } from '../level/edit/levelTextures/load.ts'
import { readDataFile } from '../level/source/dataDir.ts'
import { decodeTextureBitmap } from '../textures/image.ts'
import type { ParticleTexture } from './particles.ts'

/**
 * The folder of the game's particle textures.
 */
const PARTICLE_FOLDER = 'graph/particles'

/**
 * The file of every texture of the field.
 *
 * @remarks
 * The names are the game's own: the fire of a fireplace draws with `fire2`, and the smoke it fades into with `smoke`
 * (`ParticleTextures.cpp`).
 */
const PARTICLE_FILES: Record<ParticleTexture, string> = {
  fire: 'fire2.bmp',
  smoke: 'smoke.bmp',
}

/**
 * Where the textures of the field come from.
 *
 * @remarks
 * The page reads the file of the game from its data directory and decodes it in the browser; a test hands in its own,
 * so the cache below is measured without a folder or a decoder.
 */
export type ParticleTextureSources = {
  /**
   * Reads a file of the data directory of the game.
   *
   * @param path The path of the file inside the data directory.
   *
   * @returns The bytes, or `undefined` when the folder has no such file.
   */
  readonly read: (path: string) => Promise<ArrayBuffer | undefined>
  /**
   * Decodes an image of the game.
   *
   * @param name The name of the file, for the error of a broken one.
   * @param bytes The bytes of the file.
   *
   * @returns The image of the file.
   */
  readonly decode: (name: string, bytes: ArrayBuffer) => Promise<ImageBitmap>
  /**
   * Reads the placeholder that stands in for a texture the game's folder does not have.
   *
   * @returns The texture of the placeholder.
   */
  readonly placeholder: () => Promise<Texture>
}

/**
 * A particle texture of the page, and the cache behind it.
 */
export type ParticleTextures = {
  /**
   * The texture of a particle.
   *
   * @param kind The texture a particle draws with.
   *
   * @returns The texture of the field.
   */
  readonly textureOf: (kind: ParticleTexture) => Promise<Texture>
  /**
   * Drops the textures, so the next call reads the data directory of the session again.
   */
  readonly forget: () => void
}

/**
 * The sources of the page: the data directory of the session, the decoder of the browser, and the placeholder of the
 * level.
 *
 * @returns The sources the editor reads the particles with.
 */
function gameSourcesOf(): ParticleTextureSources {
  return {
    read: readDataFile,
    decode: decodeTextureBitmap,
    placeholder: loadMissingTexture,
  }
}

/**
 * Builds the cache of the particle textures.
 *
 * @remarks
 * A load that falls back to the placeholder is **not** kept: the field of the particles is built when the view is, and
 * the data directory of the session may arrive after it (a folder the browser remembers is read asynchronously, and a
 * folder the user uploads comes later still), so the next call has to try the folder again. A texture the folder had is
 * kept until the folder changes ({@link ParticleTextures.forget}).
 *
 * @param sources Where the textures are read from, the game's own by default.
 *
 * @returns The cache of the textures of the field.
 */
export function createParticleTextures(sources: ParticleTextureSources = gameSourcesOf()): ParticleTextures {
  const textures = new Map<ParticleTexture, Promise<Texture>>()

  /**
   * Reads the texture of a particle: the file of the game, or the placeholder of the level.
   *
   * @param kind The texture a particle draws with.
   *
   * @returns The texture, and whether the file of the game was there.
   */
  async function load(kind: ParticleTexture): Promise<{ readonly texture: Texture; readonly fromGame: boolean }> {
    try {
      const bytes = await sources.read(`${PARTICLE_FOLDER}/${PARTICLE_FILES[kind]}`)

      if (bytes !== undefined) {
        const texture = createLevelTexture(await sources.decode(PARTICLE_FILES[kind], bytes))

        // the sprite of a particle is one quad: the wrap of the level textures does not matter, the bilinear filter does
        texture.wrapS = ClampToEdgeWrapping
        texture.wrapT = ClampToEdgeWrapping
        texture.magFilter = LinearFilter

        return { texture, fromGame: true }
      }
    } catch {
      // a data directory that can not be read is the same as one without the file: the placeholder of the level stands in
    }

    // the owner's rule: without a data directory the fire draws with the jorge pattern of the level, so a fireplace still
    // shows something on the screen
    return { texture: await sources.placeholder(), fromGame: false }
  }

  return {
    textureOf: async (kind: ParticleTexture): Promise<Texture> => {
      const cached = textures.get(kind)

      if (cached !== undefined) {
        return await cached
      }

      const loading = load(kind)

      textures.set(
        kind,
        loading.then((loaded) => {
          return loaded.texture
        }),
      )

      const loaded = await loading

      // the placeholder is not the texture of the level: it is not kept, so the next call tries the folder again
      if (!loaded.fromGame) {
        textures.delete(kind)
      }

      return loaded.texture
    },
    forget: (): void => {
      textures.clear()
    },
  }
}

/**
 * The textures of the particles of the page.
 *
 * @remarks
 * A module level singleton: the field of every view of the editor reads the same two textures, and a folder the user
 * picks is read once for all of them.
 */
const pageTextures = createParticleTextures()

/**
 * The texture of a particle, from the data directory of the game.
 *
 * @param kind The texture a particle draws with.
 *
 * @returns The texture of the field.
 */
export async function particleTextureOf(kind: ParticleTexture): Promise<Texture> {
  return await pageTextures.textureOf(kind)
}

/**
 * Drops the textures of the particles, so the next call reads the data directory of the session again.
 *
 * @remarks
 * The folder of the game may change under the particles: another folder picked, or the first one, which the browser
 * reads asynchronously (a remembered handle, an uploaded folder). The fire of the level keeps the texture of the folder
 * it was read from, so a new folder has to take the fire's texture away.
 */
export function forgetParticleTextures(): void {
  pageTextures.forget()
}

/**
 * Builds a white texture, so the field has something to draw before the image of the particle arrives.
 *
 * @returns The texture of one white pixel.
 */
export function whiteTextureOf(): Texture {
  const texture = new Texture()
  const data = new Uint8Array([255, 255, 255, 255])

  texture.image = { data, height: 1, width: 1 }
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true

  return texture
}
