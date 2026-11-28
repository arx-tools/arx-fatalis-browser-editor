import { DLF, FTS, LLF } from 'arx-convert'
import {
  type ArxColor,
  type ArxDLF,
  type ArxFTS,
  type ArxLLF,
  type ArxLight,
  type ArxPolygon,
  ArxLightFlags,
} from 'arx-convert/types'
import { getCellCoords, isQuad, MAP_DEPTH_IN_CELLS, MAP_WIDTH_IN_CELLS } from 'arx-convert/utils'
import { getHeaderSize } from 'arx-header-size'
import JSZip from 'jszip'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { bakeLlfColors, bakeLlfColorsInChunks } from '../../../generator/lighting.ts'
import {
  MANIFEST_NAME,
  type LevelManifest,
  type ManifestAuthor,
  type ManifestEditor,
  type ManifestProject,
} from '../../../generator/manifest.ts'
import { roomCentersOf, roomDistancesOf } from '../../../generator/roomDistances.ts'
import { roomRenumberingOf } from '../../../generator/rooms.ts'
import {
  EDITOR_GROUPS_PATH,
  EDITOR_ROOMS_PATH,
  editorGroupsJsonOf,
  editorRoomsJsonOf,
  type EditorGroup,
} from '../editorFiles.ts'
import type { HistorySnapshot } from '../history/mapHistory.ts'
import { syncGeneratedPortals } from '../level/edit/generatedPortals.ts'
import { paletteBakeOptionsOf } from '../level/edit/lightingProfile.ts'
import { guardPolygonsOf } from '../level/mapGuards.ts'
import { NO_ROOM } from '../rooms/roomList.ts'
import { BLANK_LEVEL_TEXTURE } from '../../../generator/assets.ts'
import { clippedToMapOf } from '../../../generator/clipToMap.ts'
import {
  floorTileOf,
  floorsUnderOf,
  nearestFaceOf,
  spawnFeetOf,
  spawnFloorProbeOf,
  spawnOutsideMapOf,
} from '../level/entities/spawnFloor.ts'
import { editorSettingsJsonOf, SETTINGS_PATH, SOURCE_FOLDER } from '../level/source/editorSettings.ts'
import type { StoredPose } from '../level/source/maps/mapPoses.ts'
import type { LevelFiles } from '../level/source/levelSource.ts'
import { packLevelFile, packWholeFile } from '../level/source/packedFile.ts'
import { TEXTURE_FOLDER, type ExportTexture } from './exportTextures.ts'
import { splitTextureBatchesOf, textureStemOf, type TextureCopy } from './textureBatches.ts'

/**
 * The name the browser saves the archive of a level under.
 *
 * @remarks
 * The archive is what a mod of the game is: a folder of level files the user drops in the data directory. The name
 * carries the time of the export, so two downloads of the same level do not overwrite each other in the folder of the
 * browser (2026-11-24, the owner: every export was a `mod.zip`).
 *
 * @param at The time of the export, in the clock of the page.
 *
 * @returns The name, for example `arx-fatalis-browser-editor-export-2026-11-24T14-09-12.zip`.
 */
export function exportZipNameOf(at: Date): string {
  /**
   * Writes a number of the clock with two digits.
   *
   * @param value The number of the clock.
   *
   * @returns The number, padded to two digits.
   */
  function pad(value: number): string {
    return String(value).padStart(2, '0')
  }

  const date = `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`

  return `arx-fatalis-browser-editor-export-${date}T${time}.zip`
}

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
 * The white a vertex takes when the level's palette has no color for it.
 *
 * @remarks
 * A palette is a list the polygons point into: a vertex whose base is past the end of it has no light, and the game
 * draws such a vertex black. The editor writes white instead, so a missing color reads as a lit face and not as a
 * black hole (the same value the archived editor used).
 */
const MISSING_COLOR: ArxColor = { r: 255, g: 255, b: 255, a: 255 }

/**
 * The black a corner takes when the static light is switched off: the game draws the level dark, as the editor does.
 */
const DARK_COLOR: ArxColor = { r: 0, g: 0, b: 0, a: 255 }

/**
 * The number of colors a polygon owns in the palette of the LLF.
 *
 * @param polygon The polygon to read.
 *
 * @returns Three for a triangle, four for a quad: the fourth corner is a color too.
 */
function colorCountOf(polygon: ArxPolygon): number {
  if (isQuad(polygon)) {
    return 4
  }

  return 3
}

/**
 * Puts the polygons in the order `FTS.save` writes them.
 *
 * @remarks
 * The FTS stores its polygons **by cell**, and `FTS.load` gives every polygon its `llfColorIdx` as it reads them: the
 * index is **not** in the file, it is the running count of the polygons the loader has seen. The palette of the LLF has
 * to be built in this same order, or the game reads the color of another face — the first cells usually match the map,
 * so a level can look right until the first cell where the two orders part.
 *
 * `FTS.save` walks the polygons in their order, pushes each into its cell, and then writes the cells in the order of
 * the grid; a sort by the cell, stable inside a cell, is the same order.
 *
 * @param polygons The polygons of the scene.
 *
 * @returns The same polygons, in the order the FTS file writes them.
 */
