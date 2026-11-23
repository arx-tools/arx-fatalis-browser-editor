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
 * The textures of the field, once they are read.
 */
const textures = new Map<ParticleTexture, Promise<Texture>>()

/**
 * Builds the texture of a particle from the image of the data directory.
 *
 * @param kind The texture a particle draws with.
 *
 * @returns The texture of the field.
 */
async function loadParticleTexture(kind: ParticleTexture): Promise<Texture> {
  try {
    const bytes = await readDataFile(`${PARTICLE_FOLDER}/${PARTICLE_FILES[kind]}`)

    if (bytes !== undefined) {
      const texture = createLevelTexture(await decodeTextureBitmap(PARTICLE_FILES[kind], bytes))

      // the sprite of a particle is one quad: the wrap of the level textures does not matter, the bilinear filter does
      texture.wrapS = ClampToEdgeWrapping
      texture.wrapT = ClampToEdgeWrapping
      texture.magFilter = LinearFilter

      return texture
    }
  } catch {
    // a data directory that can not be read is the same as one without the file: the placeholder of the level stands in
  }

  // the owner's rule: without a data directory the fire draws with the jorge pattern of the level, so a fireplace still
  // shows something on the screen
  return await loadMissingTexture()
}

/**
 * The texture of a particle, from the data directory of the game.
 *
 * @remarks
 * The file is read once and kept: a field of a thousand particles samples one texture per texture of the field. A folder
 * without the file (or no folder at all) takes the placeholder of the level, which is the jorge pattern.
 *
 * @param kind The texture a particle draws with.
 *
 * @returns The texture of the field.
 */
export async function particleTextureOf(kind: ParticleTexture): Promise<Texture> {
  const cached = textures.get(kind)

  if (cached !== undefined) {
    return await cached
  }

  const texture = loadParticleTexture(kind)

  textures.set(kind, texture)

  return await texture
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
