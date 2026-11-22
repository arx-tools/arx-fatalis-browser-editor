import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector2,
  type Camera,
  type Texture,
} from 'three'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import { isDynamicLightsVisible, isStaticLightsVisible } from '../../../modules/level/edit/dynamicLights.ts'
import { lightingProfile, readsPalette } from '../../../modules/level/edit/lightingProfile.ts'
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
 * The grey a marker takes when the light of its group is switched off.
 *
 * @remarks
 * The static and the dynamic layer have a switch of their own: a light of a switched off layer is still in the level, so
 * its marker stays on the screen, but grey and more transparent so it reads as disabled.
 */
const DISABLED_MARKER_COLOR = new Color(0.55, 0.55, 0.55)

/**
 * The same grey as {@link DISABLED_MARKER_COLOR}, as a css colour.
 *
 * @remarks
 * The fixed views draw their dots on a 2D canvas, and not the sprites of the walkable view: the two must read the same,
 * so the grey is written once and read both ways.
 */
export const DISABLED_MARKER_GREY = '#8c8c8c'

/**
 * The opacity of a disabled marker.
 */
const DISABLED_MARKER_OPACITY = 0.3

/**
 * The shape of a marker needs a colour of its own: the textures are white, and the fixed views draw the shape directly.
 */
type MarkerColor = {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * The white of the marker textures.
 */
const WHITE: MarkerColor = { r: 255, g: 255, b: 255 }

/**
 * Makes a css colour of a marker colour and an alpha.
 *
 * @param color The colour of the shape.
 * @param alpha The alpha of the part of the shape.
 *
 * @returns The css colour.
 */
function rgbaOf(color: MarkerColor, alpha: number): string {
  return `rgba(${color.r.toString()}, ${color.g.toString()}, ${color.b.toString()}, ${alpha.toString()})`
}

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
 * @param color The colour of the shape.
 */
function drawGlow(context: CanvasRenderingContext2D, centre: number, strength: number, color: MarkerColor): void {
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre)

  glow.addColorStop(0, rgbaOf(color, strength))
  glow.addColorStop(1, rgbaOf(color, 0))
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
 * @param color The colour of the shape.
 */
function drawStar(context: CanvasRenderingContext2D, centre: number, color: MarkerColor): void {
  const glow = context.createRadialGradient(centre, centre, 0, centre, centre, centre)

  glow.addColorStop(0, rgbaOf(color, 1))
  glow.addColorStop(0.18, rgbaOf(color, 0.75))
  glow.addColorStop(0.45, rgbaOf(color, 0.18))
  glow.addColorStop(1, rgbaOf(color, 0))
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
  context.fillStyle = rgbaOf(color, 0.95)
  context.fill()
}

/**
 * Draws the bulb of the semi-dynamic lights.
 *
 * @param context The 2D context of the texture.
 * @param centre The middle of the square.
 * @param color The colour of the shape.
 */
function drawBulb(context: CanvasRenderingContext2D, centre: number, color: MarkerColor): void {
  drawGlow(context, centre, 0.35, color)

  context.fillStyle = rgbaOf(color, 0.95)
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
 * @param color The colour of the shape.
 */
function drawFlame(context: CanvasRenderingContext2D, centre: number, color: MarkerColor): void {
  drawGlow(context, centre, 0.3, color)

  flamePathOf(context, centre)
  context.fillStyle = rgbaOf(color, 0.95)
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
 * @param color The colour of the shape.
 */
function drawFlameCrossed(context: CanvasRenderingContext2D, centre: number, color: MarkerColor): void {
  drawGlow(context, centre, 0.18, color)

  flamePathOf(context, centre)
  context.strokeStyle = rgbaOf(color, 0.9)
  context.lineWidth = 3
  context.stroke()

  context.beginPath()
  context.moveTo(centre * 0.52, centre * 1.52)
  context.lineTo(centre * 1.48, centre * 0.48)
  context.stroke()
}

/**
 * Draws the shape of a marker in the square of the texture.
 *
 * @param context The 2D context of the texture.
 * @param shape The shape to draw.
 * @param centre The middle of the square.
 * @param color The colour of the shape.
 */
function drawShape(
  context: CanvasRenderingContext2D,
  shape: LightMarkerShape,
  centre: number,
  color: MarkerColor,
): void {
  switch (shape) {
    case 'star': {
      drawStar(context, centre, color)

      break
    }

    case 'bulb': {
      drawBulb(context, centre, color)

      break
    }

    case 'flame': {
      drawFlame(context, centre, color)

      break
    }

    case 'flameCrossed': {
      drawFlameCrossed(context, centre, color)

      break
    }
  }
}

/**
 * Draws the shape of a marker at a size, for a 2D canvas.
 *
 * @remarks
 * The fixed views draw the same shapes as the walkable view, but as 2D icons over their canvas: this is the one drawing
 * the textures use, with the colour of the light instead of white. The caller puts the top left corner of the shape on
 * the canvas (a translate), and the shape is drawn in the square of `size`.
 *
 * @param context The 2D context of the canvas.
 * @param shape The shape to draw.
 * @param size The width and the height of the square, in the units of the context.
 * @param color The colour of the shape.
 */
export function drawLightMarkerShape(
  context: CanvasRenderingContext2D,
  shape: LightMarkerShape,
  size: number,
  color: MarkerColor,
): void {
  const scale = size / LIGHT_MARKER_TEXTURE_SIZE

  context.save()
  context.scale(scale, scale)
  drawShape(context, shape, LIGHT_MARKER_TEXTURE_SIZE / 2, color)
  context.restore()
}

/**
 * Tells whether the profile of the lighting keeps the gizmo of a light off the screen.
 *
 * @remarks
 * The `Flat` and the `Texture Rainbow` profiles have a light of their own, so the static lights of the level do not light
 * anything there: their markers would only name places that mean nothing on the picture (2026-11-22, the owner). The
 * semidynamic lights stay, the dynamic layer still draws the torches.
 *
 * @param light The light of the LLF.
 *
 * @returns True when the marker of the light is not drawn.
 */
export function isLightHidden(light: ArxLight): boolean {
  if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
    return false
  }

  return !readsPalette(lightingProfile.value)
}

/**
 * Tells whether the switch of the group of a light is off.
 *
 * @param light The light of the LLF.
 *
 * @returns True when the light is in a layer the author switched off.
 */
export function isLightDisabled(light: ArxLight): boolean {
  if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
    return !isDynamicLightsVisible.value
  }

  return !isStaticLightsVisible.value
}

/**
 * Makes a marker texture from a shape.
 *
 * @param name The name of the texture, for the debug tools of three.
 * @param shape The shape of the icon.
 *
 * @returns The texture of the shape.
 */
function markerTextureOf(name: string, shape: LightMarkerShape): CanvasTexture {
  const { canvas, context } = markerCanvasOf()

  drawShape(context, shape, LIGHT_MARKER_TEXTURE_SIZE / 2, WHITE)

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
    star: markerTextureOf('light-marker-star', 'star'),
    bulb: markerTextureOf('light-marker-bulb', 'bulb'),
    flame: markerTextureOf('light-marker-flame', 'flame'),
    flameCrossed: markerTextureOf('light-marker-flame-crossed', 'flameCrossed'),
  }
}