export function cellOrderedPolygonsOf(polygons: readonly ArxPolygon[]): ArxPolygon[] {
  return polygons
    .map((polygon, index) => {
      const [cellX, cellY] = getCellCoords(polygon.vertices)
      const row = cellY * MAP_WIDTH_IN_CELLS

      return { polygon, cell: row + cellX, index }
    })
    .toSorted((one, other) => {
      const byCell = one.cell - other.cell

      if (byCell !== 0) {
        return byCell
      }

      return one.index - other.index
    })
    .map((entry) => {
      return entry.polygon
    })
}

/**
 * The size of the square the polygons of an FTS are sorted into, in the units of the game.
 */
const MAP_SIZE = MAP_WIDTH_IN_CELLS * 100

/**
 * Tells the author which face is outside the map, before the file is written.
 *
 * @remarks
 * An FTS sorts its polygons into a grid of 160 x 160 cells of a hundred units, so a face outside that square has no cell
 * and `FTS.save` throws a `TypeError` of a library instead of a sentence. A face leaves the square when a step moves it
 * or an imported mesh is scaled past it, and the game can not place it either, so the export says which face and where.
 *
 * @param polygons The polygons the file is written from.
 *
 * @throws `Error` with the index and the middle of the first face outside the map.
 */
function assertInMapOf(polygons: readonly ArxPolygon[]): void {
  for (const [index, polygon] of polygons.entries()) {
    const [cellX, cellY] = getCellCoords(polygon.vertices)

    if (cellX >= 0 && cellX < MAP_WIDTH_IN_CELLS && cellY >= 0 && cellY < MAP_DEPTH_IN_CELLS) {
      continue
    }

    const [a, b, c] = polygon.vertices
    const x = ((a?.x ?? 0) + (b?.x ?? 0) + (c?.x ?? 0)) / 3
    const z = ((a?.z ?? 0) + (b?.z ?? 0) + (c?.z ?? 0)) / 3

    throw new Error(
      `The face ${index} is outside the map: its middle is at x ${x.toFixed(0)}, z ${z.toFixed(0)}, and the map holds 0 to ${MAP_SIZE}. Move it back, or undo the step that moved it.`,
    )
  }
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
 * - a **portal** joins two rooms, so a portal of a room that lost its every polygon goes, and the portal list of the
 * rooms is **rebuilt** from the portals that stay: a room may have lost its own list (a generated portal), and the
 * game walks the portals from both of its rooms;
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

  assertInMapOf(polygons)

  // the ids the level uses are written without the holes (166/5): a room with nothing in it is a room the game walks
  // for nothing, and every place that names a room follows the same map
  const renumbering = roomRenumberingOf(
    polygons.map((polygon) => {
      return polygon.room
    }),
  )
  const highestRoomId = Math.max(0, ...renumbering.values())
  const oldRoomOf = new Map<number, number>()

  for (const [old, id] of renumbering) {
    oldRoomOf.set(id, old)
  }

  const rooms = Array.from({ length: highestRoomId + 1 }, (_unused, id) => {
    const old = oldRoomOf.get(id) ?? id

    return { portals: [...(fts.rooms[old]?.portals ?? [])], polygons: [] as ArxFTS['rooms'][number]['polygons'] }
  })
  const cellPolygonCounts = new Map<number, number>()
  const renumbered = polygons.map((polygon) => {
    return { ...polygon, room: renumbering.get(polygon.room) ?? polygon.room }
  })

  for (const polygon of renumbered) {
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

  const portals = fts.portals
    .map((portal) => {
      return {
        ...portal,
        room1: renumbering.get(portal.room1) ?? portal.room1,
        room2: renumbering.get(portal.room2) ?? portal.room2,
      }
    })
    .filter((portal) => {
      return portal.room1 <= highestRoomId && portal.room2 <= highestRoomId
    })

  // the portals are the truth of the room lists: the game walks them from both of their rooms, and a generated portal
  // never went through the lists of the file the level was loaded from
  for (const room of rooms) {
    room.portals = []
  }

  for (const [index, portal] of portals.entries()) {
    for (const roomId of new Set([portal.room1, portal.room2])) {
      rooms[roomId]?.portals.push(index)
    }
  }

  // the distances are what the game measures an entity with, and a `-1` would measure the straight line through
  // the wall: the path through the portals is the one the game's own bake wrote
  const roomDistances = roomDistancesOf(roomCentersOf(polygons), portals, rooms.length)

  return {
    ...fts,
    polygons: renumbered,
    portals,
    rooms,
    roomDistances,
  }
}

/**
 * Which light layers the export writes.
 *
 * @remarks
 * The switches of the light layer are the author's: a layer that is off is not in the level, so its lights are not in the
 * file, and the palette of a level without its static light is black. The defaults are both on: a level exported from a
 * fresh editor keeps every light.
 */
export type ExportLights = {
  /**
   * Whether the baked (static) light of the level goes into the file.
   */
  readonly staticLights?: boolean
  /**
   * Whether the semi-dynamic lights of the level go into the file.
   */
  readonly dynamicLights?: boolean
}

/**
 * Tells whether a light of the layer takes part in the export.
 *
 * @param light The light of the LLF.
 * @param withStaticLights Whether the static layer is on.
 * @param withDynamicLights Whether the dynamic layer is on.
 *
 * @returns True when the file keeps the light.
 */
function isExportedLight(light: ArxLight, withStaticLights: boolean, withDynamicLights: boolean): boolean {
  if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
    return withDynamicLights
  }

  return withStaticLights
}

