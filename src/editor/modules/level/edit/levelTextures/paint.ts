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
import { blendModeOf, blendTransOf, isDoubleSided, type PolygonBlendMode } from '../../../../../generator/polygons.ts'

/**
 * The alpha cut of the material of a face: the texels of the texture below it are not drawn.
 *
 * @remarks
 * The game cuts the holes of a texture with `alphaTest` (a fence, a banner) — see `ALPHA_CUTOUT` in the old file.
 */
const ALPHA_CUTOUT = 0.5

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

  return `${side}|${key.blend}|${key.trans.toFixed(2)}|${key.name ?? ''}`
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
 * Builds the material of a paint key.
 *
 * @remarks
 * The faces without a texture of their own draw with the placeholder of the generator (a flat grey when there is none),
 * and they keep the blend mode of their key: a torch's flame without its texture still darkens the wall.
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
  let texture = missing

  if (key.name !== undefined) {
    texture = textures.get(key.name) ?? missing
  }

  if (texture === undefined) {
    const material = createLevelMaterial({ side: sideOf(key.doubleSided) })

    applyBlend(material, key)

    return material
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
