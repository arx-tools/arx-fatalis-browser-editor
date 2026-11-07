import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxDLF, ArxFTS, ArxLLF, ArxPolygon } from 'arx-convert/types'
import { getCellCoords, isQuad, MAP_WIDTH_IN_CELLS } from 'arx-convert/utils'
import { getHeaderSize } from 'arx-header-size'
import JSZip from 'jszip'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { roomCentersOf, roomDistancesOf } from '../../../generator/roomDistances.ts'
import type { LevelFiles } from '../level/source/levelSource.ts'
import type { LevelManifest } from '../level/source/zipSource.ts'
import { packLevelFile, packWholeFile } from '../level/source/packedFile.ts'

/**
 * The name the browser saves the archive of a level under.
 *
 * @remarks
 * The archive is what a mod of the game is: a folder of level files the user drops in the data directory. The name is
 * the one the archived editor used, so a file of the two can not be told apart by its name.
 */
const EXPORT_ZIP_NAME = 'mod.zip'

/**
 * How far the export is, in percent, at the steps it reports.
 *
 * @remarks
 * The values are the **time** of the steps, not their count: the scene of the level is a few megabytes, and packing it
 * is most of the wait (level 11: 6,3 MB, ~9 s of the 11 s). The numbers are the ones the archived editor showed.
 */
export const EXPORT_PROGRESS = {
  start: 0,
  sceneBuilt: 10,
  scenePacked: 70,
  lightingPacked: 80,
  descriptionPacked: 90,
  zipped: 100,
} as const

/**
 * The step the export reports its progress with.
 */
export type ExportProgressHandler = (percent: number) => void

/**
 * How long a step lets the page paint before the next one starts, in milliseconds.
 *
 * @remarks
 * The packing is synchronous, so the page can only update between the steps: a macrotask with a frame's worth of delay
 * gives the browser the room to paint the percentage and to keep the spinner of the button turning (that one is a
 * compositor animation, so it turns even while a step runs).
 */
const PAINT_PAUSE_MS = 16

/**
 * Gives the browser a moment to paint.
 *
 * @returns A promise that settles after the pause.
 */
async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, PAINT_PAUSE_MS)
  })
}

/**
 * The white a vertex takes when the level's palette has no colour for it.
 *
 * @remarks
 * A palette is a list the polygons point into: a vertex whose base is past the end of it has no light, and the game
 * draws such a vertex black. The editor writes white instead, so a missing colour reads as a lit face and not as a
 * black hole (the same value the archived editor used).
 */
const MISSING_COLOR: ArxColor = { r: 255, g: 255, b: 255, a: 255 }

/**
 * The number of colours a polygon owns in the palette of the LLF.
 *
 * @param polygon The polygon to read.
 *
 * @returns Three for a triangle, four for a quad: the fourth corner is a colour too.
 */
function colorCountOf(polygon: ArxPolygon): number {
  if (isQuad(polygon)) {
    return 4
  }

  return 3
}

/**
 * Rebuilds the scene of a level from the polygons the editor holds.
 *
 * @remarks
 * The polygons are the ones of the screen, in their order, and the rest of the scene is the one that was loaded: the
 * texture containers, the anchors, the unique headers and the header itself. The parts that **reference the polygons
 * by index** have to be rebuilt, because an edit moves them:
 *
 * - the **cells** are written by `arx-convert` from the polygons, so they are not touched here;
 * - the **rooms** list the polygons of a room by cell (`cellX`, `cellY` and the index of the polygon inside the cell);
 * - a **portal** joins two rooms, so a portal of a room that lost its every polygon goes, and the list is remapped;
 * - the **room distances** are the sound and **interaction** cache: the game measures an entity through them, and `-1` means "the straight line" (so the player could reach through a wall), so they are computed from the portal graph (see `generator/roomDistances.ts`).
 *
 * @param fts The scene as it was loaded.
 * @param polygons The polygons of the screen, solid first and the invisible walls after them.
 *
 * @returns The scene of the file to write.
 *
 * @throws When the level has no polygon left: an FTS needs at least one room, and a level without a face is not one.
 */