/**
 * Rebuilds the lighting of a level from the palette it was loaded with.
 *
 * @remarks
 * The palette of the LLF is a flat list **in the order of the polygons of the file**: a polygon owns three colors (one
 * per corner) or four (the fourth corner of a quad). The FTS does **not** store the index of the first color:
 * `FTS.load` gives every polygon its `llfColorIdx` as it reads the polygons, in the order `FTS.save` wrote them (the
 * cells of the grid, see {@link cellOrderedPolygonsOf}). The list is rebuilt in that same order from the colors the
 * vertices already point at — the **light** of a face is kept, it is not baked again.
 *
 * The switches of the light layer decide what the file keeps: the lights of a layer that is off are left out, and a level
 * without its static light gets a black palette, so the game draws what the editor showed. The palette keeps its length
 * in every case: the corners point into it by their index.
 *
 * @param llf The lighting as it was loaded.
 * @param polygons The polygons of the file, in the order `FTS.save` writes them (see {@link cellOrderedPolygonsOf}).
 * @param lights Which layers of the light take part in the export; both are on when it is left out.
 *
 * @returns The lighting of the file to write.
 */
export function buildExportLlf(llf: ArxLLF, polygons: readonly ArxPolygon[], lights: ExportLights = {}): ArxLLF {
  const header = { ...llf.header, numberOfPolygonsInFTS: polygons.length }
  const withStaticLights = lights.staticLights ?? true
  const withDynamicLights = lights.dynamicLights ?? true
  const exportedLights = llf.lights.filter((light) => {
    return isExportedLight(light, withStaticLights, withDynamicLights)
  })

  // a level without a palette (a blank one, or one of the generator) has no color to follow: the file keeps none
  if (llf.colors.length === 0) {
    return { ...llf, header, lights: exportedLights, colors: [] }
  }

  const colors: ArxColor[] = []

  for (const polygon of polygons) {
    const base = polygon.vertices[0]?.llfColorIdx ?? 0
    const count = colorCountOf(polygon)

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      if (withStaticLights) {
        colors.push(llf.colors[base + vertex] ?? MISSING_COLOR)
      } else {
        colors.push(DARK_COLOR)
      }
    }
  }

  return { ...llf, header, lights: exportedLights, colors }
}

/**
 * Bakes the palette of the files from the final scene of the level.
 *
 * @remarks
 * The palette of the editor is the light of the level, and a geometry step bakes the corners it moved. A step that
 * moved faces without baking them (a drag that ended in another path, or a step the replay of the history could not
 * follow) leaves the palette of those faces at the light of the place they came from: the game then lights a copied
 * block brightly in a dark room, or darkly in a lit one. The export is the last look at the level, so the palette is
 * baked again from the scene the files hold — the same bake the editor runs when the level is opened.
 *
 * The bake reads the profile of the widget, so the file shows the light the editor showed. The palette is a copy: the
 * level of the editor keeps its own.
 *
 * @param map The level to bake.
 * @param polygons The polygons of the scene, in the order the export writes them.
 * @param options Which layers of the light the export writes.
 *
 * @returns The colors of the palette, by the index of the level.
 */
function freshPaletteOf(map: ArxMap, polygons: readonly ArxPolygon[], options: ExportLights): ArxColor[] {
  // a level without its static light gets a black palette from `buildExportLlf`, so the bake would be thrown away
  if (options.staticLights === false) {
    return map.llf.colors
  }

  // the bake reads the polygons of the scene and the scene position, not the room lists: the level's own header is
  // enough, and the polygons are the ones of the screen
  const scene: ArxFTS = { ...map.fts, polygons: [...polygons] }

  return bakeLlfColors(scene, map.llf, paletteBakeOptionsOf(map))
}

/**
 * The same bake as {@link freshPaletteOf}, in chunks, so the page can paint while the export runs.
 *
 * @param map The level to bake.
 * @param polygons The polygons of the scene, in the order the export writes them.
 * @param options Which layers of the light the export writes.
 *
 * @returns The colors of the palette, when the bake is done.
 */
async function freshPaletteInChunksOf(
  map: ArxMap,
  polygons: readonly ArxPolygon[],
  options: ExportLights,
): Promise<ArxColor[]> {
  // a level without its static light gets a black palette from `buildExportLlf`, so the bake would be thrown away
  if (options.staticLights === false) {
    return map.llf.colors
  }

  const scene: ArxFTS = { ...map.fts, polygons: [...polygons] }

  return await bakeLlfColorsInChunks(scene, map.llf, paletteBakeOptionsOf(map))
}

/**
 * The values the export dialog lets the user change before the archive is written.
 */
