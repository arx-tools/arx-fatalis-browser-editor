import { watch } from 'vue'
import type { Material, Mesh, Texture } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { decodeTextureBitmap } from '../../textures/image.ts'
import { publishLevelTextures } from '../../textures/textureCatalog.ts'
import { readDataFile } from '../source/dataDir.ts'
import { TEXTURE_FOLDER } from '../source/dataDir/url.ts'
import { flatColorOf, type FlatColor } from '../../../../generator/flatColors.ts'
import { persistedRef } from '../../persistedRef/persistedRef.ts'
import { bumpLevelRevision, textureRevision } from './editing.ts'
import {
  createLevelTexture,
  decodeTextures,
  findTextureFiles,
  learnFlatColorOfTexture,
  loadMissingTexture,
  zipImageNames,
} from './levelTextures/load.ts'
import { writeBakedColors } from './levelTextures/bakedColors.ts'
import {
  buildFlatMaterial,
  buildMaterial,
  type PaintKey,
  paintedNamesOf,
  paintKeyOf,
  paintKeyOfPolygon,
} from './levelTextures/paint.ts'
import { applyTemporaryUvsOf } from './levelTextures/temporaryUvs.ts'
import { isRainbowProfile, lightingProfile } from './lightingProfile.ts'
import {
  addRunGroups,
  drawnRunsOf,
  faceRunsOf,
  neededKeysOf,
  runsCoverIndex,
  solidPolygonsOf,
  textureNamesOf,
} from './levelTextures/runs.ts'
import { levelStore } from './levelStore.ts'

/**
 * The textures of a level: where they come from, and how they land on the faces.
 *
 * @remarks
 * A level of the original game draws with the flat gray of the generator, because the textures of the game are in the
 * PAK files the editor does not read. The zip of a custom level carries its own textures (the ones that are not the
 * game's), and its manifest lists them — so a level opened from a zip can be **painted**, and the containers the zip
 * does not have stay flat. The paint puts one material per container on the solid mesh, grouped on the geometry the
 * level already has, so the picking (which reads the triangle order) stays right.
 *
 * This module is the facade: the **state** of the paint (the materials, the textures and the placeholder of the level
 * on the screen), the **runs** the groups of the geometry are built from, and the **orchestration** of a paint
 * (`paintLevel`, `repaintLevelTextures`) and of the edits that re-paint (`startLevelTextures`). The loading of the
 * files is [`load.ts`](levelTextures/load.ts), and what a texture does on a face is
 * [`paint.ts`](levelTextures/paint.ts).
 */

/**
 * What the paint put on a map, so it can be put back.
 */
type PaintedLevel = {
  /**
   * The mesh the paint touched.
   */
  readonly mesh: Mesh
  /**
   * The material the mesh had before, to put back.
   */
  readonly material: Material | Material[]
  /**
   * The materials of the paint, which stay the same array: a view wraps the mesh and keeps what it found there, so an
   * edit that re-paints the level has to change the contents of this array and not the material of the mesh.
   */
  readonly materials: Material[]
  /**
   * The materials of the faces **with** their textures, in the order of {@link PaintedLevel.materials}.
   */
  readonly textured: Material[]
  /**
   * The materials of the faces **without** their textures, in the same order and with the same keys.
   *
   * @remarks
   * The switch of the textures writes one set or the other into {@link PaintedLevel.materials}, and it is the **contents**
   * that change: a view wraps the mesh once and keeps the array it found there (see `viewMeshesOf`), so swapping the
   * array of the mesh would leave the view drawing the old materials. The flat set draws the side, the blend and the
   * alpha cut of the key, with the average color of its texture.
   */
  readonly flat: Material[]
  /**
   * The keys of the materials the paint built, in the order of the array (the first two are the placeholders).
   */
  readonly keys: readonly string[]
  /**
   * The textures the materials were built from, and the placeholder: another set means the level was painted again with
   * the folder of a zip or of the game, so the materials are built again.
   */
  readonly textures: ReadonlyMap<string, Texture>
  readonly missing: Texture | undefined
  /**
   * Whether the materials were built for the `TextureRainbow` profile, which keeps the textures lightened.
   *
   * @remarks
   * The profile is a fact of the author, not of the level: a change of it repaints the level, and the materials are
   * rebuilt when the flag turns (the shader of a texture material is not the one of the other profile).
   */
  readonly rainbow: boolean
}

