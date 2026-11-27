import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import { MAP_LIMIT } from '../../../../generator/clipToMap.ts'
import { polygonFillTriangles } from '../../../../generator/polygons.ts'
import { PLAYER_EYE_HEIGHT, type SpawnOwner } from './playerSpawn.ts'

/**
 * How far under the eye of the player the floor of the spawn is looked for.
 *
 * @remarks
 * The DLF keeps the **eye** of the player, and the Y of the game points down: the feet are {@link PLAYER_EYE_HEIGHT} below
 * it, and the Arx Level Generator looked for the floor ten units under them (180 from the eye). The probe stands there,
 * so a floor a unit or two under the feet is still the floor the player stands on (2026-10-31, the owner).
 */
export const SPAWN_FLOOR_PROBE = 180

/**
 * How far the Y of a face may stand from the floor of the spawn and still be the floor under it.
 *
 * @remarks
 * The floor of a level is a handful of units under the feet of its spawn, and the faces of a ceiling stand a level above
 * it: the probe reads every face that covers the point on the X and the Z, and this is what tells the two apart.
 */
export const SPAWN_FLOOR_TOLERANCE = 100

/**
 * The side of the tile that stands under a spawn without a floor, in the units of the game.
 */
export const SPAWN_FLOOR_SIZE = 100

/**
 * A point of the level, in the coordinates of the game.
 */
export type SpawnPoint = {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Reads which side of an edge of the level a point stands on, on the X and the Z of the game.
 *
 * @param point The point to read.
 * @param from The first end of the edge.
 * @param to The other end of it.
 *
 * @returns The sign of the side: a positive number on one side of the edge, a negative one on the other.
 */
function sideOf(point: SpawnPoint, from: SpawnPoint, to: SpawnPoint): number {
  const acrossX = to.x - from.x
  const acrossZ = to.z - from.z
  const alongX = point.z - from.z
  const alongZ = point.x - from.x
  const first = acrossX * alongX
  const second = acrossZ * alongZ

  return first - second
}

/**
 * Tells whether a point of the level is in a triangle of it, read on the X and the Z.
 *
 * @remarks
 * The signs of the three edges tell it: a point inside the triangle stands on the same side of every edge, and the plane
 * of the level is the X and the Z of the game (a floor is a flat face, so the projection keeps the shape of it). A point
 * on an edge counts as inside: the spawn on the very edge of a face stands on the level.
 *
 * @param point The point of the probe.
 * @param first The first corner of the triangle.
 * @param second The second corner of it.
 * @param third The third one.
 *
 * @returns True when the point stands in the triangle.
 */
function isInTriangleOf(point: SpawnPoint, first: SpawnPoint, second: SpawnPoint, third: SpawnPoint): boolean {
  const firstSide = sideOf(point, first, second)
  const secondSide = sideOf(point, second, third)
  const thirdSide = sideOf(point, third, first)
  const hasNegative = firstSide < 0 || secondSide < 0 || thirdSide < 0
  const hasPositive = firstSide > 0 || secondSide > 0 || thirdSide > 0

  return !(hasNegative && hasPositive)
}

/**
 * Reads the point under the spawn the floor is looked for, in the coordinates of the level.
 *
 * @remarks
 * The player of the DLF stores the eye from the **scene position** of the level: the polygons of the mesh stand at the
 * scene position too, so the two are added here, and the point of the probe is the one of the game (2026-10-31, the
 * owner: the spawn is `player.position + scenePosition`, a hundred and eighty under the eye).
 *
 * @param map The level to read.
 *
 * @returns The point under the spawn, where the floor of the level has to be.
 */
export function spawnFloorProbeOf(map: SpawnOwner & { readonly scenePosition: ArxVector3 }): SpawnPoint {
  const { position } = map.player
  const scene = map.scenePosition

  return {
    x: position.x + scene.x,
    y: position.y + scene.y + SPAWN_FLOOR_PROBE,
    z: position.z + scene.z,
  }
}

/**
 * Reads the feet of the spawn, in the coordinates of the level.
 *
 * @param map The level to read.
 *
 * @returns The point the player stands on.
 */
export function spawnFeetOf(map: SpawnOwner & { readonly scenePosition: ArxVector3 }): SpawnPoint {
  const { position } = map.player
  const scene = map.scenePosition

  return { x: position.x + scene.x, y: position.y + scene.y + PLAYER_EYE_HEIGHT, z: position.z + scene.z }
}

/**
 * Tells whether the spawn stands outside the square of the map.
 *
 * @remarks
 * A level of the game is a grid of 160 cells of a hundred units: a spawn outside of it has no cell to stand in, and the
 * game loads the level without the player (or not at all). The export says so and stops, instead of writing a level the
 * game can not open on its spawn (2026-10-31, the owner).
 *
 * @param point The feet of the spawn, in the coordinates of the level.
 *
 * @returns True when the player would stand off the level.
 */
export function spawnOutsideMapOf(point: SpawnPoint): boolean {
  return point.x < 0 || point.x > MAP_LIMIT || point.z < 0 || point.z > MAP_LIMIT
}

/**
 * Tells whether a face is the floor under a point of the level.
 *
 * @param polygon The face to read.
 * @param point The point of the probe.
 *
 * @returns True when the point stands on the face, within the tolerance of its Y.
 */
export function isFloorUnderOf(polygon: ArxPolygon, point: SpawnPoint): boolean {
  const corners = polygon.vertices.map((vertex) => {
    return { x: vertex.x, y: vertex.y, z: vertex.z }
  })

  if (corners.length === 0) {
    return false
  }

  const sum = corners.reduce((total, corner) => {
    return total + corner.y
  }, 0)
  const middle = sum / corners.length
  const distance = middle - point.y

  if (Math.abs(distance) > SPAWN_FLOOR_TOLERANCE) {
    return false
  }

  // the point is on the face when it is in one of the triangles the renderer draws, in the X and the Z of the level
  for (const [a, b, c] of polygonFillTriangles(polygon)) {
    const first = corners[a]
    const second = corners[b]
    const third = corners[c]

    if (first === undefined || second === undefined || third === undefined) {
      continue
    }

    if (isInTriangleOf(point, first, second, third)) {
      return true
    }
  }

  return false
}

/**
 * Reads the faces of a level that are the floor under a point of it.
 *
 * @param polygons The faces of the level.
 * @param point The point of the probe.
 *
 * @returns The faces under the point; empty when the level has a hole there.
 */
export function floorsUnderOf(polygons: readonly ArxPolygon[], point: SpawnPoint): ArxPolygon[] {
  return polygons.filter((polygon) => {
    return isFloorUnderOf(polygon, point)
  })
}

/**
 * Reads the face of a level that stands the nearest to a point of it, on the X and the Z.
 *
 * @remarks
 * The tile that fills a hole under the spawn takes the texture and the room of the nearest face, so the floor it makes
 * looks like the floor around it, and the game draws it in a room (a face of no room is not drawn at all).
 *
 * @param polygons The faces of the level.
 * @param point The point of the probe.
 *
 * @returns The nearest face, or undefined when the level has no face.
 */
export function nearestFaceOf(polygons: readonly ArxPolygon[], point: SpawnPoint): ArxPolygon | undefined {
  let nearest: ArxPolygon | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) {
      const distance = Math.hypot(vertex.x - point.x, vertex.z - point.z)

      if (distance < nearestDistance) {
        nearest = polygon
        nearestDistance = distance
      }
    }
  }

  return nearest
}

