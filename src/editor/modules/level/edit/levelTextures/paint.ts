import type { ArxPolygon } from 'arx-convert/types'
import {
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  OneFactor,
  OneMinusSrcColorFactor,
  SRGBColorSpace,
  SrcColorFactor,
  ZeroFactor,
  type Side,
  type Texture,
} from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import { createLevelMaterial } from '../../../../../generator/meshes.ts'
import {
  blendModeOf,
  blendTransOf,
  isDoubleSided,
  isWater,
  type PolygonBlendMode,
} from '../../../../../generator/polygons.ts'

/**
 * The alpha cut of the material of a face: the texels of the texture below it are not drawn.
 *
 * @remarks
 * The game cuts the holes of a texture with `alphaTest` (a fence, a banner) — see `ALPHA_CUTOUT` in the old file.
 */
const ALPHA_CUTOUT = 0.5

/**
 * How much of the placeholder a face without a texture shows.
 *
 * @remarks
 * The game draws nothing where the level gives a face no texture: such a face is an invisible blocker (the two faces that
 * keep the player out of the room of a cutscene). The editor has to say where the face is without hiding what stands
 * behind it, so the placeholder of the generator is drawn **half see-through** — at a distance the tiled checkerboard
 * reads as one flat colour, and a solid one would look like a wall of the level.
 */
const NO_TEXTURE_OPACITY = 0.5

/**
 * How much of the water a water face shows.
 *
 * @remarks
 * The game draws the water in a pass of its own, with the environment map and a moving reflection
 * (`RenderWater` of `Scene.cpp`): the texture and the `transval` blend of the face are not what makes it visible, so a
 * paint that follows them draws a dim additive sheet — nothing at all on the dark texture of a cave river (2026-11-14,
 * the owner: the water of level 12 was invisible). The editor draws the texture of the face as a translucent sheet
 * instead, so the water reads where the level has it and the bed still shows through.
 */
const WATER_OPACITY = 0.62

/**
 * What a run of faces draws with: the texture (or none), the side of the face, and how the game blends it.
 *
 * @remarks
 * All of it belongs to the **material**, not to the texture. The level has faces the game draws from both sides (a
 * fence, a door, a banner) and faces it blends (a lamp's glow adds, a torch's flame subtracts, the holes of a fence are
 * cut by the alpha of the texture), and a texture that is used by all of them needs a material of each kind. The paint
 * builds one material per key, and a run of the geometry is the block of one of them.
 *
 * The brightness (`trans`) is part of the key because the game modulates the texture of a blended face with it: a light
 * ray of a dimmer value is the same texture in another key, and so another material.
 */
export interface PaintKey {
  /**
   * The name of the texture, or `undefined` when the level has no container for it (or no texture for that container).
   */
  readonly name: string | undefined
  /**
   * Whether the faces are drawn from both sides.
   */
  readonly doubleSided: boolean
  /**
   * How the game blends the faces.
   */
  readonly blend: PolygonBlendMode
  /**
   * The brightness the game multiplies the texture with, in hundredths: the key of a run holds it that way.
   */
  readonly trans: number
  /**
   * Whether the face is water, which the game draws in a pass of its own (`generator/polygons.ts` `isWater`).
   */
  readonly water: boolean
}

/**
 * Writes a paint key as the string the materials are keyed with.
 *
 * @param key What the faces draw with.
 *
 * @returns The key, like `double|subtractive|1.95|[stone]_fire_torch01.bmp`.
 */
export function paintKeyOf(key: PaintKey): string {
  let side = 'front'

  if (key.doubleSided) {
    side = 'double'
  }

  // the water is a part of its own, and only for the faces that are water: the key of every other face stays the one the
  // materials were built with
  let water = ''

  if (key.water) {
    water = '|water'
  }

  return `${side}|${key.blend}|${key.trans.toFixed(2)}|${key.name ?? ''}${water}`
}

/**
 * The paint key of a polygon: the same parts the runs of the map are built from.
 *
 * @remarks
 * The brightness is rounded to hundredths here, the way the key of a run holds it, so the faces of one run always land
 * on the same material.
 *
 * @param map The map the polygon belongs to.
 * @param polygon The polygon to read.
 *
 * @returns What the face draws with.
 */
export function paintKeyOfPolygon(map: ArxMap, polygon: ArxPolygon): PaintKey {
  const trans = Math.round(blendTransOf(polygon) * 100)

  return {
    name: map.textureNameOf(polygon.textureContainerId),
    doubleSided: isDoubleSided(polygon),
    blend: blendModeOf(polygon),
    trans: Math.min(255, Math.max(0, trans)) / 100,
    water: isWater(polygon),
  }
}

/**
 * The `side` a material of a key draws with.
 *
 * @param doubleSided Whether the faces are drawn from both sides.
 *
 * @returns The side of the material.
 */
function sideOf(doubleSided: boolean): Side {
  if (doubleSided) {
    return DoubleSide
  }

  return FrontSide
}

/**
 * The grey the game multiplies the texture of a face with.
 *
 * @remarks
 * The game sets the vertex colour of a blended face to `gray(trans)` (`ComputePortalVertexBuffer`), which is why a light
 * ray is dim and a torch's flame is not. The value is an **sRGB** grey: the game works on the bytes of the texture, and
 * the texture of the renderer is sRGB too.
 *
 * @param trans The brightness of the key.
 *
 * @returns The colour of the material.
 */
function transColorOf(trans: number): Color {
  const grey = Math.min(1, Math.max(0, trans))

  return new Color().setRGB(grey, grey, grey, SRGBColorSpace)
}