export function buildExportFts(fts: ArxFTS, polygons: readonly ArxPolygon[]): ArxFTS {
  if (polygons.length === 0) {
    throw new Error('The level has no polygon left, there is nothing to export.')
  }

  let maxRoomId = 0

  for (const polygon of polygons) {
    maxRoomId = Math.max(maxRoomId, polygon.room)
  }

  const rooms = fts.rooms.slice(0, maxRoomId + 1).map((room) => {
    return { portals: [...room.portals], polygons: [] as ArxFTS['rooms'][number]['polygons'] }
  })
  const cellPolygonCounts = new Map<number, number>()

  for (const polygon of polygons) {
    const [cellX, cellY] = getCellCoords(polygon.vertices)
    const cellRowOffset = cellY * MAP_WIDTH_IN_CELLS
    const cellKey = cellRowOffset + cellX
    const polygonIdx = cellPolygonCounts.get(cellKey) ?? 0

    cellPolygonCounts.set(cellKey, polygonIdx + 1)

    const room = rooms[polygon.room]

    if (room !== undefined) {
      room.polygons.push({ cellX, cellY, polygonIdx })
    }
  }

  const portalIndexRemap = new Map<number, number>()
  const portals = fts.portals.filter((portal, index) => {
    if (portal.room1 > maxRoomId || portal.room2 > maxRoomId) {
      return false
    }

    portalIndexRemap.set(index, portalIndexRemap.size)

    return true
  })

  for (const room of rooms) {
    room.portals = room.portals
      .map((portalIndex) => {
        return portalIndexRemap.get(portalIndex)
      })
      .filter((portalIndex): portalIndex is number => {
        return portalIndex !== undefined
      })
  }

  // the distances are what the game measures an entity with, and a `-1` would measure the straight line through
  // the wall: the path through the portals is the one the game's own bake wrote
  const roomDistances = roomDistancesOf(roomCentersOf(polygons), portals, rooms.length)

  return {
    ...fts,
    polygons: [...polygons],
    portals,
    rooms,
    roomDistances,
  }
}

/**
 * Rebuilds the lighting of a level from the palette it was loaded with.
 *
 * @remarks
 * The palette of the LLF is a flat list **in the order of the polygons**: a polygon owns three colours (one per corner)
 * or four (the fourth corner of a quad), and the loader works out where a polygon starts (`llfColorIdx` on its first
 * vertex). An edit moves the polygons, so the list is rebuilt in the order of the screen from the colours the vertices
 * already point at — the **light** of a face is kept, it is not baked again.
 *
 * @param llf The lighting as it was loaded.
 * @param polygons The polygons of the screen.
 *
 * @returns The lighting of the file to write.
 */
export function buildExportLlf(llf: ArxLLF, polygons: readonly ArxPolygon[]): ArxLLF {
  const header = { ...llf.header, numberOfPolygonsInFTS: polygons.length }

  // a level without a palette (a blank one, or one of the generator) has no colour to follow: the file keeps none
  if (llf.colors.length === 0) {
    return { ...llf, header, colors: [] }
  }

  const colors: ArxColor[] = []

  for (const polygon of polygons) {
    const base = polygon.vertices[0]?.llfColorIdx ?? 0
    const count = colorCountOf(polygon)

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      colors.push(llf.colors[base + vertex] ?? MISSING_COLOR)
    }
  }

  return { ...llf, header, colors }
}

/**
 * The values the export dialog lets the user change before the archive is written.
 */
export interface ExportOptions {
  /**
   * The index the level gets: the paths inside the archive, and the header of the description.
   *
   * @remarks
   * A level is `levelN` in the data directory, and the game reads the number from the files; the editor opens a level
   * with its own index (`map.dlf.header.levelIdx`), and a mod that replaces another level is written with the number the
   * user gives. Without it the loaded index stays.
   */
  readonly levelIndex?: number
  /**
   * The seed the manifest of the archive carries, the way the url carries it.
   */
  readonly seed?: string
}

/**
 * The name of the manifest inside the archive.
 *
 * @remarks
 * It is the name the generator writes, and the one the loader of the zips reads: the archive says what the level was
 * made with, so a level opened from it comes back with its seed.
 */
const MANIFEST_NAME = 'manifest.json'

/**
 * Rebuilds the description of a level.
 *
 * @remarks
 * The editor does not edit entities yet, so the description is the one that was loaded; only the count of the polygons
 * of the scene it names follows the export (the header carries it).
 *
 * @param dlf The description as it was loaded.
 * @param polygonCount The number of polygons the exported scene has.
 * @param levelIndex The index the level takes, when the user gave one.
 *
 * @returns The description of the file to write.
 */
export function buildExportDlf(dlf: ArxDLF, polygonCount: number, levelIndex?: number): ArxDLF {
  if (levelIndex === undefined) {
    return { ...dlf, header: { ...dlf.header, numberOfPolygonsInFTS: polygonCount } }
  }

  return { ...dlf, header: { ...dlf.header, numberOfPolygonsInFTS: polygonCount, levelIdx: levelIndex } }
}

/**
 * Builds the three packed files of a level, from the map of the screen.
 *
 * @remarks
 * This is the whole point of the export: the files are **generated from the map in the memory** (the polygons of the
 * editor and the scene, the lighting and the description it was opened with), so the loaded bytes of the original
 * level are not needed. The bodies are compressed the way the game's files are (`packLevelFile` / `packWholeFile`).
 *
 * The header of the scene is **not** a fixed size: it carries the unique headers, so where the body starts is read
 * from the file itself (`getHeaderSize`), the same call the loader makes. The description has a fixed header, and the
 * lighting has none: the whole file is compressed.
 *
 * @param map The map to write.
 * @param options The values of the dialog, when the caller has them.
 *
 * @returns The three files, ready to be zipped.
 *
 * @throws When the level has no polygon left (`buildExportFts` throws).
 */
