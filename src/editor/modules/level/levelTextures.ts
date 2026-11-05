import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import JSZip from 'jszip'
import {
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type BufferAttribute,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import { watch } from 'vue'
import type { ArxMap, TextureRun } from '../../../generator/ArxMap.ts'
import { BLANK_LEVEL_TEXTURE, GENERATOR_ASSETS } from '../../../generator/assets.ts'
import { decodeTextureBitmap } from '../textures/image.ts'
import { publishLevelTextures } from '../textures/textureCatalog.ts'
import { textureRevision } from './editing.ts'
import { readDataFile, TEXTURE_FOLDER } from './dataDir.ts'
import { buildMaterial, paintedNamesOf, paintKeyOf, paintKeyOfPolygon, type PaintKey } from './levelTextures/paint.ts'
import { levelStore } from './levelStore.ts'

/**
 * The textures of a level that came from a zip.
 *
 * @remarks
 * This is the **spike of the texture round** (TODO 11). A level of the original game draws with the flat grey of the
 * generator, because the textures of the game are in the PAK files the editor does not read. The zip of a custom level
 * carries its own textures (the ones that are not the game's), and its manifest lists them — so a level opened from a
 * zip can be **painted**, and the containers the zip does not have stay flat. The spike paints the solid mesh of the
 * map with one material per container, grouped on the geometry the level already has, so the picking (which reads the
 * triangle order) stays right.
 */

/**
 * The extensions of the image files a zip may carry.
 *
 * @remarks
 * A zip of a level holds its files, its scripts and its sounds as well as its textures: the list of the textures it
 * brings is the list of its images.
 */
const IMAGE_EXTENSIONS = /\.(?:bmp|jpe?g|png|tga)$/iu

/**
 * The anisotropic filtering the textures of a level ask for.
 *
 * @remarks
 * A level is looked at along the floor and the walls, at a grazing angle where an unfiltered texture turns into a
 * shimmer of noise (a wall of bricks reads as a mess). The hardware filters along the direction of the view up to a
 * limit of its own, and three clamps the value to that limit, so a number that is high enough for every card asks for
 * the best a machine has.
 */
const ANISOTROPY = 16

/**
 * The alpha under which a pixel of a texture is not drawn.
 *
 * @remarks
 * The game passes the alpha of the texture it draws as a cutout, so the holes of a colour keyed BMP are holes on every
 * face — on an opaque wall as well as on a blended one. The alpha of the key is 0 or 255, so half is the exact line.
 */

/**
 * Reads the name of a file of a zip path.
 *
 * @param path The path inside the zip.
 *
 * @returns The part after the last slash.
 */
function baseNameOf(path: string): string {
  return path.split('/').at(-1) ?? path
}

/**
 * Reads the names the manifest of a zip lists, in lower case.
 *
 * @param archive The zip to read.
 *
 * @returns The base names of the files the manifest wrote down, or `undefined` when the zip has no usable manifest.
 */
async function listedNamesOf(archive: JSZip): Promise<Set<string> | undefined> {
  const entry = Object.values(archive.files).find((file) => {
    return !file.dir && baseNameOf(file.name).toLowerCase() === 'manifest.json'
  })

  if (entry === undefined) {
    return undefined
  }

  try {
    const manifest: unknown = JSON.parse(await entry.async('string'))

    if (typeof manifest !== 'object' || manifest === null) {
      return undefined
    }

    const { files } = manifest as { files?: unknown }

    if (!Array.isArray(files)) {
      return undefined
    }

    return new Set(
      files
        .filter((file): file is string => {
          return typeof file === 'string'
        })
        .map((path) => {
          return baseNameOf(path).toLowerCase()
        }),
    )
  } catch {
    // a manifest that is not JSON does not stop the textures: the names of the containers find them anyway
    return undefined
  }
}

/**
 * The extensions a texture may have.
 *
 * @remarks
 * The game's textures are BMP, JPG and PNG files, and a level may name one without its extension (`[glass]_windows2`),
 * so the name alone is tried first and the extensions after it.
 */
const TEXTURE_EXTENSIONS = ['', '.jpg', '.bmp', '.png', '.jpeg'] as const

/**
 * Finds the file of a texture, by the name the level calls it.
 *
 * @param byName The files of the zip, by their base name in lower case.
 * @param name The name the level calls the texture.
 *
 * @returns The file, or `undefined` when the zip has none of the names tried.
 */
function entryOf(byName: ReadonlyMap<string, JSZip.JSZipObject>, name: string): JSZip.JSZipObject | undefined {
  const lower = name.toLowerCase()

  for (const extension of TEXTURE_EXTENSIONS) {
    const entry = byName.get(`${lower}${extension}`)

    if (entry !== undefined) {
      return entry
    }
  }

  return undefined
}

/**
 * Finds the files of the textures of a level in the zip of the level.
 *
 * @remarks
 * The level names its textures the way the game reads them (`[stone]_human_wall1.bmp`), and the zip keeps them under
 * the folders of the installed game, so the **base name** is what matches. The manifest of the zip lists the files it
 * wrote with absolute machine paths, so it can not be matched against the paths inside the zip either; the names it
 * lists are what a texture is checked against when there is a manifest — a zip may carry a texture the level no longer
 * uses, and the manifest is what says which files belong to it.
 *
 * @param data The bytes of the zip.
 * @param names The names of the texture containers of the level.
 *
 * @returns The bytes of every texture the zip holds, by the name of the container.
 */
export async function findTextureFiles(data: ArrayBuffer, names: readonly string[]): Promise<Map<string, ArrayBuffer>> {
  const archive = await JSZip.loadAsync(data)
  const entries = Object.values(archive.files).filter((entry) => {
    return !entry.dir
  })
  const byName = new Map<string, JSZip.JSZipObject>()

  for (const entry of entries) {
    byName.set(baseNameOf(entry.name).toLowerCase(), entry)
  }

  const listed = await listedNamesOf(archive)
  const files = new Map<string, ArrayBuffer>()

  for (const name of names) {
    const entry = entryOf(byName, name)

    if (entry === undefined) {
      continue
    }

    // the manifest lists the file with its extension, and a container may name it without one
    if (listed !== undefined && !listed.has(baseNameOf(entry.name).toLowerCase())) {
      continue
    }

    files.set(name, await entry.async('arraybuffer'))
  }

  return files
}

/**
 * Reads the file names of the images a zip carries.
 *
 * @remarks
 * A level names the textures it uses, and the zip of the level may carry more images than that (a texture the author
 * kept, an unused wall): the editor lists them as the textures of the level too, so a face can be painted with them. Only
 * the images are listed — the zip of a level has its files, its scripts and its sounds as well.
 *
 * @param data The bytes of the zip.
 *
 * @returns The base names of the images, without a repeat, in the order of the zip.
 */
export async function zipImageNames(data: ArrayBuffer): Promise<string[]> {
  const archive = await JSZip.loadAsync(data)
  const names = new Set<string>()

  for (const file of Object.values(archive.files)) {
    if (file.dir) {
      continue
    }

    const name = baseNameOf(file.name)

    if (IMAGE_EXTENSIONS.test(name)) {
      names.add(name)
    }
  }

  return [...names]
}

/**
 * Decodes the textures of a level.
 *
 * @remarks
 * The image becomes a texture the way the game reads it: the colours are sRGB (`SRGBColorSpace`), and the texture
 * repeats (`RepeatWrapping`), because the coordinates of an Arx polygon run past one on a wall.
 *
 * @param files The bytes of the textures, by the name the level calls them.
 *
 * @returns The textures, by the same names. A file the browser can not decode is left out.
 */
export async function decodeTextures(files: ReadonlyMap<string, ArrayBuffer>): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>()

  for (const [name, bytes] of files) {
    try {
      const texture = new Texture(await decodeTextureBitmap(name, bytes))

      texture.colorSpace = SRGBColorSpace
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      texture.anisotropy = ANISOTROPY
      texture.needsUpdate = true
      textures.set(name, texture)
    } catch {
      // a texture the browser can not read stays flat: the level is still complete
    }
  }

  return textures
}

