import { AdditiveBlending, CanvasTexture, Group, Sprite, SpriteMaterial } from 'three'
import type { ArxLight } from 'arx-convert/types'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { lightMarkerSizeOf } from './lightMarkers.ts'

/**
 * The side of the square the ring of the selection is drawn into, in pixels.
 */
const RING_TEXTURE_SIZE = 64

/**
 * How much bigger the ring of a selected light is than its marker.
 */
const RING_SCALE = 1.5

/**
 * Draws the ring of a selected light: a white circle, so it reads around a marker of any colour.
 *
 * @returns The texture of the white ring, for the sprite of a selected light.
 *
 * @throws When the browser gives no 2D canvas to draw the ring on.
 */
function createRingTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = RING_TEXTURE_SIZE
  canvas.height = RING_TEXTURE_SIZE

  const context = canvas.getContext('2d')

  if (context === null) {
    throw new Error('The light selection needs a 2D canvas.')
  }

  const centre = RING_TEXTURE_SIZE / 2

  context.beginPath()
  context.arc(centre, centre, centre - 6, 0, Math.PI * 2)
  context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  context.lineWidth = 4
  context.stroke()

  context.beginPath()
  context.arc(centre, centre, centre - 11, 0, Math.PI * 2)
  context.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  context.lineWidth = 2
  context.stroke()

  const texture = new CanvasTexture(canvas)

  texture.name = 'light-selection-ring'

  return texture
}

/**
 * The ring around the selected lights.
 *
 * @remarks
 * The selection of the lights is a set of indices of `map.lights`, and the ring is the view of it: one sprite per
 * selected light, around its marker, in the place of the light. The ring is white and additive, so it stands out over a
 * marker of any colour, and it is not part of the marker itself (a resize of the light is a change of the marker, not
 * of the pick).
 */
export type LightSelectionOverlay = {
  /**
   * The group the rings live in, added to the scene of the view.
   */
  readonly group: Group
  /**
   * Builds the rings of a selection, from the lights of the level.
   *
   * @param lights The lights of the LLF.
   * @param selected The indices of the selected lights.
   */
  readonly update: (lights: readonly ArxLight[], selected: ReadonlySet<number>) => void
  /**
   * Takes the rings out of the scene, and lets the texture go.
   */
  readonly dispose: () => void
}

/**
 * Builds the overlay of the light selection.
 *
 * @returns The overlay, with no ring on it.
 */
export function createLightSelectionOverlay(): LightSelectionOverlay {
  const texture = createRingTexture()
  const group = new Group()
  const sprites: Sprite[] = []

  group.name = 'light-selection'

  function clear(): void {
    for (const sprite of sprites) {
      sprite.material.dispose()
    }

    sprites.length = 0
    group.clear()
  }

  return {
    group,
    update: (lights: readonly ArxLight[], selected: ReadonlySet<number>): void => {
      clear()

      for (const index of selected) {
        const light = lights[index]

        if (light === undefined) {
          continue
        }

        const material = new SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
        })
        const sprite = new Sprite(material)
        const size = lightMarkerSizeOf(light) * RING_SCALE

        sprite.scale.set(size, size, 1)
        sprite.position.copy(arxVector3toVector3(light.position))
        group.add(sprite)
        sprites.push(sprite)
      }
    },
    dispose: (): void => {
      clear()
      texture.dispose()
    },
  }
}