/**
 * Reads the bytes of the texture a copy of the split is made of.
 *
 * @remarks
 * The extension is the one of the **file** the bytes came from (`[stone]_wall1.bmp` may be a `.jpg` on the disk), and
 * the archive writes the copy with it: the game looks a texture up by its stem and tries the image extensions, so the
 * name the FTS carries and the file of the archive may differ in the extension, and the file is the one that decides.
 *
 * @param from The name of the texture the copy is made of, as the level has it.
 *
 * @returns The bytes and the extension of the file, or `undefined` when no source of the editor has it.
 */
export type TextureCopyReader = (
  from: string,
) => Promise<{ readonly bytes: ArrayBuffer; readonly extension: string } | undefined>

export type ExportOptions = ExportLights & {
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
  /**
   * The manifest of the zip the level was opened from, when it was opened from one.
   *
   * @remarks
   * The generator issues the base of a manifest, and the editor writes its own block over it: a level that came out of a
   * zip keeps the name, the version, the description, the author and the url the archive said, so a mod stays the same
   * mod through an editor round.
   */
  readonly manifest?: LevelManifest
  /**
   * The pose of the camera on the level when the archive is written.
   *
   * @remarks
   * It is the view of the editor, not the spawn of the player: the spawn is the level's own, and a later round may let it
   * be set on the map. The archive carries the pose so the same level opens on the same view on another machine; it goes
   * into the settings of the editor, not into the manifest.
   */
  readonly camera?: StoredPose
  /**
   * The moment the archive is written, as an ISO timestamp, for the block of the editor.
   *
   * @remarks
   * The tests pass a fixed moment, so the bytes of an archive are the same on every run.
   */
  readonly exportedAt?: string
  /**
   * Whether the archive centers the map in the game's world.
   *
   * @remarks
   * The game places the arrow of the player on its map from the lowest corner of the level on the X axis and the highest
   * one on the Z (`MiniMap.cpp`, `computePlayerPos`), so a level of a few hundred units stands in the corner of the map
   * sheet whatever its origin is. This option adds the two small quads that put the level in the middle, at the last
   * minute: the level of the editor stays the way the author left it, and the archive carries the corners a level of the
   * game has (2026-11-27, the owner). Off by default, and not for the levels of the game.
   */
  readonly centerMap?: boolean
  /**
   * The author of the level, as the dialog read it.
   *
   * @remarks
   * An empty field of the dialog says nothing: the author of the zip the level came from is kept then, so a mod that is
   * exported again does not lose the one who made it.
   */
  readonly author?: ManifestAuthor
  /**
   * The page of the level, as the dialog read it.
   *
   * @remarks
   * The empty field keeps the project of the zip the level came from, the same way the author does.
   */
  readonly project?: ManifestProject
  /**
   * The names the author gave the rooms.
   *
   * @remarks
   * They are the editor's state of the level, so they come from the panel and not from the zip: a level that is exported
   * again keeps the names the author typed, and the ones the manifest of the zip had are read into the panel when the
   * level is opened.
   */
  readonly roomNames?: Readonly<Record<string, string>>
  /**
   * The groups of the faces, as the Group Inspector made them.
   *
   * @remarks
   * The archive keeps them in `editor/groups.json`, with the indices of the level the archive writes: opening the zip
   * again finds the groups, and the faces they hold.
   */
  readonly groups?: readonly EditorGroup[]
  /**
   * The steps of the level, when it has some.
   *
   * @remarks
   * The steps are indices of the level the editor loaded (the file the map was built from), so the archive keeps that
   * level too, under `editor/source/`, and the steps in a `history.json` beside the manifest: an editor that opens the
   * archive replays the steps onto the source and gets the result back **with** its undo chain. Without steps the
   * archive is only the result, as it always was.
   */
  readonly history?: HistorySnapshot
  /**
   * The textures the archive carries beside the level files.
   *
   * @remarks
   * They are the ones the game does not have (the pictures of the level's zip and the placeholder of the generator), and
   * the dialog reads them with `exportTexturesFor` before it calls this (TODO 324): the drawing and the reading of a
   * build asset belong to the page, the bytes are what the archive writes.
   */
  readonly textures?: readonly ExportTexture[]
  /**
   * Reads the file of a texture the split of the batches copied.
   *
   * @remarks
   * A level that is too big for the game (a batch of a room holds more than 65 535 indices) gets a copy of its texture
   * for the faces that do not fit (TODO 104), and the copy is a file of the archive of its own: the dialog reads the
   * bytes here, where the page can reach the data directory and the assets of the build, and the archive writes them
   * under the name the copy carries. A texture whose bytes can not be read is named in the result, and the faces of its
   * batch will not draw in the game.
   */
  readonly readTextureFile?: TextureCopyReader
}

/**
 * Rebuilds the description of a level.
 *
 * @remarks
 * The description is the one that was loaded, with the **places** the entity editor wrote in it (they live in the DLF the
 * editor holds, see `ArxMap.setEntityPositions`); only the count of the polygons of the scene it names follows the
 * export (the header carries it).
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
 * The palette of the lighting is **baked again** from the scene the files hold ({@link freshPaletteOf}): a step that
 * moved faces and did not bake their colors leaves the palette at the light of the old place, and the game would light
 * the copied block with it. The palette of the editor is not touched.
 *
 * @param map The map to write.
 * @param options The values of the dialog, when the caller has them.
 *
 * @returns The three files, ready to be zipped.
 *
 * @throws When the level has no polygon left (`buildExportFts` throws).
 */
