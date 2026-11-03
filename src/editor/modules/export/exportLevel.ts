import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxDLF, ArxFTS, ArxLLF, ArxPolygon } from 'arx-convert/types'
import { getCellCoords, isQuad, MAP_WIDTH_IN_CELLS } from 'arx-convert/utils'
import { getHeaderSize } from 'arx-header-size'
import JSZip from 'jszip'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import type { LevelFiles } from '../level/levelSource.ts'
import { packLevelFile, packWholeFile } from '../level/packedFile.ts'

/**
 * The name the browser saves the archive of a level under.
 *
 * @remarks
 * The archive is what a mod of the game is: a folder of level files the user drops in the data directory. The name is
 * the one the archived editor used, so a file of the two can not be told apart by its name.
 */
export const EXPORT_ZIP_NAME = 'mod.zip'

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
 * - the **room distances** are the sound cache: `-1` says "use the true distance", so every pair gets that.
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

  const roomDistances = Array.from({ length: (maxRoomId + 1) ** 2 }, () => {
    return {
      distance: -1,
      startPosition: { x: 0, y: 0, z: 0 },
      endPosition: { x: 0, y: 0, z: 0 },
    }
  })

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
 * Rebuilds the description of a level.
 *
 * @remarks
 * The editor does not edit entities yet, so the description is the one that was loaded; only the count of the polygons
 * of the scene it names follows the export (the header carries it).
 *
 * @param dlf The description as it was loaded.
 * @param polygonCount The number of polygons the exported scene has.
 *
 * @returns The description of the file to write.
 */
export function buildExportDlf(dlf: ArxDLF, polygonCount: number): ArxDLF {
  return { ...dlf, header: { ...dlf.header, numberOfPolygonsInFTS: polygonCount } }
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
 *
 * @returns The three files, ready to be zipped.
 *
 * @throws When the level has no polygon left (`buildExportFts` throws).
 */
export function exportLevelFiles(map: ArxMap): LevelFiles {
  const { polygons } = map
  const scene = FTS.save(buildExportFts(map.fts, polygons))
  const lighting = LLF.save(buildExportLlf(map.llf, polygons))
  const description = DLF.save(buildExportDlf(map.dlf, polygons.length))

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
 * Zips the three files of a level, the way the game reads them.
 *
 * @param map The map to write.
 *
 * @returns The bytes of the archive and the name the browser saves it under.
 *
 * @throws When the level has no polygon left (`buildExportFts` throws).
 */
export async function exportLevelZip(map: ArxMap): Promise<{ readonly name: string; readonly data: ArrayBuffer }> {
  const files = exportLevelFiles(map)
  const { levelIdx } = map.dlf.header
  const archive = new JSZip()

  archive.file(levelFilePath(levelIdx, 'fts'), files.fts)
  archive.file(levelFilePath(levelIdx, 'dlf'), files.dlf)
  archive.file(levelFilePath(levelIdx, 'llf'), files.llf)

  return { name: EXPORT_ZIP_NAME, data: await archive.generateAsync({ type: 'arraybuffer' }) }
}
