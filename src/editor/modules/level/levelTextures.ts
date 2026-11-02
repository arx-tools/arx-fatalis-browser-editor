import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import JSZip from 'jszip'
import { MeshLambertMaterial, RepeatWrapping, SRGBColorSpace, Texture, type Material, type Mesh } from 'three'
import { watch } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { BLANK_LEVEL_TEXTURE, GENERATOR_ASSETS } from '../../../generator/assets.ts'
import { createLevelMaterial } from '../../../generator/meshes.ts'
import { levelRevision } from './editing.ts'
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
 * The MIME type of a texture, by its extension.
 *
 * @remarks
 * The blob needs a type: a blob without one is not a document every browser decodes an image from, and the game's
 * textures are BMP, JPG and PNG files.
 *
 * @param name The name the level calls the texture.
 *
 * @returns The MIME type, `application/octet-stream` for a name with no known extension.
 */
function mimeTypeOf(name: string): string {
  const lower = name.toLowerCase()

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (lower.endsWith('.png')) {
    return 'image/png'
  }

  if (lower.endsWith('.bmp')) {
    return 'image/bmp'
  }

  return 'application/octet-stream'
}

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
      const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeTypeOf(name) }))
      const texture = new Texture(bitmap)

      texture.colorSpace = SRGBColorSpace
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
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
  texture.needsUpdate = true
  missingTexture = texture

  return texture
}

/**
 * One run of the faces of the level that share a texture.
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
   * The name of the texture of the run, or `undefined` when the level has no container for it.
   */
  readonly name: string | undefined
}

/**
 * Reads the runs of the faces of a level that share a texture.
 *
 * @remarks
 * The geometry of the level is one buffer in the order of the polygons (three or six vertices each), so a texture is
 * drawn with a **group** of the geometry: a run of the neighbouring faces that use the same container. The picking
 * reads the triangle order, which the groups do not touch, so it stays right.
 *
 * @param polygons The polygons of the level, in the order of the geometry.
 * @param nameOf The name of the texture of a polygon, or `undefined` when it has no container.
 *
 * @returns The runs, in the order of the geometry.
 */
export function faceRunsOf(
  polygons: readonly ArxPolygon[],
  nameOf: (polygon: ArxPolygon) => string | undefined,
): FaceRun[] {
  const runs: FaceRun[] = []
  let start = 0

  for (const polygon of polygons) {
    let count = 3

    if (isQuad(polygon)) {
      count = 6
    }

    const name = nameOf(polygon)
    const last = runs.at(-1)

    if (last !== undefined && last.name === name) {
      runs[runs.length - 1] = { start: last.start, count: last.count + count, name }
    } else {
      runs.push({ start, count, name })
    }

    start = start + count
  }

  return runs
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
}

/**
 * The level the paint is on: the spike paints one level at a time.
 */
let painted: PaintedLevel | undefined

/**
 * The level of the last paint and the textures it was painted with, so an edit can paint it again.
 */
let current:
  | { readonly map: ArxMap; readonly textures: ReadonlyMap<string, Texture>; readonly missing: Texture | undefined }
  | undefined

/**
 * Paints the solid mesh of a level with its textures.
 *
 * @remarks
 * One material per texture container, the first being the flat material of the generator for the containers the zip
 * did not have (the game's own textures) and for the faces with no container. The groups of the geometry are cleared
 * and built again, so the call is also what re-paints the level after an edit moved the faces.
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

  for (const material of materials) {
    material.dispose()
  }

  materials.length = 0

  if (missing === undefined) {
    materials.push(createLevelMaterial())
  } else {
    materials.push(new MeshLambertMaterial({ map: missing }))
  }

  const indexOfName = new Map<string, number>()
  const polygons = solidPolygonsOf(map)

  for (const polygon of polygons) {
    const name = map.textureNameOf(polygon.textureContainerId)
    let texture: Texture | undefined

    if (name !== undefined) {
      texture = textures.get(name)
    }

    if (name === undefined || texture === undefined || indexOfName.has(name)) {
      continue
    }

    indexOfName.set(name, materials.length)
    materials.push(new MeshLambertMaterial({ map: texture }))
  }

  const { geometry } = mesh
  const runs = faceRunsOf(polygons, (polygon) => {
    return map.textureNameOf(polygon.textureContainerId)
  })

  geometry.clearGroups()

  for (const run of runs) {
    let index = 0
    let named: number | undefined

    if (run.name !== undefined) {
      named = indexOfName.get(run.name)
    }

    if (named !== undefined) {
      index = named
    }

    geometry.addGroup(run.start, run.count, index)
  }

  if (started?.mesh !== mesh) {
    painted = { mesh, material: mesh.material, materials }
    mesh.material = materials
  }

  return materials.length - 1
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
export function paintZipTextures(map: ArxMap, textures: ReadonlyMap<string, Texture>, missing?: Texture): number {
  current = { map, textures, missing }

  return paintLevelTextures(map, textures, missing)
}

/**
 * Paints the level of a zip with the textures the zip carries.
 *
 * @remarks
 * The textures of the level are in the same zip as the level, and both the picker of the header and the `fromZip` url
 * call this: the containers the zip has are drawn with their texture, and the ones it does not have (the textures of
 * the game itself) take the placeholder of the generator.
 *
 * @param map The map the zip made.
 * @param data The bytes of the zip, or `undefined` when the source has not read it (nothing is painted then).
 */
export async function paintZipLevel(map: ArxMap, data: ArrayBuffer | undefined): Promise<void> {
  if (data === undefined) {
    return
  }

  const names = textureNamesOf(map)
  const files = await findTextureFiles(data, names)
  const textures = await decodeTextures(files)
  // the textures of the game are not in the zip: the placeholder of the generator stands in for them
  const missing = await loadMissingTexture()
  const painted = paintZipTextures(map, textures, missing)

  // the user has to know what the zip brought: the containers it does not have are the textures of the game
  console.info(
    `Textures of the zip: ${String(painted)} of ${String(names.length)} painted, ${String(files.size)} found.`,
  )
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
      const previous = current?.map

      if (previous !== undefined && previous !== map) {
        unpaintLevelTextures(previous)
      }

      current = undefined
    },
  )

  watch(levelRevision, () => {
    if (current !== undefined) {
      paintLevelTextures(current.map, current.textures, current.missing)
    }
  })
}