/**
 * What the export did to the faces of the level on the way to the files.
 */
type ExportedPolygons = {
  /**
   * The polygons of the archive, in the order the FTS writes them.
   */
  readonly polygons: ArxPolygon[]
  /**
   * How many faces the square of the map cut a part of.
   */
  readonly clipped: number
  /**
   * How many faces stood outside the map whole, and are left out.
   */
  readonly dropped: number
  /**
   * Whether the export put a tile under the spawn, because the level had no floor there.
   */
  readonly floor: boolean
}

/**
 * Reads the polygons the files of the archive are written from, in the order the FTS writes them.
 *
 * @remarks
 * The corners that center the map join the list here and not in the level: they are the quads the game reads the arrow
 * of the player from, and the level of the editor is not the place of them (2026-11-27, the owner). The faces that stand
 * past the square of the map are **cut down to it** here too, the way the Arx Level Generator cut them at its own end:
 * the game has a cell for the faces of the square only, and a face that stands past it can not be written at all
 * (TODO 106). The order is the one of the cells either way, because the palette of the lighting goes with it.
 *
 * @param map The level to write.
 * @param options The options of the export: whether the archive centers the map.
 *
 * @returns The polygons of the archive, and what the map cut of them.
 *
 * @throws When the spawn of the level stands outside the map: the game would open the level without a player.
 */
function exportedPolygonsOf(map: ArxMap, options: ExportOptions): ExportedPolygons {
  const polygons = map.visiblePolygons
  const container = polygons[0]?.textureContainerId ?? map.polygons[0]?.textureContainerId ?? 0
  let withGuards = [...polygons]

  if (options.centerMap === true) {
    withGuards = [...polygons, ...guardPolygonsOf(container)]
  }

  const clip = clippedToMapOf(withGuards)
  const exported = [...clip.polygons]
  const feet = spawnFeetOf(map)

  // the spawn of the level is the point the game loads the player on: a spawn off the map opens the level without a
  // player, so the export says so and stops, and a spawn over a hole gets the tile the generator put under its feet
  // (2026-10-31, 2026-11-26, the owner)
  if (spawnOutsideMapOf(feet)) {
    throw new Error(
      `The spawn of the level stands outside the map: its feet are at x ${feet.x.toFixed(0)}, z ${feet.z.toFixed(0)}, and the map holds 0 to ${MAP_SIZE}. The game loads the player there, so the level would open without one. Move the spawn back to the map.`,
    )
  }

  const floor = floorsUnderOf(exported, spawnFloorProbeOf(map)).length === 0

  if (floor) {
    const nearest = nearestFaceOf(exported, feet)
    // the tile of a hole takes the placeholder of the generator (the jorge), so the author sees in the game where the
    // floor under the spawn was missing, and the room of the nearest face, so the game draws it at all (a face of no
    // room is not drawn). A level without the placeholder takes the texture around the spawn (2026-11-27, the owner)
    const placeholder = map.textureContainerIdOfName(BLANK_LEVEL_TEXTURE)
    const texture = placeholder ?? nearest?.textureContainerId ?? 0
    const tile = floorTileOf(feet, texture, nearest?.room ?? NO_ROOM)

    // the tile stands under the feet of the player, and it is cut the way the faces of the level are: a spawn near the
    // edge of the map gets half a tile, the part of the square the game has a cell for
    exported.push(...clippedToMapOf([tile]).polygons)
  }

  return { ...clip, floor, polygons: cellOrderedPolygonsOf(exported) }
}

/**
 * What the export writes: the faces and the scene after the split of the texture batches.
 */
export type PreparedExport = {
  /**
   * The scene of the file: its containers, and the copies of the textures the split made.
   */
  readonly fts: ArxFTS
  /**
   * The faces of the archive, in the order the FTS writes them, with the container the split gave them.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The copies of the textures the split made: a file for the archive, and the name the FTS carries for it.
   */
  readonly copies: readonly TextureCopy[]
  /**
   * How many faces the square of the map cut a part of.
   */
  readonly clipped: number
  /**
   * How many faces stood outside the map whole, and are left out.
   */
  readonly dropped: number
  /**
   * Whether the export put a tile under the spawn, because the level had no floor there.
   */
  readonly floor: boolean
}

/**
 * Prepares the faces and the scene of a level for the files of the archive.
 *
 * @remarks
 * The steps of {@link exportLevelFiles} before the files are saved: the faces the level writes (the guards that center
 * the map, the cut at the square of the map, the tile under the spawn) and the split of the texture batches a big level
 * needs (TODO 104). The polygons keep the order of the cells, and only the faces over the limit of a batch take a
 * container of a copy.
 *
 * @param map The level to write.
 * @param options The options of the export: whether the archive centers the map.
 *
 * @returns The scene, the faces and what the map cut of them.
 *
 * @throws When the spawn of the level stands outside the map: the game would open the level without a player.
 */
