import { AdditiveBlending, CanvasTexture, Group, Sprite, SpriteMaterial, type Texture } from 'three'
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
 * The yellow of the fill of a selected face, and of the ring of a focused light.
 *
 * @remarks
 * The faces paint their selection with the yellow of `Color.yellow` at the 0.35 of the fill, so the ring of a focused
 * light is filled with the same mark (2026-11-18, the owner): the two selections read as one yellow.
 */
const FOCUS_FILL = 'rgba(255, 255, 0, 0.35)'

/**
 * Draws the ring of a light: two white circles, so it reads around a marker of any colour.
 *
 * @param filled Whether the circle is filled with the yellow of the focused lights.
 *
 * @returns The ring as a canvas texture, white or with the yellow fill of the focus.
 *
 * @throws When the browser gives no 2D canvas to draw the ring on.
 */
function createRingTexture(filled: boolean): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = RING_TEXTURE_SIZE
  canvas.height = RING_TEXTURE_SIZE

  const context = canvas.getContext('2d')

  if (context === null) {
    throw new Error('The light selection needs a 2D canvas.')
  }

  const centre = RING_TEXTURE_SIZE / 2

  if (filled) {
    context.beginPath()
    context.arc(centre, centre, centre - 6, 0, Math.PI * 2)
    context.fillStyle = FOCUS_FILL
    context.fill()
  }

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

  let name = 'light-hover-ring'

  if (filled) {
    name = 'light-focus-ring'
  }

  texture.name = name

  return texture
}

/**
 * The ring around the hovered and the selected lights.
 *
 * @remarks
 * The hover and the selection are two states of the same mark: a light under the crosshair gets the white ring (the one
 * the selection had), and the selected lights get the ring filled with the yellow of the selected faces, so the focused
 * light reads as a picked face does (2026-11-18, the owner). The selected state wins: a light that is both hovered and
 * selected is the yellow ring. The rings are not part of the marker itself (a resize of the light is a change of the
 * marker, not of the pick).
 */
export type LightSelectionOverlay = {
  /**
   * The group the rings live in, added to the scene of the view.
   */
  readonly group: Group
  /**
   * Builds the rings of a selection and a hover, from the lights of the level.
   *
   * @param lights The lights of the LLF.
   * @param selected The indices of the selected lights.
   * @param hovered The index of the light under the crosshair, if there is one.
   */
  readonly update: (lights: readonly ArxLight[], selected: ReadonlySet<number>, hovered?: number) => void
  /**
   * Takes the rings out of the scene, and lets the textures go.
   */
  readonly dispose: () => void
}

/**
 * Builds the overlay of the light selection.
 *
 * @returns The overlay, with no ring on it.
 */
export function createLightSelectionOverlay(): LightSelectionOverlay {
  const hoverTexture = createRingTexture(false)
  const focusTexture = createRingTexture(true)
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

  /**
   * Adds the ring of one light to the group.
   *
   * @param light The light of the LLF.
   * @param texture The ring of its state.
   * @param additive Whether the ring adds its light to the scene, the way the hover does.
   */
  function addRing(light: ArxLight, texture: Texture, additive: boolean): void {
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })

    if (additive) {
      material.blending = AdditiveBlending
    }

    const sprite = new Sprite(material)
    const size = lightMarkerSizeOf(light) * RING_SCALE

    sprite.scale.set(size, size, 1)
    sprite.position.copy(arxVector3toVector3(light.position))
    group.add(sprite)
    sprites.push(sprite)
  }

  return {
    group,
    update: (lights: readonly ArxLight[], selected: ReadonlySet<number>, hovered?: number): void => {
      clear()

      for (const index of selected) {
        const light = lights[index]

        if (light === undefined) {
          continue
        }

        addRing(light, focusTexture, false)
      }

      if (hovered === undefined || selected.has(hovered)) {
        return
      }

      const light = lights[hovered]

      if (light === undefined) {
        return
      }

      addRing(light, hoverTexture, true)
    },
    dispose: (): void => {
      clear()
      hoverTexture.dispose()
      focusTexture.dispose()
    },
  }
}
