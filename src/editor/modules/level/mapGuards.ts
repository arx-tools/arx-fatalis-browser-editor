import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { NO_ROOM } from '../rooms/roomList.ts'

/**
 * Where the far guard of the map stands, in the coordinates of the game.
 *
 * @remarks
 * The map of the game reads the arrow of the player from the **lowest** corner of the level on the X axis and the
 * **highest** one on the Z axis (`MiniMap.cpp`, `computePlayerPos`: `x` from `m_ratio`, the min, and `y` from
 * `m_mapMaxY`, the max), against the 16000 units of the map. A level of a few hundred units therefore sits in a corner
 * of the sheet whatever its origin is (2026-11-27, the owner: the origin at 6000/0/6000 put the level into the left top
 * corner).
 *
 * A hundred units of the guard end exactly here, which is the 3/4 of the map: the arrow of a level at 6000 stands
 * `(6000 - 0) / 16000` from the left and `(12000 - 6000) / 16000` from the top, the same 37.5 percent both ways.
 */
export const MAP_GUARD_FAR = 12_000

/**
 * The side of a guard, in the units of the level.
 *
 * @remarks
 * One cell of the FTS grid, the same size as the tile the Arx Level Generator puts under the feet of the player when a
 * map has no polygons at all.
 */
export const MAP_GUARD_SIZE = 100

/**
 * Where the guards stand: the lowest corner of the map on both axes, and the far one the map reads its height from.
 */
export const MAP_GUARD_CORNERS: ReadonlyArray<{ readonly x: number; readonly z: number }> = [
  { x: 0, z: 0 },
  { x: MAP_GUARD_FAR - MAP_GUARD_SIZE, z: MAP_GUARD_FAR - MAP_GUARD_SIZE },
]

/**
 * Builds one guard: a flat quad of the size of {@link MAP_GUARD_SIZE}, in no room.
 *
 * @param left The X of its near left corner, in the coordinates of the level.
 * @param near The Z of its near left corner.
 * @param textureContainerId The container the quad draws with.
 *
 * @returns The quad that stands there, in no room.
 */
function guardPolygonAt(left: number, near: number, textureContainerId: number): ArxPolygon {
  const right = left + MAP_GUARD_SIZE
  const far = near + MAP_GUARD_SIZE
  // the game's Y axis points down, so a floor's normal is -1 on it (the renderer mirrors the axis)
  const down = { x: 0, y: -1, z: 0 }

  return {
    // the corners are the ones of a game quad: `a` and `b` are one edge, `c` and `d` the opposite one (the perimeter is
    // a, b, d, c), which keeps the winding of the two triangles the renderer makes of it
    vertices: [
      { x: left, y: 0, z: near, u: 0, v: 0, llfColorIdx: 0 },
      { x: right, y: 0, z: near, u: 1, v: 0, llfColorIdx: 1 },
      { x: left, y: 0, z: far, u: 0, v: 1, llfColorIdx: 2 },
      { x: right, y: 0, z: far, u: 1, v: 1, llfColorIdx: 3 },
    ],
    textureContainerId,
    norm: { ...down },
    norm2: { ...down },
    normals: [{ ...down }, { ...down }, { ...down }, { ...down }],
    transval: 0,
    area: MAP_GUARD_SIZE * MAP_GUARD_SIZE,
    flags: ArxPolygonFlags.Quad,
    room: NO_ROOM,
  }
}

/**
 * Builds the guards of the map both of them.
 *
 * @param textureContainerId The container the quads draw with.
 *
 * @returns The two guard polygons, at the two corners of the map.
 */
export function guardPolygonsOf(textureContainerId: number): ArxPolygon[] {
  return MAP_GUARD_CORNERS.map((corner) => {
    return guardPolygonAt(corner.x, corner.z, textureContainerId)
  })
}