export function prepareExportOf(map: ArxMap, options: ExportOptions = {}): PreparedExport {
  const exported = exportedPolygonsOf(map, options)
  const split = splitTextureBatchesOf(exported.polygons, map.fts.textureContainers)
  const polygons = exported.polygons.map((polygon, index) => {
    const containerId = split.containerIds[index] ?? polygon.textureContainerId

    if (containerId === polygon.textureContainerId) {
      return polygon
    }

    return { ...polygon, textureContainerId: containerId }
  })

  return {
    fts: { ...map.fts, textureContainers: [...split.containers] },
    polygons,
    copies: split.copies,
    clipped: exported.clipped,
    dropped: exported.dropped,
    floor: exported.floor,
  }
}

export function exportLevelFiles(map: ArxMap, options: ExportOptions = {}): LevelFiles {
  // the portals of a flat level come from its rooms: the file is written with the portals of the rooms it has now, even
  // if the watch of the editor has not run since the last step of the rooms
  syncGeneratedPortals(map)
  // the faces a group hides are not in the level that is written: they are out of the mesh, and the export leaves them
  // out. The polygons go in the order the FTS file writes them: the loader gives the palette its indices in that order
  const prepared = prepareExportOf(map, options)
  const source = prepared.polygons
  const scene = FTS.save(buildExportFts(prepared.fts, source))
  const colors = freshPaletteOf(map, source, options)
  const lighting = LLF.save(buildExportLlf({ ...map.llf, colors }, source, options))
  const description = DLF.save(buildExportDlf(map.dlf, source.length, options.levelIndex))

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
 * @returns The path of the file inside the archive, relative the way a zip path is.
 */
export function levelFilePath(level: number, kind: 'dlf' | 'fts' | 'llf'): string {
  if (kind === 'fts') {
    return `game/graph/levels/level${String(level)}/fast.fts`
  }

  return `graph/levels/level${String(level)}/level${String(level)}.${kind}`
}

/**
 * The names of the rooms the archive writes, from the dialog or from the zip it came from.
 *
 * @param options The values of the dialog.
 *
 * @returns The names by the id the editor shows, or `undefined` when neither names one.
 */
function namesOfExport(options: ExportOptions): Readonly<Record<string, string>> | undefined {
  if (options.roomNames !== undefined) {
    return options.roomNames
  }

  return options.manifest?.roomNames
}

/**
 * The names of the rooms, keyed by the ids the archive writes.
 *
 * @remarks
 * The export renumbers the rooms of a level without the holes (166/5), and the names are keyed by the id: a name has to
 * follow its room, or the archive would name another one. A level whose rooms are already numbered is unchanged, and so
 * are its names.
 *
 * @param names The names of the rooms, by the id the editor shows.
 * @param polygons The polygons of the level.
 *
 * @returns The names by the ids of the file, or `undefined` when the level has no name.
 */
export function renumberedRoomNamesOf(
  names: Readonly<Record<string, string>> | undefined,
  polygons: readonly ArxPolygon[],
): Record<string, string> | undefined {
  if (names === undefined || Object.keys(names).length === 0) {
    return undefined
  }

  const renumbering = roomRenumberingOf(
    polygons.map((polygon) => {
      return polygon.room
    }),
  )
  const renamed: Record<string, string> = {}

  for (const [room, name] of Object.entries(names)) {
    const id = Number.parseInt(room, 10)

    if (!Number.isSafeInteger(id)) {
      continue
    }

    renamed[String(renumbering.get(id) ?? id)] = name
  }

  return renamed
}

/**
 * The build of the editor, without the moment the archive was written.
 */
export type EditorBuild = Omit<ManifestEditor, 'exportedAt'>

/**
 * The build of the editor, as the manifest of an archive carries it.
 *
 * @remarks
 * The name, the version, the commit and the day come from the build (`vite.config.ts`), so the archive says which
 * program wrote its files, and where that program's code lives. A unit test runs outside that build, and then the block
 * says what a source tree can say.
 *
 * @returns The keys of the editor block, without the moment of the export.
 */
function editorBuildOf(): EditorBuild {
  if (typeof EDITOR_INFO === 'undefined') {
    return {
      name: 'arx-fatalis-browser-editor',
      version: 'local',
      commit: 'local',
      builtAt: 'local',
      url: 'https://github.com/arx-tools/arx-fatalis-browser-editor',
    }
  }

  return EDITOR_INFO
}

/**
 * What the manifest of an archive is built from.
 */
export type ExportManifestParts = {
  /**
   * The seed the level of the dialog has, as the text the user typed.
   */
  readonly seed: string | undefined
  /**
   * The author the dialog read, when it has one.
   */
  readonly author: ManifestAuthor | undefined
  /**
   * The page the dialog read, when it has one.
   */
  readonly project: ManifestProject | undefined
  /**
   * The names of the rooms, when the author gave some.
   */
  readonly roomNames: Readonly<Record<string, string>> | undefined
  /**
   * The paths of the files the archive holds, in the order they were written into it.
   */
  readonly files: readonly string[]
  /**
   * The manifest of the zip the level came from, when it came from one.
   */
  readonly metadata: LevelManifest | undefined
  /**
   * The build of the editor that writes the archive.
   */
  readonly editor: EditorBuild
  /**
   * The moment the archive is written, as an ISO timestamp.
   */
  readonly exportedAt: string
}

/**
 * Reads the seed of a manifest: a number when the text is all digits, the text itself otherwise.
 *
 * @param text The seed of the dialog, or the one the base manifest carries.
 *
 * @returns The seed, or `undefined` when there is none.
 */
function seedOf(text: string | number | undefined): number | string | undefined {
  if (typeof text === 'number') {
    return text
  }

  const value = text?.trim() ?? ''

  if (value === '') {
    return undefined
  }

  if (/^\d+$/u.test(value)) {
    return Number.parseInt(value, 10)
  }

  return value
}

/**
 * Builds the manifest of the archive.
 *
 * @remarks
 * The manifest is the base the level generator issues, with the block of the editor written over it:
 *
 * - the keys of the level (seed, name, version, description, author, url) are the ones the archive came with, so a mod
 * that is exported again stays the mod it was, and the seed the dialog shows when the level has none
 * - the block of the editor says which build wrote the archive, and when: one signing key, the editor's
 * - the files are every file the archive holds, the manifest itself excepted, so the list is the content and not a
 * part of it
 *
 * The pose of the camera is not here: it is the state of the editor, and it goes into the settings of the archive.
 *
 * A key that has no value is left out, so the manifest of an archive made from a level of the game says what it knows
 * and nothing else. The seed of the dialog wins over the one of the base: the dialog is the last look at the level.
 *
 * @param parts What the archive holds and what the level is.
 *
 * @returns The manifest, ready to be written as JSON.
 */
export function buildExportManifest(parts: ExportManifestParts): LevelManifest {
  const base = parts.metadata
  const editor: ManifestEditor = { ...parts.editor, exportedAt: parts.exportedAt }

  return {
    seed: seedOf(parts.seed) ?? seedOf(base?.seed),
    name: base?.name,
    version: base?.version,
    description: base?.description,
    author: parts.author ?? base?.author,
    project: parts.project ?? base?.project,
    roomNames: parts.roomNames ?? base?.roomNames,
    editor,
    files: [...parts.files],
  }
}

/**
 * Writes the level the map was built from under the folder of the editor.
 *
 * @remarks
 * The paths are the ones of the installed game, the same the result goes under, without the leading slash of the writer
 * of the level paths: the reader of the archive matches the files by their names, and a source that sits beside a result
 * of the same name is told apart by the folder it is in.
 *
 * @param map The map to write the source of.
 * @param archive The archive to write into.
 *
 * @returns The paths it wrote, for the list of the files of the archive.
 */
function writeSource(map: ArxMap, archive: JSZip): string[] {
  const level = map.dlf.header.levelIdx
  const written: string[] = []

  for (const kind of ['fts', 'dlf', 'llf'] as const) {
    const path = `${SOURCE_FOLDER}${levelFilePath(level, kind)}`

    archive.file(path, map.source[kind])
    written.push(path)
  }

  return written
}

/**
 * Writes the textures of the archive beside the level files.
 *
 * @param archive The zip the level is written into.
 * @param textures The textures the archive carries, when the level has ones the game does not.
 * @param written The list of the paths the archive holds, which the manifest lists.
 */
function writeTexturesOf(archive: JSZip, textures: readonly ExportTexture[] | undefined, written: string[]): void {
  for (const texture of textures ?? []) {
    archive.file(texture.path, texture.bytes)
    written.push(texture.path)
  }
}

/**
 * Reads the files of the copies the split of the texture batches made.
 *
 * @remarks
 * A copy is a file of the archive of its own: the bytes are the ones of the texture the level has, and the name is the
 * stem of the copy with the extension of the file the bytes came from. The game looks a texture up by its stem and tries
 * the image extensions (`TextureContainer::LoadFile`), so the name of the FTS (`[stone]_wall1~2.bmp`) and the file of
 * the archive (`[stone]_wall1~2.jpg`) may differ in the extension, and the file is the one that decides how the bytes
 * are read.
 *
 * @param copies The copies the split made.
 * @param read The reader of the bytes, when the page has one.
 *
 * @returns The files of the archive, and the names of the copies no source of the editor had.
 */
async function textureCopiesOf(
  copies: readonly TextureCopy[],
  read: TextureCopyReader | undefined,
): Promise<{ readonly textures: readonly ExportTexture[]; readonly uncopied: readonly string[] }> {
  const textures: ExportTexture[] = []
  const uncopied: string[] = []

  for (const copy of copies) {
    let file: { readonly bytes: ArrayBuffer; readonly extension: string } | undefined

    if (read !== undefined) {
      file = await read(copy.from)
    }

    if (file === undefined) {
      uncopied.push(copy.name)

      continue
    }

    textures.push({ path: `${TEXTURE_FOLDER}/${textureStemOf(copy.name)}${file.extension}`, bytes: file.bytes })
  }

  return { textures, uncopied }
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
): Promise<{
  readonly name: string
  readonly data: ArrayBuffer
  readonly textures: number
  /**
   * How many copies of textures the split of the batches of the level made (TODO 104).
   */
  readonly copies: number
  /**
   * The names of the copies the archive does not carry, because no source of the editor had their bytes.
   */
  readonly uncopied: readonly string[]
  /**
   * How many faces the square of the map cut a part of.
   */
  readonly clipped: number
  /**
   * How many faces stood outside the map whole, and are left out.
   */
  readonly dropped: number
  /**
   * Whether the export put a tile under the spawn, because the level had no floor there.
   */
  readonly floor: boolean
}> {
  // the portals of a flat level come from its rooms: the file is written with the portals of the rooms it has now
  syncGeneratedPortals(map)
  // the faces a group hides are not in the level that is written: they are out of the mesh, and the export leaves them
  // out. The polygons go in the order the FTS file writes them: the loader gives the palette its indices in that order
  const prepared = prepareExportOf(map, options)
  const source = prepared.polygons

  onProgress?.(EXPORT_PROGRESS.start)
  await nextPaint()

  // the scene: the file itself, then the compressed body (the long step)
  const scene = FTS.save(buildExportFts(prepared.fts, source))

  onProgress?.(EXPORT_PROGRESS.sceneBuilt)
  await nextPaint()

  const fts = packLevelFile(scene, getHeaderSize(scene, 'fts').total)

  onProgress?.(EXPORT_PROGRESS.scenePacked)
  await nextPaint()

  // the lighting: the palette is baked again from the scene the files hold, then the whole file compressed
  const colors = await freshPaletteInChunksOf(map, source, options)
  const llf = packWholeFile(LLF.save(buildExportLlf({ ...map.llf, colors }, source, options)))

  onProgress?.(EXPORT_PROGRESS.lightingPacked)
  await nextPaint()

  // the index of the level: the one the user gave in the dialog, or the one it was opened with
  const levelIndex = options.levelIndex ?? map.dlf.header.levelIdx

  // the description: the entities of the level, the count of the polygons it names and the index it takes
  const description = DLF.save(buildExportDlf(map.dlf, source.length, levelIndex))
  const dlf = packLevelFile(description, getHeaderSize(description, 'dlf').total)

  onProgress?.(EXPORT_PROGRESS.descriptionPacked)
  await nextPaint()

  const archive = new JSZip()

  // the files the archive holds, in the order they are written: the manifest lists all of them, so a file that joins the
  // archive later is in the list without a change here
  const written = [levelFilePath(levelIndex, 'fts'), levelFilePath(levelIndex, 'dlf'), levelFilePath(levelIndex, 'llf')]

  archive.file(written[0], fts)
  archive.file(written[1], dlf)
  archive.file(written[2], llf)

  // the textures go beside the level files, under the folder of the game, so a level of a mod is complete on its own.
  // The copies the split made of a texture of the level go with them: the game knows the level's file, not the copy
  const copies = await textureCopiesOf(prepared.copies, options.readTextureFile)

  writeTexturesOf(archive, options.textures, written)
  writeTexturesOf(archive, copies.textures, written)

  // the state of the editor: the pose of the camera, which is not the spawn of the level, and the steps of the level when
  // it has some. A level with steps is also a save of itself: the steps are indices of the level they were made on, so
  // that level goes beside the result, and only with them (the two are read together, or neither is)
  const steps = options.history?.records ?? []
  let stepsOfTheArchive: { fingerprint: string; records: typeof steps; position: number } | undefined

  if (steps.length > 0) {
    stepsOfTheArchive = { fingerprint: map.fingerprint, records: steps, position: options.history?.position ?? 0 }
  }

  const settings = { camera: options.camera, history: stepsOfTheArchive }

  // the settings carry the steps of the level when the archive has them, and a big import is hundreds of megabytes of
  // JSON: the archive writes it without the indentation, the editor is the only reader of it (2026-11-28, the owner)
  archive.file(SETTINGS_PATH, JSON.stringify(editorSettingsJsonOf(settings)))
  written.push(SETTINGS_PATH)

  // the metadata of the editor, in files of their own: a reader finds the names and the groups without the manifest, and
  // the manifest keeps the room names too for the readers of an older build
  const roomNames = renumberedRoomNamesOf(namesOfExport(options), map.polygons)

  archive.file(EDITOR_ROOMS_PATH, JSON.stringify(editorRoomsJsonOf(roomNames), undefined, 2))
  written.push(EDITOR_ROOMS_PATH)
  archive.file(EDITOR_GROUPS_PATH, JSON.stringify(editorGroupsJsonOf(options.groups), undefined, 2))
  written.push(EDITOR_GROUPS_PATH)

  if (steps.length > 0) {
    written.push(...writeSource(map, archive))
  }

  const manifest = buildExportManifest({
    seed: options.seed,
    files: written,
    metadata: options.manifest,
    author: options.author,
    project: options.project,
    roomNames,
    editor: editorBuildOf(),
    exportedAt: options.exportedAt ?? new Date().toISOString(),
  })

  archive.file(MANIFEST_NAME, JSON.stringify(manifest, undefined, 2))

  const data = await archive.generateAsync({ type: 'arraybuffer' })

  onProgress?.(EXPORT_PROGRESS.zipped)

  return {
    name: exportZipNameOf(new Date(options.exportedAt ?? Date.now())),
    data,
    textures: (options.textures?.length ?? 0) + copies.textures.length,
    copies: copies.textures.length,
    uncopied: copies.uncopied,
    clipped: prepared.clipped,
    dropped: prepared.dropped,
    floor: prepared.floor,
  }
}