/**
 * Whether the faces of the level draw their textures.
 *
 * @remarks
 * It is a view preference like the switches of the overlays: a `persistedRef` in the `localStorage`, so the editor comes
 * back the way it was left. The default is **on**, because the textures are what the level looks like; a level without
 * them draws the **flat color** of the texture of every face (see {@link setTexturesVisible}), which is the view to read
 * a level whose pictures hide it (2026-11-24, the owner: the `T` switch, under the mesh).
 */
export const isTexturesVisible = persistedRef<boolean>({
  key: 'texturesVisible',
  defaultValue: true,
  persistInLocalStorage: true,
})

/**
 * The color of a face whose texture the flat color table does not know: the white of the plain material.
 */
const WHITE_FLAT_COLOR: FlatColor = [255, 255, 255]

/**
 * The flat color of the texture of a key: the average of its texture, or the white of a face without one.
 *
 * @param key What the faces draw with.
 *
 * @returns The color, in sRGB, from 0 to 255.
 */
function flatColorOfKey(key: PaintKey): FlatColor {
  if (key.name === undefined) {
    return WHITE_FLAT_COLOR
  }

  return flatColorOf(key.name) ?? WHITE_FLAT_COLOR
}

/**
 * The two sets of materials of a paint, and what they are built from.
 */
type MaterialSets = {
  readonly flat: Material[]
  readonly keys: readonly PaintKey[]
  readonly missing: Texture | undefined
  readonly rainbow: boolean
  readonly textures: ReadonlyMap<string, Texture>
  readonly textured: Material[]
}

/**
 * Fills the two sets of the paint: the textured materials and the flat ones, key by key.
 *
 * @param sets The two sets, and what the materials are built from.
 */
function fillMaterialsOf(sets: MaterialSets): void {
  for (const key of sets.keys) {
    sets.textured.push(buildMaterial(key, sets.textures, sets.missing, sets.rainbow))
    sets.flat.push(buildFlatMaterial(key, flatColorOfKey(key)))
  }
}

/**
 * What a paint reads of the level: the textures, the placeholder, the profile and the keys of the faces.
 */
type PaintSource = {
  readonly keyStrings: readonly string[]
  readonly missing: Texture | undefined
  readonly rainbow: boolean
  readonly textures: ReadonlyMap<string, Texture>
}

/**
 * Tells whether the paint would build the same materials again.
 *
 * @param started The paint the level is on, or `undefined` before the first one.
 * @param paint The textures, the placeholder, the profile and the keys of the paint.
 *
 * @returns True when the materials of the level are already the ones of this paint.
 */
function isSamePaintOf(started: PaintedLevel | undefined, paint: PaintSource): boolean {
  if (started === undefined) {
    return false
  }

  if (started.textures !== paint.textures || started.missing !== paint.missing || started.rainbow !== paint.rainbow) {
    return false
  }

  if (started.materials.length !== paint.keyStrings.length) {
    return false
  }

  return paint.keyStrings.every((key, index) => {
    return started.keys[index] === key
  })
}

/**
 * Throws the two sets of the paint away.
 *
 * @param textured The materials with their textures.
 * @param flat The materials without them.
 */
function disposeMaterialsOf(textured: Material[], flat: Material[]): void {
  for (const material of [...textured, ...flat]) {
    material.dispose()
  }

  textured.length = 0
  flat.length = 0
}

/**
 * Writes the set the switch of the textures asks for into the array the views hold.
 *
 * @param materials The array of the mesh, which the views share: its contents change, its identity does not.
 * @param textured The materials with their textures.
 * @param flat The materials without them.
 */
