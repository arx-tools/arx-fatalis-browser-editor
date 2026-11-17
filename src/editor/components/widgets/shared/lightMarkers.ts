import { AdditiveBlending, CanvasTexture, Color, Group, Sprite, SpriteMaterial, type Texture } from 'three'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
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
 * The side of the square the marker textures are drawn into, in pixels.
 */
const LIGHT_MARKER_TEXTURE_SIZE = 64

/**
 * The shapes a light marker can take, by the flags of the light.
 */
export type LightMarkerShape = 'star' | 'bulb' | 'flame' | 'flameCrossed'

/**
 * The texture of every shape of a light marker, shared by the sprites.
 *
 * @remarks
 * The caller makes the set once (a level load), gives it to every marker and disposes it when the view goes away: the
 * textures are white, so the material of a sprite gives them the colour of its light.
 */
export type LightMarkerTextures = Record<LightMarkerShape, Texture>

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
 * The shape a light's marker takes, from the flags of the light.
 *
 * @remarks
 * The owner's choice (2026-11-17): the shape, not the colour, tells the kinds apart, and the flags have a priority:
 * a light that starts extinguished is a crossed out flame, a light that can be doused or burns is a flame, the
 * semi-dynamic lights are bulbs, and every other light keeps the sparkle of the static ones. A flame wins over the
 * bulb of the same light, because the fire is what the light does.
 *
 * @param light The light of the LLF.
 *
 * @returns The shape the sprite takes: a sparkle, a bulb, a flame or a crossed out flame.
 */
export function lightMarkerShapeOf(light: ArxLight): LightMarkerShape {
  if ((light.flags & ArxLightFlags.StartExtinguished) !== 0) {
    return 'flameCrossed'
  }

  if ((light.flags & (ArxLightFlags.Extinguishable | ArxLightFlags.SpawnFire)) !== 0) {
    return 'flame'
  }

  if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
    return 'bulb'
  }

  return 'star'
}

/**
 * Makes the canvas of a marker texture.
 *
 * @returns The canvas, and its 2D context.
 *
 * @throws When the browser gives no 2D canvas to draw the marker on.
 */
function markerCanvasOf(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')

  canvas.width = LIGHT_MARKER_TEXTURE_SIZE
  canvas.height = LIGHT_MARKER_TEXTURE_SIZE

  const context = canvas.getContext('2d')

  if (context === null) {
    throw new Error('The light marker needs a 2D canvas.')
  }

  return { canvas, context }
}

/**
 * Draws a soft halo around the icon of a marker.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 * @param strength The alpha of the middle of the halo.
 */
function drawGlow(context: CanvasRenderingContext2D, centre: number, strength: number): void {
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre)

  glow.addColorStop(0, `rgba(255, 255, 255, ${strength})`)
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, LIGHT_MARKER_TEXTURE_SIZE, LIGHT_MARKER_TEXTURE_SIZE)
}

/**
 * Draws the sparkle of the static lights: four thin arms around a bright centre.
 *
 * @remarks
 * The shape is the one the game's own light debug display shows (2026-11-17, the owner's reference): the four arms and
 * the halo the static lights keep.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 */
function drawStar(context: CanvasRenderingContext2D, centre: number): void {
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre)

  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.18, 'rgba(255, 255, 255, 0.75)')
  glow.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, LIGHT_MARKER_TEXTURE_SIZE, LIGHT_MARKER_TEXTURE_SIZE)

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
}

/**
 * Draws the bulb of the semi-dynamic lights.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 */
function drawBulb(context: CanvasRenderingContext2D, centre: number): void {
  drawGlow(context, centre, 0.35)

  context.fillStyle = 'rgba(255, 255, 255, 0.95)'
  context.beginPath()
  context.arc(centre, centre - 4, centre * 0.4, 0, Math.PI * 2)
  context.fill()
  context.fillRect(centre - 5, centre + 9, 10, 9)

  // the two gaps of the screw base: the bulb reads as a bulb, not as a circle with a block under it
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = 'rgba(0, 0, 0, 1)'
  context.fillRect(centre - 6, centre + 12, 12, 2)
  context.fillRect(centre - 6, centre + 16, 12, 2)
  context.globalCompositeOperation = 'source-over'
}

/**
 * Lays the outline of a flame on the context.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 */
function flamePathOf(context: CanvasRenderingContext2D, centre: number): void {
  const size = centre * 2

  context.beginPath()
  context.moveTo(centre, size * 0.1)
  context.bezierCurveTo(size * 0.74, size * 0.3, size * 0.72, size * 0.62, size * 0.62, size * 0.78)
  context.bezierCurveTo(size * 0.58, size * 0.83, size * 0.53, size * 0.82, centre, size * 0.73)
  context.bezierCurveTo(size * 0.47, size * 0.82, size * 0.42, size * 0.83, size * 0.38, size * 0.78)
  context.bezierCurveTo(size * 0.28, size * 0.62, size * 0.26, size * 0.3, centre, size * 0.1)
  context.closePath()
}