/**
 * The texture a face draws with when the zip has none for it.
 *
 * @remarks
 * The textures of the game itself are not in a zip of the generator, so a level opened from a zip would show a flat
 * grey where they belong. The placeholder of the generator (`jorge-[stone].jpg`, the texture `Texture.missingTexture`
 * of the Arx Level Generator puts under a new map) says "a texture belongs here" and tiles over the surface, so the
 * level reads as a level and not as a patchwork of grey.
 *
 * It is loaded once and kept: a level is painted many times (every edit re-groups the faces) but the placeholder is
 * always the same file.
 */
let missingTexture: Texture | undefined

/**
 * Loads the placeholder the faces without a texture draw with.
 *
 * @returns The texture of {@link BLANK_LEVEL_TEXTURE}.
 *
 * @throws When the file of the generator can not be loaded.
 */
export async function loadMissingTexture(): Promise<Texture> {
  if (missingTexture !== undefined) {
    return missingTexture
  }

  const url = GENERATOR_ASSETS[BLANK_LEVEL_TEXTURE]

  if (url === undefined) {
    throw new Error(`The generator has no file for ${BLANK_LEVEL_TEXTURE}.`)
  }

  const image = new Image()

  image.src = url
  await image.decode()

  const texture = new Texture(image)

  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = ANISOTROPY
  texture.needsUpdate = true
  missingTexture = texture

  return texture
}