/**
 * Puts the blend mode of a key on a material.
 *
 * @remarks
 * The modes are the ones of the game:
 *
 * - `opaque` draws as it is;
 * - `alpha` blends with the alpha of the texture, which is the colour key of the BMP (its black pixels are the holes);
 * - `additive` adds the texture to what is behind it (a light ray, a glow) — black adds nothing, so it is invisible;
 * - `multiplicative` multiplies the two;
 * - `subtractive` darkens what is behind it with the texture (`dst * (1 - src)`), the way a flame darkens a wall.
 *
 * A blended face writes no depth: what stands behind it must stay visible through its holes.
 *
 * @param material The material to set up.
 * @param key The key it draws.
 */
function applyBlend(material: MeshLambertMaterial, key: PaintKey): void {
  material.color.copy(transColorOf(key.trans))

  if (key.blend === 'opaque') {
    return
  }

  material.transparent = true
  material.depthWrite = false

  if (key.blend === 'alpha') {
    return
  }

  material.blending = CustomBlending

  if (key.blend === 'additive') {
    material.blendSrc = OneFactor
    material.blendDst = OneFactor

    return
  }

  if (key.blend === 'multiplicative') {
    material.blendSrc = ZeroFactor
    material.blendDst = SrcColorFactor

    return
  }

  material.blendSrc = ZeroFactor
  material.blendDst = OneMinusSrcColorFactor
}

/**
 * How many textures of the level the paint put on the faces.
 *
 * @param keys What the faces of the level draw with.
 * @param textures The textures of the level, by the name it calls them.
 *
 * @returns The number of the distinct textures the keys use.
 */
export function paintedNamesOf(keys: readonly PaintKey[], textures: ReadonlyMap<string, Texture>): number {
  const names = new Set<string>()

  for (const key of keys) {
    if (key.name !== undefined && textures.has(key.name)) {
      names.add(key.name)
    }
  }

  return names.size
}

/**
 * Builds the material of a face the level gives no texture.
 *
 * @remarks
 * The placeholder of the generator says "a texture belongs here", and it is drawn see-through ({@link NO_TEXTURE_OPACITY}):
 * the face is invisible in the game, so the editor may not hide the level with it. Without a placeholder the face keeps
 * the flat colour of the generator, which is opaque, and the blend mode of its key is kept on both: a torch's flame
 * without its texture still darkens the wall.
 *
 * @param key What the faces draw with, with no name.
 * @param missing The texture the containers the level has none for draw with, when there is one.
 *
 * @returns The material of the key.
 */
function noTextureMaterialOf(key: PaintKey, missing: Texture | undefined): MeshLambertMaterial {
  if (missing === undefined) {
    const material = createLevelMaterial({ side: sideOf(key.doubleSided) })

    applyBlend(material, key)

    return material
  }

  const material = new MeshLambertMaterial({
    map: missing,
    side: sideOf(key.doubleSided),
    opacity: NO_TEXTURE_OPACITY,
    transparent: true,
  })

  applyBlend(material, key)

  // a see-through face writes no depth: what stands behind it must stay visible
  material.depthWrite = false

  return material
}

/**
 * Builds the material of a water face.
 *
 * @remarks
 * The texture of a water face is drawn as a translucent sheet at its own brightness (`WATER_OPACITY`): the colour is
 * not modulated by the `transval` of the face, because the game's water pass does not read it either, and no alpha test
 * cuts the texture (the game draws the water without one). The sheet writes no depth, so the bed of the river stays
 * behind it and a face of the water behind another one is not lost.
 *
 * @param key What the faces draw with, one of the water.
 * @param texture The texture of the level for the name of the key.
 *
 * @returns The lit, translucent sheet of the water.
 */
function waterMaterialOf(key: PaintKey, texture: Texture): MeshLambertMaterial {
  const material = new MeshLambertMaterial({
    map: texture,
    side: sideOf(key.doubleSided),
    transparent: true,
    opacity: WATER_OPACITY,
  })

  material.depthWrite = false

  return material
}

/**
 * Builds the material of a paint key.
 *
 * @remarks
 * A face the level gives **no texture** draws the placeholder of the generator see-through ({@link noTextureMaterialOf}),
 * because the game draws nothing there. A face whose texture the level names but the session has no file for draws the
 * placeholder **as it is**: a whole level without a data directory is that case, and a see-through level would say less
 * than the opaque placeholder does (the texture list names the missing ones). Without a placeholder the face keeps the
 * flat colour of the generator, and every one of them keeps the blend mode of its key: a torch's flame without its
 * texture still darkens the wall.
 *
 * @param key What the faces draw with.
 * @param textures The textures of the level, by the name it calls them.
 * @param missing The texture the containers the level has none for draw with, when there is one.
 *
 * @returns The material of the key.
 */
export function buildMaterial(
  key: PaintKey,
  textures: ReadonlyMap<string, Texture>,
  missing: Texture | undefined,
): MeshLambertMaterial {
  if (key.name === undefined) {
    return noTextureMaterialOf(key, missing)
  }

  const texture = textures.get(key.name) ?? missing

  if (texture === undefined) {
    const material = createLevelMaterial({ side: sideOf(key.doubleSided) })

    applyBlend(material, key)

    return material
  }

  if (key.water) {
    return waterMaterialOf(key, texture)
  }

  const material = new MeshLambertMaterial({ map: texture, side: sideOf(key.doubleSided) })

  // the game cuts the holes of a texture with the alpha it has (`BackgroundRenderOpaque`:
  // `setAlphaCutout(texture->hasAlpha())`), so a wall whose texture has a black background shows what stands behind
  // it — the iron logo of a level 0 wall is the ornament of the texture, not a black panel. The alpha of a 24-bit BMP
  // is the colour key (`applyColourKey`), which is 0 or 255, so the cut is exact.
  material.alphaTest = ALPHA_CUTOUT

  applyBlend(material, key)

  return material
}
