import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLLF } from 'arx-convert/types'
import { getHeaderSize } from 'arx-header-size'
import { BLANK_LEVEL_TEXTURE } from '../../../generator/assets.ts'
import type { LevelFiles } from './source/levelSource.ts'
import { packLevelFile, packWholeFile } from './source/packedFile.ts'

/**
 * The index a blank level carries, and the level the game starts a new quest on.
 *
 * @remarks
 * A map that is made from nothing is the map of a new quest, so it takes the level the game opens first (2026-11-06, the
 * owner's request: a blank map was the level 0, which the game never loads by itself). The export dialog offers the same
 * index for an empty field, and says how to make the game load the map at the start of a quest.
 */
export const NEW_QUEST_LEVEL_INDEX = 1

/**
 * The side of one tile of a blank level, in game units.
 *
 * @remarks
 * The blank level is the one the Arx Level Generator starts from, and what a level needs to be walkable: a floor
 * under the feet of the player. Everything else (walls, textures, lights) is built in the editor.
 */
export const BLANK_LEVEL_TILE_SIZE = 100

/**
 * How a level made from nothing starts: how many tiles its floor has on a side.
 *
 * @remarks
 * Two of them are planned. `Minimal` is the one of the Arx Level Generator: a single tile, which is the smallest
 * floor the game shows something on. `Flat` gives an 11×11 plane of tiles (a 1100×1100 square), which is more to
 * walk on and to build at — a level starts with a place, not with a dot.
 *
 * The name is what a picker shows, and the shape is only the floor: the rest of a new level is the same in both.
 */
export interface NewLevelPreset {
  /**
   * What the picker shows: `Minimal`, `Flat`.
   */
  readonly name: string
  /**
   * How many tiles of {@link BLANK_LEVEL_TILE_SIZE} the floor has on a side.
   */
  readonly tiles: number
}

/**
 * The smallest floor the game shows something on: a single tile, which is what the Arx Level Generator starts with.
 */
export const MINIMAL_PRESET: NewLevelPreset = { name: 'Minimal', tiles: 1 }

/**
 * A floor of 11×11 tiles (a 1100×1100 square): more to walk on and to build at.
 */
export const FLAT_PRESET: NewLevelPreset = { name: 'Flat', tiles: 11 }

/**
 * The ways a new level can start, in the order a picker shows them.
 */
export const NEW_LEVEL_PRESETS: readonly NewLevelPreset[] = [MINIMAL_PRESET, FLAT_PRESET]

/**
 * The preset a new level starts with.
 */
const DEFAULT_NEW_LEVEL_PRESET: NewLevelPreset = MINIMAL_PRESET

/**
 * The texture of the floor: the generator's own one, the same the Arx Level Generator puts under a new map.
 *
 * @remarks
 * The original levels name their textures with the id the game derives from the file name, but a level that brings
 * its own files numbers its containers from 1 (which is what the generator does), so the id here is simply the first
 * one. The texture round (TODO 11) will load {@link GENERATOR_ASSETS} and let the level pick another texture.
 */
const FLOOR_TEXTURE = { id: 1, filename: BLANK_LEVEL_TEXTURE }

/**
 * How high the player stands above the floor of a blank level.
 *
 * @remarks
 * The game's Y axis points **down**, so the eye of the player is 180 units below the floor's 0 (the renderer mirrors
 * the axis, so the camera stands above the floor). The number is the Arx Level Generator's `heightOfThePlayer`, which
 * lifts a new level's player for the same reason ("so that he doesn't sink into the floor").
 */
const PLAYER_HEIGHT = 180

/**
 * Where the player of a blank level stands, whatever the size of its floor: the middle, above it.
 *
 * @remarks
 * The position of the player is stored **relative to the scene position** (like in the original levels), and the
 * scene sits in the middle of the floor, so the middle of the floor is `0` from it — the camera form shows the sum,
 * which is the middle of the floor in the level's own coordinates.
 */
const PLAYER = { position: { x: 0, y: -PLAYER_HEIGHT, z: 0 }, orientation: { a: 0, b: 180, g: 0 } }

/**
 * The size of the cell grid of the FTS: the polygons of an Arx level are sorted into a 160×160 grid of cells.
 *
 * @see https://github.com/arx/ArxLibertatis/blob/1.2.1/src/graphics/data/FastSceneFormat.h
 */
const CELL_COUNT = 160 * 160

/**
 * Builds one tile of the floor of a blank level.
 *
 * @param tileX Which tile it is on the X axis, from 0.
 * @param tileZ Which tile it is on the Z axis, from 0.
 *
 * @returns The polygon of that tile, with its corners one tile apart.
 */
function blankTile(tileX: number, tileZ: number): ArxFTS['polygons'][number] {
  const left = tileX * BLANK_LEVEL_TILE_SIZE
  const right = left + BLANK_LEVEL_TILE_SIZE
  const near = tileZ * BLANK_LEVEL_TILE_SIZE
  const far = near + BLANK_LEVEL_TILE_SIZE

  return {
    // the four corners of a quad are not a loop: `a` and `b` are the two ends of one edge of it and `c` and `d` the
    // two ends of the opposite one, so the perimeter is a, b, d, c. The shape to keep in mind is the cyrillic `и`:
    // the left stroke is the 0-1 edge, the right one the 2-3 edge. The renderer walks the quad this way (two
    // triangles, `a,b,c` and `c,b,d`), and writing the corners as a loop makes the second triangle turn backwards
    // and the back side culling drops it.
    vertices: [
      { x: left, y: 0, z: near, u: 0, v: 0, llfColorIdx: 0 },
      { x: right, y: 0, z: near, u: 1, v: 0, llfColorIdx: 0 },
      { x: left, y: 0, z: far, u: 0, v: 1, llfColorIdx: 0 },
      { x: right, y: 0, z: far, u: 1, v: 1, llfColorIdx: 0 },
    ],
    textureContainerId: FLOOR_TEXTURE.id,
    // the game's Y axis points down, so a floor's normal is -1 on it: the renderer mirrors the axis, and an upward
    // normal here would light the floor from below (which is black in a lit material)
    norm: { x: 0, y: -1, z: 0 },
    norm2: { x: 0, y: -1, z: 0 },
    normals: [
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
    ],
    transval: 0,
    area: BLANK_LEVEL_TILE_SIZE * BLANK_LEVEL_TILE_SIZE,
    flags: 64,
    // the Arx Level Generator puts every polygon of a new level into room 1, and an empty room 0 stays reserved
    room: 1,
  }
}