function fillSharedMaterials(materials: Material[], textured: Material[], flat: Material[]): void {
  materials.length = 0

  if (isTexturesVisible.value) {
    materials.push(...textured)

    return
  }

  materials.push(...flat)
}

/**
 * The level the paint is on: the spike paints one level at a time.
 */
let painted: PaintedLevel | undefined

/**
 * The bytes of the zip the level of the last paint came from, so a repaint (a data directory picked after the load)
 * keeps the textures of the zip.
 */
let lastZipData: ArrayBuffer | undefined

/**
 * The level of the last paint and the textures it was painted with.
 */
type PaintedTextures = {
  /**
   * The map of the level.
   */
  readonly map: ArxMap
  /**
   * The textures the paint found, by the name the level calls them.
   *
   * @remarks
   * The map is the one the materials of the paint were built from, and an edit adds to it (a texture the user dropped, a
   * texture of the data directory the level never used): the identity of the map is what tells the paint whether its
   * materials are the ones of these textures.
   */
  readonly textures: Map<string, Texture>
  /**
   * The placeholder of the textures the level has no file for.
   */
  readonly missing: Texture | undefined
}

/**
 * The level of the last paint and the textures it was painted with, so an edit can paint it again.
 */
let current: PaintedTextures | undefined

/**
 * Paints the solid mesh of a level with its textures.
 *
 * @remarks
 * One material per **paint key** (a texture and a side, see {@link PaintKey}): the two placeholders come first, for the
 * containers the zip did not have (the game's own textures) and for the faces with no container — one for the one-sided
 * faces and one for the two-sided ones, because the side is a property of the material. The groups of the geometry are
 * cleared and built again, so the call is also what re-paints the level after an edit moved the faces.
 *
 * @param map The map to paint.
 * @param textures The textures, by the name the level calls them.
 * @param missing The texture the containers the zip has none for draw with; without it they stay the flat color.
 * @param rainbow Whether the materials are the ones of the `TextureRainbow` profile, which lightens the textures.
 *
 * @returns How many containers got a texture.
 */
export function paintLevelTextures(
  map: ArxMap,
  textures: ReadonlyMap<string, Texture>,
  missing?: Texture,
  rainbow = false,
): number {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return 0
  }

  const started = painted
  const materials = started?.materials ?? []
  let textured = started?.textured ?? []
  let flat = started?.flat ?? []
  const polygons = solidPolygonsOf(map)

  // a face the level gives no texture has no uv either: without one the placeholder would sample a single texel of it, so
  // its corners are laid on the square of its plane (the polygons keep their own uvs, see `temporaryUvs.ts`)
  applyTemporaryUvsOf(map, polygons, mesh.geometry)

  // the light of the level is baked: the material is unlit and takes the palette from the geometry, so the editor shows
  // what the export writes
  writeBakedColors(map)

  // the keys the paint needs, in the order they first appear: the materials are built for these, and a repaint (an
  // edit) keeps them — the same keys, the same materials, no shader of thirty textures built again for a delete
  const keys = neededKeysOf(map, polygons)
  const keyStrings = keys.map((key) => {
    return paintKeyOf(key)
  })
  const indexOfKey = new Map<string, number>(
    keyStrings.map((key, index) => {
      return [key, index]
    }),
  )

  if (!isSamePaintOf(started, { keyStrings, missing, rainbow, textures })) {
    disposeMaterialsOf(textured, flat)
    textured = []
    flat = []
    fillMaterialsOf({ flat, keys, missing, rainbow, textures, textured })
  }

  // the set the switch asks for goes into the array the views hold: the contents change, not the array
  fillSharedMaterials(materials, textured, flat)

  const { geometry } = mesh

  // the groups follow the order the geometry **draws**: the picking builds a BVH on the mesh and its tree writes an
  // index, which reorders the triangles (`ArxMap.refillGeometry` says the index belongs to the BVH). A group of the
  // plain vertex order would cut the faces in the wrong places — the material of a neighbor on half of them.
  const index = geometry.getIndex()

  geometry.clearGroups()

  if (index === null) {
    // a geometry the picking has not indexed yet: the polygons are in the order of the vertices
    for (const run of faceRunsOf(polygons, (polygon) => {
      return paintKeyOfPolygon(map, polygon)
    })) {
      geometry.addGroup(run.start, run.count, indexOfKey.get(paintKeyOf(run.key)) ?? 0)
    }
  } else if (runsCoverIndex(map.textureRuns, index)) {
    // the index is in the texture order, so a run of the map is a block of the index: the groups are the runs, and the
    // walk over the triangles (123 485 of them on level 11, 52 ms) is not needed
    addRunGroups(geometry, map, map.textureRuns, indexOfKey)
  } else {
    for (const run of drawnRunsOf(map, index, indexOfKey)) {
      geometry.addGroup(run.start, run.count, run.index)
    }
  }

  if (started?.mesh === mesh) {
    painted = {
      flat,
      mesh,
      material: started.material,
      materials,
      keys: keyStrings,
      textures,
      missing,
      rainbow,
      textured,
    }
  } else {
    painted = { flat, mesh, material: mesh.material, materials, keys: keyStrings, textures, missing, rainbow, textured }
    mesh.material = materials
  }

  return paintedNamesOf(keys, textures)
}