export function exportLevelFiles(map: ArxMap, options: ExportOptions = {}): LevelFiles {
  const { polygons } = map
  const scene = FTS.save(buildExportFts(map.fts, polygons))
  const lighting = LLF.save(buildExportLlf(map.llf, polygons))
  const description = DLF.save(buildExportDlf(map.dlf, polygons.length, options.levelIndex))

  return {
    dlf: packLevelFile(description, getHeaderSize(description, 'dlf').total),
    fts: packLevelFile(scene, getHeaderSize(scene, 'fts').total),
    llf: packWholeFile(lighting),
  }
}

/**
 * The path of a level file inside the archive.
 *
 * @remarks
 * The game keeps the scene under `GAME/GRAPH/LEVELS` and the description and the lighting under `GRAPH/LEVELS`
 * (`GAME/GRAPH/Levels/Level8/fast.fts` beside `GRAPH/levels/level8/level8.dlf` in an unpacked installation), and a mod
 * is a folder of the same shape that the game reads over its own files. The paths here are the lower case ones of the
 * data directory the editor reads, so an archive opens as a level in the editor without a rename.
 *
 * @param level The number of the level.
 * @param kind Which file of the level.
 *
 * @returns The path of the file, with a leading slash.
 */
export function levelFilePath(level: number, kind: 'dlf' | 'fts' | 'llf'): string {
  if (kind === 'fts') {
    return `/game/graph/levels/level${String(level)}/fast.fts`
  }

  return `/graph/levels/level${String(level)}/level${String(level)}.${kind}`
}

/**
 * Builds the manifest of the archive: the files of the level, and the seed it was made with.
 *
 * @remarks
 * The seed of the dialog is **any text** (the generator starts its random numbers from a text), so a seed that is all
 * digits is written as the number the generator itself writes, and every other text stays text. Without a seed the
 * manifest lists the files only: a level without a seed is one the game makes one for.
 *
 * @param levelIndex The index the level gets.
 * @param seed The seed of the level, or `undefined` when there is none.
 *
 * @returns The manifest, ready to be written as JSON.
 */
export function buildExportManifest(levelIndex: number, seed: string | undefined): LevelManifest {
  const files = [levelFilePath(levelIndex, 'fts'), levelFilePath(levelIndex, 'dlf'), levelFilePath(levelIndex, 'llf')]
  const value = seed?.trim() ?? ''

  if (value === '') {
    return { files }
  }

  if (/^\d+$/u.test(value)) {
    return { files, seed: Number.parseInt(value, 10) }
  }

  return { files, seed: value }
}

/**
 * Zips the three files of a level, the way the game reads them.
 *
 * @remarks
 * It is the same three files as {@link exportLevelFiles}, one at a time and with a pause between them, so the page can
 * paint the percentage the caller is told about ({@link EXPORT_PROGRESS}). The work itself is the one of the plain
 * files: this is the **user's** way out, and the file builder is the one the tests measure.
 *
 * @param map The map to write.
 * @param onProgress Called with the percentage of the export, at each step.
 * @param options The values of the export dialog: the index of the level and the seed of the manifest.
 *
 * @returns The bytes of the archive and the name the browser saves it under.
 *
 * @throws When the level has no polygon left (`buildExportFts` throws).
 */
export async function exportLevelZip(
  map: ArxMap,
  onProgress?: ExportProgressHandler,
  options: ExportOptions = {},
): Promise<{ readonly name: string; readonly data: ArrayBuffer }> {
  const { polygons } = map

  onProgress?.(EXPORT_PROGRESS.start)
  await nextPaint()

  // the scene: the file itself, then the compressed body (the long step)
  const scene = FTS.save(buildExportFts(map.fts, polygons))

  onProgress?.(EXPORT_PROGRESS.sceneBuilt)
  await nextPaint()

  const fts = packLevelFile(scene, getHeaderSize(scene, 'fts').total)

  onProgress?.(EXPORT_PROGRESS.scenePacked)
  await nextPaint()

  // the lighting, the whole file compressed
  const llf = packWholeFile(LLF.save(buildExportLlf(map.llf, polygons)))

  onProgress?.(EXPORT_PROGRESS.lightingPacked)
  await nextPaint()

  // the index of the level: the one the user gave in the dialog, or the one it was opened with
  const levelIndex = options.levelIndex ?? map.dlf.header.levelIdx

  // the description: the entities of the level, the count of the polygons it names and the index it takes
  const description = DLF.save(buildExportDlf(map.dlf, polygons.length, levelIndex))
  const dlf = packLevelFile(description, getHeaderSize(description, 'dlf').total)

  onProgress?.(EXPORT_PROGRESS.descriptionPacked)
  await nextPaint()

  const archive = new JSZip()

  archive.file(levelFilePath(levelIndex, 'fts'), fts)
  archive.file(levelFilePath(levelIndex, 'dlf'), dlf)
  archive.file(levelFilePath(levelIndex, 'llf'), llf)
  archive.file(MANIFEST_NAME, JSON.stringify(buildExportManifest(levelIndex, options.seed), undefined, 2))

  const data = await archive.generateAsync({ type: 'arraybuffer' })

  onProgress?.(EXPORT_PROGRESS.zipped)

  return { name: EXPORT_ZIP_NAME, data }
}