/**
 * The side of the floor of a preset, in game units.
 *
 * @param preset The preset of the new level.
 *
 * @returns The size of the square the tiles cover.
 */
function floorSizeOf(preset: NewLevelPreset): number {
  return preset.tiles * BLANK_LEVEL_TILE_SIZE
}

/**
 * The scene of a blank level.
 *
 * @param preset The preset of the new level: how many tiles the floor has on a side.
 *
 * @returns The FTS of the tiles.
 */
function blankScene(preset: NewLevelPreset): ArxFTS {
  const size = floorSizeOf(preset)
  const middle = size / 2
  const polygons: ArxFTS['polygons'] = []

  for (let tileZ = 0; tileZ < preset.tiles; tileZ = tileZ + 1) {
    for (let tileX = 0; tileX < preset.tiles; tileX = tileX + 1) {
      polygons.push(blankTile(tileX, tileZ))
    }
  }

  return {
    header: { levelIdx: NEW_QUEST_LEVEL_INDEX, mScenePosition: { x: middle, y: 0, z: middle } },
    textureContainers: [FLOOR_TEXTURE],
    polygons,
    // every cell of the grid has to be in the file, an empty one carries no polygon and no anchor
    cells: Array.from({ length: CELL_COUNT }, () => {
      return { polygons: [], anchors: [] }
    }),
    anchors: [],
    portals: [],
    // the rooms are one indexed in the file: room 0 is reserved for the outside, so the one room of the quad is room
    // 1, and a level needs two room entries for it (the number in the header is the highest id). The generator makes
    // the same two rooms with the same four distances when it puts a new map's polygons into room 1.
    rooms: [
      { portals: [], polygons: [] },
      { portals: [], polygons: [] },
    ],
    roomDistances: [
      { distance: -1, startPosition: { x: 0, y: 0, z: 0 }, endPosition: { x: 1, y: 0, z: 0 } },
      { distance: -1, startPosition: { x: 0, y: 0, z: 0 }, endPosition: { x: 0, y: 1, z: 0 } },
      { distance: -1, startPosition: { x: 0.984_375, y: 0.984_375, z: 0 }, endPosition: { x: 0, y: 0, z: 0 } },
      { distance: -1, startPosition: { x: 0, y: 0, z: 0 }, endPosition: { x: 0, y: 0, z: 0 } },
    ],
  }
}

/**
 * The description of a blank level: no interactive objects, no fog, no zone and no path.
 *
 * @param preset The preset of the new level: its floor says how many polygons the level has.
 *
 * @returns The DLF of the floor.
 */
function blankDescription(preset: NewLevelPreset): ArxDLF {
  return {
    header: {
      lastModifiedBy: 'arx-fatalis-browser-editor',
      lastModifiedAt: 0,
      player: PLAYER,
      numberOfPolygonsInFTS: preset.tiles * preset.tiles,
      levelIdx: NEW_QUEST_LEVEL_INDEX,
    },
    interactiveObjects: [],
    fogs: [],
    paths: [],
    zones: [],
  }
}

/**
 * The lighting of a blank level: it has none yet, the lighting round brings the first lamp.
 *
 * @param preset The preset of the new level: its floor says how many polygons the level has.
 *
 * @returns The LLF with no light.
 */
function blankLighting(preset: NewLevelPreset): ArxLLF {
  return {
    header: {
      lastModifiedBy: 'arx-fatalis-browser-editor',
      lastModifiedAt: 0,
      numberOfPolygonsInFTS: preset.tiles * preset.tiles,
    },
    lights: [],
    colors: [],
  }
}

/**
 * Builds the three packed files of a blank level: a floor of tiles under the feet of the player.
 *
 * @remarks
 * It is the level of the editor when there is nothing to open (no level id in the url, the level of the url does
 * not load, or the user asked for a new one). The floor is walkable and editable, and nothing else is in the file:
 * no wall, no light, no anchor, no portal, no interactive object.
 *
 * @param preset How the floor starts: one tile, or an 11×11 plane of them.
 *
 * @returns The three packed files, in the shape every level source gives.
 */
export function createBlankLevelFiles(preset: NewLevelPreset = DEFAULT_NEW_LEVEL_PRESET): LevelFiles {
  const description = DLF.save(blankDescription(preset))
  const scene = FTS.save(blankScene(preset))
  const lighting = LLF.save(blankLighting(preset))

  // the header of a file is read from the file itself: the scene carries a unique header per texture container (the
  // blank one has none), and the lighting has no header at all
  return {
    dlf: packLevelFile(description, getHeaderSize(description, 'dlf').total),
    fts: packLevelFile(scene, getHeaderSize(scene, 'fts').total),
    llf: packWholeFile(lighting),
  }
}