/**
 * Turns the textures of the faces on or off.
 *
 * @remarks
 * The two sets of the paint are already built (see {@link PaintedLevel.flatMaterials}), so the switch only hands the
 * other one to the mesh: no material is built, no shader compiled, and the level keeps its geometry, its groups and its
 * light. The flat set draws the side, the blend and the alpha cut of every key, with the average color of its texture.
 *
 * @param visible Whether the faces draw their textures.
 */
export function setTexturesVisible(visible: boolean): void {
  isTexturesVisible.value = visible

  if (painted === undefined) {
    return
  }

  fillSharedMaterials(painted.materials, painted.textured, painted.flat)
}

/**
 * Puts the flat material back on the level.
 *
 * @param map The map to clean.
 */
export function unpaintLevelTextures(map: ArxMap): void {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined || painted?.mesh !== mesh) {
    return
  }

  disposeMaterialsOf([...painted.textured], [...painted.flat])

  mesh.geometry.clearGroups()
  mesh.material = painted.material
  painted = undefined
  current = undefined
}

/**
 * Paints the level on the screen with the textures of a zip.
 *
 * @remarks
 * The containers the zip does not have are the textures of the game itself, which the editor does not read yet: they
 * stay the flat color of the generator (TODO 11).
 *
 * @param map The map to paint.
 * @param textures The textures of the zip, by the name the level calls them.
 * @param missing The texture a container draws with when the zip has none for it (the placeholder of the generator).
 *
 * @returns How many containers got a texture, so the caller can tell the user.
 */
export function paintZipTextures(map: ArxMap, textures: Map<string, Texture>, missing?: Texture): number {
  current = { map, textures, missing }

  return paintLevelTextures(map, textures, missing, isRainbowProfile(lightingProfile.value))
}

/**
 * Paints the level on the screen with its textures.
 *
 * @remarks
 * The textures come from two places: the zip of the level (**when it came from one**) carries the ones its author
 * added, and the data directory of the game (`?dataDir=…`) has the rest — the ones the level uses from the game
 * itself. A container neither has takes the placeholder of the generator (`jorge-[stone].jpg`), so a missing texture
 * reads as a missing one and the level stays complete.
 *
 * @param map The map to paint.
 * @param zipData The bytes of the zip the level came from, when it came from one.
 */