/**
 * One run of the faces of the level that draw with the same material.
 */
export interface FaceRun {
  /**
   * The first vertex of the run in the geometry.
   */
  readonly start: number
  /**
   * How many vertices the run holds: three for a triangle, six for a quad.
   */
  readonly count: number
  /**
   * What the run draws with.
   */
  readonly key: PaintKey
}

/**
 * The materials the faces of a level need, in the order they first appear.
 *
 * @param map The map of the level.
 * @param polygons The solid faces, in the order of the geometry.
 *
 * @returns The keys of the faces, without a repeat.
 */
function neededKeysOf(map: ArxMap, polygons: readonly ArxPolygon[]): PaintKey[] {
  const keys: PaintKey[] = []
  const seen = new Set<string>()

  for (const polygon of polygons) {
    const key = paintKeyOfPolygon(map, polygon)
    const string = paintKeyOf(key)

    if (seen.has(string)) {
      continue
    }

    seen.add(string)
    keys.push(key)
  }

  return keys
}

/**
 * Reads the runs of the faces of a level that draw with the same material.
 *
 * @remarks
 * The geometry of the level is one buffer in the order of the polygons (three or six vertices each), so a material is
 * drawn with a **group** of the geometry: a run of the neighbouring faces that draw with it. The picking reads the
 * triangle order, which the groups do not touch, so it stays right.
 *
 * @param polygons The polygons of the level, in the order of the geometry.
 * @param keyOf What a polygon draws with.
 *
 * @returns The runs, in the order of the geometry.
 */
export function faceRunsOf(polygons: readonly ArxPolygon[], keyOf: (polygon: ArxPolygon) => PaintKey): FaceRun[] {
  const runs: FaceRun[] = []
  let start = 0

  for (const polygon of polygons) {
    let count = 3

    if (isQuad(polygon)) {
      count = 6
    }

    const key = keyOf(polygon)
    const last = runs.at(-1)

    if (last !== undefined && paintKeyOf(last.key) === paintKeyOf(key)) {
      runs[runs.length - 1] = { start: last.start, count: last.count + count, key }
    } else {
      runs.push({ start, count, key })
    }

    start = start + count
  }

  return runs
}

/**
 * One run of the faces of a level that share a texture, with the material it draws with.
 */
export interface DrawnRun {
  /**
   * The first index of the run in the index buffer of the geometry.
   */
  readonly start: number
  /**
   * How many indices the run holds: three per triangle.
   */
  readonly count: number
  /**
   * The material the run draws with.
   */
  readonly index: number
}