/**
 * Builds the tile that stands under a spawn without a floor.
 *
 * @remarks
 * The tile is the one the Arx Level Generator put under the feet of the player (`addTileUnderThePlayersFeet`), a hundred
 * units of the level with the texture of the face around it. The corners are written the way the renderer walks a quad
 * (the cyrillic `и`: the 0-1 edge and the 2-3 edge, so the perimeter is a, b, d, c), and the normal points down, the way
 * a floor of the game does (2026-10-31, the owner).
 *
 * @param feet The point the player stands on.
 * @param textureContainerId The texture of the floor around the spawn.
 * @param room The room of the floor around the spawn.
 *
 * @returns The tile, a face of four corners.
 */
export function floorTileOf(feet: SpawnPoint, textureContainerId: number, room: number): ArxPolygon {
  const half = SPAWN_FLOOR_SIZE / 2
  const left = feet.x - half
  const right = feet.x + half
  const near = feet.z - half
  const far = feet.z + half
  const down = { x: 0, y: -1, z: 0 }

  return {
    vertices: [
      { x: left, y: feet.y, z: near, u: 0, v: 0, llfColorIdx: 0 },
      { x: right, y: feet.y, z: near, u: 1, v: 0, llfColorIdx: 0 },
      { x: left, y: feet.y, z: far, u: 0, v: 1, llfColorIdx: 0 },
      { x: right, y: feet.y, z: far, u: 1, v: 1, llfColorIdx: 0 },
    ],
    textureContainerId,
    norm: { ...down },
    norm2: { ...down },
    normals: [{ ...down }, { ...down }, { ...down }, { ...down }],
    transval: 0,
    area: SPAWN_FLOOR_SIZE * SPAWN_FLOOR_SIZE,
    flags: ArxPolygonFlags.Quad,
    room,
  }
}