export async function paintLevel(map: ArxMap, zipData?: ArrayBuffer): Promise<void> {
  lastZipData = zipData

  const names = textureNamesOf(map)
  let zipFiles = new Map<string, ArrayBuffer>()

  if (zipData !== undefined) {
    zipFiles = await findTextureFiles(zipData, names)
  }

  const files = new Map(zipFiles)
  const fromDataDir: string[] = []

  // the textures the zip does not have are the ones of the game itself: the data directory of the header or the url
  for (const name of names) {
    if (files.has(name)) {
      continue
    }

    try {
      const bytes = await readDataFile(`${TEXTURE_FOLDER}/${name}`)

      if (bytes !== undefined) {
        files.set(name, bytes)
        fromDataDir.push(name)
      }
    } catch {
      // a folder that can not be read leaves the texture flat, the level is still complete
    }
  }

  const textures = await decodeTextures(files)

  // a texture the table of the game does not know got its flat color from the decoded file (a custom texture of the
  // zip, a file of the data directory): the wireframe was built before the textures arrived, so it writes its lines
  // again, with the colors of the textures on the screen
  map.refreshWireframeColors()

  // the containers left without a texture take the placeholder of the generator
  const missing = await loadMissingTexture()
  const painted = paintZipTextures(map, textures, missing)

  // the texture list of the editor shows every texture it can paint a face with, and it reads the groups of it from
  // where the paint found them: the zip of the level, the data directory of the game, and the rest of the zip
  let zipImages: string[] = []

  if (zipData !== undefined) {
    zipImages = await zipImageNames(zipData)
  }

  publishLevelTextures({ map, fromZip: zipFiles, fromDataDir, zipImages })

  // the user has to know what came from where: the rest of the containers is what the placeholder stands in for
  console.info(
    `Textures: ${String(painted)} of ${String(names.length)} painted, ${String(zipFiles.size)} from the zip, ${String(fromDataDir.length)} from the data dir.`,
  )

  // the paint changed the colors under the views (and the base gray of a load): without the step the view keeps the
  // frame it drew before the paint, the level unlit, until a mouse move asks for a render
  bumpLevelRevision()
}

/**
 * Puts a texture into the paint of the level, so a face can draw with it.
 *
 * @remarks
 * A level draws with the textures its containers name, and the paint of the level has a material for every one of them:
 * a texture the level did not have (a file the user dropped, a texture of the data directory it never used) is decoded
 * and put into the map of the paint, and the next paint of the edit (`levelRevision`) builds its material. The texture is
 * not touched when the paint already has it.
 *
 * @param name The name the level calls the texture.
 * @param bytes The bytes of the file.
 *
 * @returns True when the paint has the texture.
 */
export async function registerLevelTexture(name: string, bytes: ArrayBuffer): Promise<boolean> {
  if (current === undefined) {
    return false
  }

  if (current.textures.has(name)) {
    return true
  }

  try {
    const bitmap = await decodeTextureBitmap(name, bytes)

    current.textures.set(name, createLevelTexture(bitmap))

    // a texture the table of the game does not know arrives with its flat color (the average of its pixels): the lines
    // of the faces that draw with it take that color from now on
    if (learnFlatColorOfTexture(name, bitmap)) {
      current.map.refreshWireframeColors()
    }

    return true
  } catch {
    // a file the browser can not decode stays the placeholder of the level
    return false
  }
}

/**
 * Whether the paint is loading the textures it met but does not have, so two revisions do not load them twice.
 */
let filling = false

/**
 * Loads the textures the paint meets but does not have.
 *
 * @remarks
 * A paint builds its materials from the containers the level has **at that moment**. A container can arrive later: a
 * step of the history read back after a reload adds the container of the texture the author painted, and the paint has
 * no bytes for it (the file of the level never had that container). The name of the container says where to look, so the
 * missing ones are read from the zip of the level, then from the data directory of the game: without this the face
 * would draw with the placeholder of the generator, and the author would see the paint of the last session lost.
 */
async function fillMissingTextures(): Promise<void> {
  const map = levelStore.map.value
  const paint = current

  if (map === undefined || paint === undefined) {
    return
  }

  const names = textureNamesOf(map).filter((name) => {
    return !paint.textures.has(name)
  })

  if (names.length === 0) {
    return
  }

  let zipFiles = new Map<string, ArrayBuffer>()

  if (lastZipData !== undefined) {
    zipFiles = await findTextureFiles(lastZipData, names)
  }

  for (const name of names) {
    const fromZip = zipFiles.get(name)

    if (fromZip !== undefined) {
      await registerLevelTexture(name, fromZip)

      continue
    }

    try {
      const bytes = await readDataFile(`${TEXTURE_FOLDER}/${name}`)

      if (bytes !== undefined) {
        await registerLevelTexture(name, bytes)
      }
    } catch {
      // a folder that can not be read leaves the texture flat, the level is still complete
    }
  }
}