/**
 * Reads the runs of the faces of a level in the order the geometry draws them.
 *
 * @remarks
 * The mesh of the level is picked with a BVH, and the tree writes an **index** into the geometry: the triangles of the
 * index buffer are not in the order of the polygons (the tree groups them for its own walk). A group of the geometry is
 * a range of that buffer, so the runs have to be read there: every triangle of the buffer names its polygon through
 * {@link ArxMap.triangleToPolygon}, and the polygon names its texture.
 *
 * @param map The map the geometry belongs to.
 * @param index The index of the geometry.
 * @param indexOfKey The material of a paint key, from {@link paintKeyOf}.
 *
 * @returns The runs, in the order of the index buffer.
 */
export function drawnRunsOf(map: ArxMap, index: BufferAttribute, indexOfKey: ReadonlyMap<string, number>): DrawnRun[] {
  const runs: DrawnRun[] = []

  for (let triangle = 0; triangle < index.count / 3; triangle = triangle + 1) {
    // the first vertex of the triangle is the start of its polygon in the plain order: three vertices per triangle
    const plain = index.getX(triangle * 3) / 3
    const polygon = map.polygons[map.triangleToPolygon[plain] ?? -1]
    let key: PaintKey = { name: undefined, doubleSided: false, blend: 'opaque', trans: 1 }

    if (polygon !== undefined) {
      key = paintKeyOfPolygon(map, polygon)
    }

    const material = indexOfKey.get(paintKeyOf(key)) ?? 0
    const last = runs.at(-1)

    if (last?.index === material) {
      runs[runs.length - 1] = { start: last.start, count: last.count + 3, index: material }
    } else {
      runs.push({ start: triangle * 3, count: 3, index: material })
    }
  }

  return runs
}

/**
 * Tells whether the runs of the map cover the index of the geometry.
 *
 * @remarks
 * The runs are built together with the index, so they cover it; the check guards a map whose geometry was replaced
 * under it (a consumer of the generator), where walking the triangles is still right.
 *
 * @param runs The runs of the map.
 * @param index The index of the geometry.
 *
 * @returns Whether the last run ends at the last index.
 */
function runsCoverIndex(runs: readonly TextureRun[], index: BufferAttribute): boolean {
  const last = runs.at(-1)

  return last !== undefined && last.start + last.count === index.count
}

/**
 * Adds the groups of a geometry from the runs of a level.
 *
 * @remarks
 * Two containers may share a name (`textureNames`), so the neighbouring runs of the same material are merged, the way
 * {@link drawnRunsOf} merges the neighbouring triangles: the number of the draw calls is the number of the materials.
 *
 * @param geometry The geometry of the level.
 * @param map The map of the level.
 * @param runs The runs, in the order of the index.
 * @param indexOfKey The material of a paint key, from {@link paintKeyOf}.
 */
function addRunGroups(
  geometry: BufferGeometry,
  map: ArxMap,
  runs: readonly TextureRun[],
  indexOfKey: ReadonlyMap<string, number>,
): void {
  let start = 0
  let count = 0
  let material = -1

  for (const run of runs) {
    const key = paintKeyOf({
      name: map.textureNameOf(run.textureContainerId),
      doubleSided: run.doubleSided,
      blend: run.blend,
      trans: run.trans,
    })
    const current = indexOfKey.get(key) ?? 0

    if (current === material) {
      count = count + run.count

      continue
    }

    if (count > 0) {
      geometry.addGroup(start, count, material)
    }

    start = run.start
    count = run.count
    material = current
  }

  if (count > 0) {
    geometry.addGroup(start, count, material)
  }
}

/**
 * The polygons that draw with a real texture, in the order of the solid geometry.
 *
 * @remarks
 * The map keeps its polygons solid first and the invisible walls after them, and the solid mesh holds the first of
 * them: the count of its triangles tells where the solid part ends, so the split needs no walk of the invisible set.
 *
 * @param map The map to read.
 *
 * @returns The solid polygons, in the order of the geometry of the solid mesh.
 */
