import { AdditiveBlending, CanvasTexture, Color, Group, Sprite, SpriteMaterial, type Texture } from 'three'
import type { ArxLight } from 'arx-convert/types'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'

/**
 * How much of a light's `fallStart` a marker takes, in world units.
 *
 * @remarks
 * The owner asked for a marker whose size follows the `fallStart` of the light (2026-11-17): a big light (a bonfire) is
 * a bigger sparkle than a candle, and the walkable view reads the same scale at every distance. The factor keeps the
 * sparkle a marker, and not a ball of the size of the light's full intensity sphere.
 */
const LIGHT_MARKER_SIZE = 0.2

/**
 * The size of the smallest marker, in world units: a light without a falloff still has a point to show.
 */
const LIGHT_MARKER_MIN_SIZE = 6

/**
 * The size a light's marker takes from the light.
 *
 * @param light The light of the LLF.
 *
 * @returns The width and height of the sprite, in world units.
 */
export function lightMarkerSizeOf(light: ArxLight): number {
  return Math.max(LIGHT_MARKER_MIN_SIZE, light.fallStart * LIGHT_MARKER_SIZE)
}

/**
 * The colour a light's marker takes from the light.
 *
 * @param light The light of the LLF.
 *
 * @returns The colour of the sprite material, from the 0..255 channels of the LLF.
 */
export function lightMarkerColorOf(light: ArxLight): Color {
  return new Color(light.color.r / 255, light.color.g / 255, light.color.b / 255)
}

/**
 * Draws the sparkle of a light marker: a four pointed star with a soft glow around it.
 *
 * @remarks
 * The shape is the one the game's own light debug display shows (2026-11-17, the owner's reference): four thin arms
 * around a bright centre, and a halo that fades into the level. The texture is white, so the material of a sprite can
 * give it the colour of its light.
 *
 * @returns The texture of the sparkle, for the sprite material of every marker.
 *
 * @throws When the browser gives no 2D canvas to draw the sparkle on.
 */
export function createLightSparkleTexture(): CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (context === null) {
    throw new Error('The light sparkle needs a 2D canvas.')
  }

  const centre = size / 2
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre)

  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.18, 'rgba(255, 255, 255, 0.75)')
  glow.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, size, size)

  context.translate(centre, centre)
  context.beginPath()

  for (let index = 0; index < 8; index++) {
    const angle = (Math.PI / 4) * index

    let radius = centre * 0.12

    if (index % 2 === 0) {
      radius = centre - 2
    }

    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius

    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }

  context.closePath()
  context.fillStyle = 'rgba(255, 255, 255, 0.95)'
  context.fill()

  const texture = new CanvasTexture(canvas)
  texture.name = 'light-sparkle'

  return texture
}

/**
 * Builds the markers of the lights of a level, for the walkable view.
 *
 * @param lights The lights of the LLF.
 * @param texture The sparkle texture, shared by every marker (the caller owns it).
 *
 * @returns A group with one sprite per light, at the place of the light.
 */
export function createLightMarkers(lights: readonly ArxLight[], texture: Texture): Group {
  const group = new Group()

  group.name = 'light-markers'

  for (const light of lights) {
    const material = new SpriteMaterial({
      map: texture,
      color: lightMarkerColorOf(light),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    const sprite = new Sprite(material)
    const size = lightMarkerSizeOf(light)

    sprite.scale.set(size, size, 1)
    sprite.position.copy(arxVector3toVector3(light.position))
    group.add(sprite)
  }

  return group
}

/**
 * Disposes the materials of the markers of a group.
 *
 * @remarks
 * The sparkle texture is shared by the sprites, so it is not disposed here: the caller made it, and it disposes it after
 * the group is gone.
 *
 * @param group The group built by {@link createLightMarkers}.
 */
export function disposeLightMarkers(group: Group): void {
  for (const child of group.children) {
    if (child instanceof Sprite) {
      child.material.dispose()
    }
  }

  group.clear()
}