/**
 * Builds the marker of a light.
 *
 * @param light The light of the LLF.
 * @param textures The textures of the shapes.
 * @param index The index of the light in `map.lights`, which the pick reads back.
 *
 * @returns The sprite of the marker.
 */
function markerOf(light: ArxLight, textures: LightMarkerTextures, index: number): Sprite {
  const disabled = isLightDisabled(light)
  let color = lightMarkerColorOf(light)
  let opacity = 1

  if (disabled) {
    color = DISABLED_MARKER_COLOR
    opacity = DISABLED_MARKER_OPACITY
  }

  const material = new SpriteMaterial({
    map: textures[lightMarkerShapeOf(light)],
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  const sprite = new Sprite(material)
  const size = lightMarkerSizeOf(light)

  // the light of a marker is its index in `map.lights`: the pick reads it back from the sprite
  sprite.userData.lightIndex = index

  // the profiles with a light of their own have no use of the markers of the static lights
  sprite.visible = !isLightHidden(light)

  // the markers are a display of their own over the level, so they draw above the fill (7) and the outline (9) of the
  // selected polygons; otherwise a selected room would hide the lights in it (2026-11-18, the owner)
  sprite.renderOrder = 10
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

  for (const [index, light] of lights.entries()) {
    group.add(markerOf(light, textures, index))
  }

  return group
}

/**
 * Reads the light whose marker the crosshair of a view points at.
 *
 * @remarks
 * The pointer of the walkable view is locked, so a pick is a ray from the middle of the screen: the sprite of a marker
 * is a quad that always faces the camera, and the raycaster answers the nearest one. The light a marker draws is its
 * index in `map.lights` (the `userData` of the sprite), which the light pick writes into the light selection.
 *
 * @param camera The camera of the view.
 * @param markers The group {@link createLightMarkers} built.
 *
 * @returns The index of the light, or `undefined` when no marker is under the crosshair.
 */
export function lightMarkerIndexAt(camera: Camera, markers: Group): number | undefined {
  const raycaster = new Raycaster()
  const centre = new Vector2(0, 0)

  raycaster.setFromCamera(centre, camera)

  const hit = raycaster.intersectObjects(
    markers.children.filter((child) => {
      return child.visible
    }),
    false,
  )[0]
  const index: unknown = hit?.object.userData.lightIndex

  if (typeof index === 'number') {
    return index
  }

  return undefined
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

    for (const [index, light] of lights.entries()) {
      group.add(markerOf(light, textures, index))
    }

    return
  }

  for (const [index, child] of group.children.entries()) {
    const light = lights[index]

    if (light === undefined || !(child instanceof Sprite)) {
      continue
    }

    const texture = textures[lightMarkerShapeOf(light)]

    child.visible = !isLightHidden(light)

    if (child.material.map !== texture) {
      child.material.map = texture
      child.material.needsUpdate = true
    }

    if (isLightDisabled(light)) {
      child.material.color.copy(DISABLED_MARKER_COLOR)
      child.material.opacity = DISABLED_MARKER_OPACITY
    } else {
      child.material.color.copy(lightMarkerColorOf(light))
      child.material.opacity = 1
    }

    const size = lightMarkerSizeOf(light)

    child.scale.set(size, size, 1)
    child.position.copy(arxVector3toVector3(light.position))
  }
}