/**
 * Draws the flame of a light that burns or can be doused.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 */
function drawFlame(context: CanvasRenderingContext2D, centre: number): void {
  drawGlow(context, centre, 0.3)

  flamePathOf(context, centre)
  context.fillStyle = 'rgba(255, 255, 255, 0.95)'
  context.fill()
}

/**
 * Draws the crossed out flame of a light that starts extinguished.
 *
 * @remarks
 * The flame is an outline, not a filled shape, and a diagonal line goes through it: the additive blending of the marker
 * keeps the empty middle dark, so the icon reads as "this light does not burn".
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 */
function drawFlameCrossed(context: CanvasRenderingContext2D, centre: number): void {
  drawGlow(context, centre, 0.18)

  flamePathOf(context, centre)
  context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  context.lineWidth = 3
  context.stroke()

  context.beginPath()
  context.moveTo(centre * 0.52, centre * 1.52)
  context.lineTo(centre * 1.48, centre * 0.48)
  context.stroke()
}

/**
 * Makes a marker texture from a drawing.
 *
 * @param name The name of the texture, for the debug tools of three.
 * @param draw The drawing of the icon.
 *
 * @returns The texture of the shape.
 */
function markerTextureOf(
  name: string,
  draw: (context: CanvasRenderingContext2D, centre: number) => void,
): CanvasTexture {
  const { canvas, context } = markerCanvasOf()

  draw(context, LIGHT_MARKER_TEXTURE_SIZE / 2)

  const texture = new CanvasTexture(canvas)

  texture.name = name

  return texture
}

/**
 * Makes the textures of the four shapes of the light markers.
 *
 * @remarks
 * The set is shared by the sprites of a level: it is made once, and the caller disposes it after the markers go. The
 * icons are white and additive, so a sprite keeps the colour of its light.
 *
 * @returns The texture of every shape.
 *
 * @throws When the browser gives no 2D canvas to draw the markers on.
 */
export function createLightMarkerTextures(): LightMarkerTextures {
  return {
    star: markerTextureOf('light-marker-star', drawStar),
    bulb: markerTextureOf('light-marker-bulb', drawBulb),
    flame: markerTextureOf('light-marker-flame', drawFlame),
    flameCrossed: markerTextureOf('light-marker-flame-crossed', drawFlameCrossed),
  }
}

/**
 * Builds the marker of a light.
 *
 * @param light The light of the LLF.
 * @param textures The textures of the shapes.
 *
 * @returns The sprite of the marker.
 */
function markerOf(light: ArxLight, textures: LightMarkerTextures): Sprite {
  const material = new SpriteMaterial({
    map: textures[lightMarkerShapeOf(light)],
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

  return sprite
}

/**
 * Builds the markers of the lights of a level, for the walkable view.
 *
 * @param lights The lights of the LLF.
 * @param textures The textures of the shapes, shared with the other markers (the caller owns them).
 *
 * @returns A group with one sprite per light, at the place of the light.
 */
export function createLightMarkers(lights: readonly ArxLight[], textures: LightMarkerTextures): Group {
  const group = new Group()

  group.name = 'light-markers'

  for (const light of lights) {
    group.add(markerOf(light, textures))
  }

  return group
}

/**
 * Disposes the materials of the markers of a group.
 *
 * @remarks
 * The textures are shared by the sprites, so they are not disposed here: the caller made them, and it disposes them after
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

/**
 * Makes the markers of a group follow the lights after an edit.
 *
 * @remarks
 * The light editor changes the flags, the colour, the falloff and the place of a light in the LLF; the markers have to
 * follow without a level load. The sprite of a light keeps its index in `map.lights`, so the shape, the colour, the size
 * and the place are written in place. A different number of lights rebuilds the group, because the sprites no longer
 * line up with the list.
 *
 * @param group The group {@link createLightMarkers} built.
 * @param lights The lights of the LLF, as they are now.
 * @param textures The textures of the shapes.
 */
export function updateLightMarkers(group: Group, lights: readonly ArxLight[], textures: LightMarkerTextures): void {
  if (group.children.length !== lights.length) {
    disposeLightMarkers(group)

    for (const light of lights) {
      group.add(markerOf(light, textures))
    }

    return
  }

  for (const [index, child] of group.children.entries()) {
    const light = lights[index]

    if (light === undefined || !(child instanceof Sprite)) {
      continue
    }

    const texture = textures[lightMarkerShapeOf(light)]

    if (child.material.map !== texture) {
      child.material.map = texture
      child.material.needsUpdate = true
    }

    child.material.color.copy(lightMarkerColorOf(light))

    const size = lightMarkerSizeOf(light)

    child.scale.set(size, size, 1)
    child.position.copy(arxVector3toVector3(light.position))
  }
}