/**
 * Paints the level again after an edit, with the textures it may have met since the last paint.
 */
async function repaintForRevision(): Promise<void> {
  if (filling) {
    return
  }

  filling = true

  try {
    await fillMissingTextures()
  } finally {
    filling = false
  }

  if (current !== undefined) {
    paintLevelTextures(current.map, current.textures, current.missing, isRainbowProfile(lightingProfile.value))

    // the paint of the level came after the step that asked for it (the texture was still on its way), so the views drew
    // the level before this: the step is what they follow, and it has to hear about the paint that followed it. Without
    // this the face draws with the texture it had, and only the next click (a step of its own) shows the new one
    bumpLevelRevision()
  }
}

/**
 * Starts the paint of the level, so the textures of a zip follow the level.
 *
 * @remarks
 * The spike paints one level: a new level starts flat (its textures are the ones of the zip it came with), and an edit
 * of the painted level builds the groups of the geometry again, because the faces moved. Without this a delete would
 * draw the faces with the textures of their neighbors.
 */
export function startLevelTextures(): void {
  watch(
    () => {
      return levelStore.map.value
    },
    (map) => {
      const paintedMap = current?.map

      // the paint of a level runs **before** the map is published (the prepare step of the load), so the map that
      // arrives is usually the one that was just painted: clearing here would drop the textures of the level of the
      // screen, and the first edit would then leave the groups of the old paint on the new geometry
      if (paintedMap === undefined || paintedMap === map) {
        return
      }

      unpaintLevelTextures(paintedMap)
      current = undefined
      lastZipData = undefined
    },
  )

  watch(textureRevision, () => {
    // the steps of a history are applied in a row (a reload replays them): the load of the textures they met waits for
    // the one that is running, and the paint that follows is the one of the last state
    void repaintForRevision()
  })
}

/**
 * Paints the baked colors of the level on the screen again, without reading the textures.
 *
 * @remarks
 * A profile change only changes the palette: the textures and the materials of the painted level are the ones on the
 * screen, and reading the data directory again would cost more than the bake. The paint writes the colors of the
 * geometry, and the views are asked for a frame.
 */
export function repaintLevelColors(): void {
  if (current === undefined) {
    return
  }

  paintLevelTextures(current.map, current.textures, current.missing, isRainbowProfile(lightingProfile.value))
  bumpLevelRevision()
}

/**
 * Writes the groups of the level again, without painting it.
 *
 * @remarks
 * A group that hides its faces changes the **index** of the solid mesh (its triangles are the visible faces), and a group
 * is a range of the index: the renderer needs the groups again. The vertices, the materials and the baked colors are the
 * same (the faces a group hides keep their place in the buffers), so the textures are not read again and the color
 * attribute is not written: this is the cheap half of a paint, for a change of the view alone.
 */
export function repaintLevelView(): void {
  const level = current?.map
  const paintedLevel = painted
  const mesh = level?.solidMeshes[0]

  if (level === undefined || paintedLevel === undefined || mesh === undefined) {
    return
  }

  const indexOfKey = new Map<string, number>(
    paintedLevel.keys.map((key, index) => {
      return [key, index]
    }),
  )

  mesh.geometry.clearGroups()
  addRunGroups(mesh.geometry, level, level.textureRuns, indexOfKey)
  bumpLevelRevision()
}

/**
 * Paints the level on the screen again, with the data directory the user just picked.
 *
 * @remarks
 * The folder of the header may come after the level: the textures the level had no source for are fetched from the
 * new folder, and the ones it already had are read again (a repaint is cheap: a few dozen files).
 */
export async function repaintLevelTextures(): Promise<void> {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  await paintLevel(map, lastZipData)
}