export function solidPolygonsOf(map: ArxMap): ArxPolygon[] {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return []
  }

  const triangles = mesh.geometry.getAttribute('position').count / 3
  const polygons: ArxPolygon[] = []
  let counted = 0

  for (const polygon of map.polygons) {
    if (counted >= triangles) {
      break
    }

    polygons.push(polygon)

    if (isQuad(polygon)) {
      counted = counted + 2
    } else {
      counted = counted + 1
    }
  }

  return polygons
}

/**
 * Reads the names of the textures the level uses.
 *
 * @param map The map to read.
 *
 * @returns The distinct names of the containers of the solid faces.
 */
export function textureNamesOf(map: ArxMap): string[] {
  const names = new Set<string>()

  for (const polygon of solidPolygonsOf(map)) {
    const name = map.textureNameOf(polygon.textureContainerId)

    if (name !== undefined) {
      names.add(name)
    }
  }

  return [...names]
}

/**
 * What the paint put on a map, so it can be put back.
 */
interface PaintedLevel {
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
   * The keys of the materials the paint built, in the order of the array (the first two are the placeholders).
   */
  readonly keys: readonly string[]
  /**
   * The textures the materials were built from, and the placeholder: another set means the level was painted again with
   * the folder of a zip or of the game, so the materials are built again.
   */
  readonly textures: ReadonlyMap<string, Texture>
  readonly missing: Texture | undefined
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
interface PaintedTextures {
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
 * @param missing The texture the containers the zip has none for draw with; without it they stay the flat colour.
 *
 * @returns How many containers got a texture.
 */
export function paintLevelTextures(map: ArxMap, textures: ReadonlyMap<string, Texture>, missing?: Texture): number {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return 0
  }

  const started = painted
  const materials = started?.materials ?? []
  const polygons = solidPolygonsOf(map)

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

  const isSamePaint =
    started?.textures === textures &&
    started.missing === missing &&
    started.materials.length === keys.length &&
    keyStrings.every((key, index) => {
      return started.keys[index] === key
    })

  if (!isSamePaint) {
    for (const material of materials) {
      material.dispose()
    }

    materials.length = 0

    for (const key of keys) {
      materials.push(buildMaterial(key, textures, missing))
    }
  }

  const { geometry } = mesh

  // the groups follow the order the geometry **draws**: the picking builds a BVH on the mesh and its tree writes an
  // index, which reorders the triangles (`ArxMap.refillGeometry` says the index belongs to the BVH). A group of the
  // plain vertex order would cut the faces in the wrong places — the material of a neighbour on half of them.
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
    painted = { mesh, material: started.material, materials, keys: keyStrings, textures, missing }
  } else {
    painted = { mesh, material: mesh.material, materials, keys: keyStrings, textures, missing }
    mesh.material = materials
  }

  return paintedNamesOf(keys, textures)
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

  for (const material of painted.materials) {
    material.dispose()
  }

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
 * stay the flat colour of the generator (TODO 11).
 *
 * @param map The map to paint.
 * @param textures The textures of the zip, by the name the level calls them.
 * @param missing The texture a container draws with when the zip has none for it (the placeholder of the generator).
 *
 * @returns How many containers got a texture, so the caller can tell the user.
 */
export function paintZipTextures(map: ArxMap, textures: Map<string, Texture>, missing?: Texture): number {
  current = { map, textures, missing }

  return paintLevelTextures(map, textures, missing)
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
    const texture = new Texture(await decodeTextureBitmap(name, bytes))

    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.anisotropy = ANISOTROPY
    texture.needsUpdate = true
    current.textures.set(name, texture)

    return true
  } catch {
    // a file the browser can not decode stays the placeholder of the level
    return false
  }
}

/**
 * Starts the paint of the level, so the textures of a zip follow the level.
 *
 * @remarks
 * The spike paints one level: a new level starts flat (its textures are the ones of the zip it came with), and an edit
 * of the painted level builds the groups of the geometry again, because the faces moved. Without this a delete would
 * draw the faces with the textures of their neighbours.
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
    if (current !== undefined) {
      paintLevelTextures(current.map, current.textures, current.missing)
    }
  })
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
