import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { polygonFillTriangles } from './polygons.ts'

/**
 * How far a corner of a face may stand from the origin of the map, in the units of the game.
 *
 * @remarks
 * The scene of a level is a grid of 160 cells of a hundred units on a side, and the cell of a face is the average of its
 * first three corners divided by a hundred (`getCellCoords`): a corner at 16000 falls into the cell 160, which the grid
 * does not have. The clip keeps the faces under this, a unit short of the edge of the map, which is the bound the Arx
 * Level Generator used (`isBetween(0, 15999, …)`).
 */
export const MAP_LIMIT = 15_999

/**
 * A corner of a face, with the normal it carries.
 *
 * @remarks
 * The clip works on this copy and not on the face of the level: the faces the archive holds are new ones, and the level of
 * the editor stays the way the author left it (2026-11-27, the owner: the out of bounds faces are cut at the export).
 */
type ClipCorner = {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly u: number
  readonly v: number
  readonly normal: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * One side of the square of the map a triangle is cut against.
 */
type ClipBound = {
  /**
   * The axis the bound is on: the clip keeps the face over the X and the Z of the map, and the Y is not touched.
   */
  readonly axis: 'x' | 'z'
  /**
   * Where the bound stands on that axis.
   */
  readonly limit: number
  /**
   * Whether the side inside the map is the one over the limit (`x >= 0`) or under it (`x <= 15999`).
   */
  readonly over: boolean
}

/**
 * The four sides of the square of the map: the faces are cut at the two ends of the X and the Z.
 */
const MAP_BOUNDS: readonly ClipBound[] = [
  { axis: 'x', limit: 0, over: true },
  { axis: 'x', limit: MAP_LIMIT, over: false },
  { axis: 'z', limit: 0, over: true },
  { axis: 'z', limit: MAP_LIMIT, over: false },
]

/**
 * What the clip did to the faces of a level.
 */
export type MapClip = {
  /**
   * The faces of the archive: the ones of the level, and the pieces of the ones the map cut.
   */
  readonly polygons: ArxPolygon[]
  /**
   * How many faces lost a part of themselves.
   */
  readonly clipped: number
  /**
   * How many faces went away whole (they stood outside the map).
   */
  readonly dropped: number
}

/**
 * Reads a value between two numbers.
 *
 * @param from The value at the first end.
 * @param to The value at the other end.
 * @param t How far the point stands from the first end, from 0 to 1.
 *
 * @returns The value at the point.
 */
function lerpOf(from: number, to: number, t: number): number {
  const span = to - from
  const part = span * t

  return from + part
}

/**
 * Reads the corners of a face, with the normal of each.
 *
 * @param polygon The face to read.
 *
 * @returns The corners of the shape: three for a triangle, four for a quad.
 */
function cornersOf(polygon: ArxPolygon): ClipCorner[] {
  const normals = polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]
  let count = 3

  if (isQuad(polygon)) {
    count = 4
  }

  const corners: ClipCorner[] = []

  for (let index = 0; index < count; index = index + 1) {
    const vertex = polygon.vertices[index]

    if (vertex === undefined) {
      continue
    }

    corners.push({
      x: vertex.x,
      y: vertex.y,
      z: vertex.z,
      u: vertex.u,
      v: vertex.v,
      normal: normals[index] ?? polygon.norm,
    })
  }

  return corners
}

/**
 * Reads the place of a corner on one axis of the map.
 *
 * @param corner The corner to read.
 * @param axis The axis to read it on.
 *
 * @returns The X or the Z of the corner.
 */
function placeOf(corner: ClipCorner, axis: 'x' | 'z'): number {
  if (axis === 'x') {
    return corner.x
  }

  return corner.z
}

/**
 * Tells whether a corner stands inside the square of the map.
 *
 * @param corner The corner to read.
 * @param bound The side to read it against.
 *
 * @returns True when the corner is on the side of the map.
 */
function isInside(corner: ClipCorner, bound: ClipBound): boolean {
  const { axis, limit, over } = bound
  const value = placeOf(corner, axis)

  if (over) {
    return value >= limit
  }

  return value <= limit
}

/**
 * Reads the corner where the edge of two corners meets a side of the map, the uv and the normal with it.
 *
 * @param from The corner inside the map.
 * @param to The corner outside it.
 * @param t How far the meeting point stands from the first corner, from 0 to 1.
 *
 * @returns The corner of the meeting point.
 */
function meetingOf(from: ClipCorner, to: ClipCorner, t: number): ClipCorner {
  const normal = {
    x: lerpOf(from.normal.x, to.normal.x, t),
    y: lerpOf(from.normal.y, to.normal.y, t),
    z: lerpOf(from.normal.z, to.normal.z, t),
  }
  const length = Math.hypot(normal.x, normal.y, normal.z)

  if (length > 0) {
    normal.x = normal.x / length
    normal.y = normal.y / length
    normal.z = normal.z / length
  }

  return {
    x: lerpOf(from.x, to.x, t),
    y: lerpOf(from.y, to.y, t),
    z: lerpOf(from.z, to.z, t),
    u: lerpOf(from.u, to.u, t),
    v: lerpOf(from.v, to.v, t),
    normal,
  }
}

/**
 * Cuts a shape against one side of the map, the Sutherland–Hodgman way.
 *
 * @param corners The corners of the shape, around it.
 * @param bound The side to cut against.
 *
 * @returns The corners of the shape that is inside the side, around it.
 */
function clipAgainst(corners: readonly ClipCorner[], bound: ClipBound): ClipCorner[] {
  const result: ClipCorner[] = []
  const { length } = corners
  const { axis, limit } = bound

  for (let index = 0; index < length; index = index + 1) {
    const from = corners[index]
    const to = corners[(index + 1) % length]

    if (from === undefined || to === undefined) {
      continue
    }

    const fromInside = isInside(from, bound)
    const toInside = isInside(to, bound)

    if (fromInside) {
      result.push(from)
    }

    if (fromInside === toInside) {
      continue
    }

    const span = placeOf(to, axis) - placeOf(from, axis)

    if (Math.abs(span) < 1e-9) {
      continue
    }

    result.push(meetingOf(from, to, (limit - placeOf(from, axis)) / span))
  }

  return result
}

/**
 * Reads the difference of two products, so a cross product stays one product per line.
 *
 * @param first The product that is taken from.
 * @param second The product that is taken away.
 *
 * @returns The difference of them.
 */
function differenceOf(first: number, second: number): number {
  return first - second
}

/**
 * Reads the area of a triangle of corners, the way the file stores it.
 *
 * @param corners The three corners of the triangle.
 *
 * @returns The area of it, in the square units of the game.
 */
function areaOf(corners: readonly ClipCorner[]): number {
  const [first, second, third] = corners

  if (first === undefined || second === undefined || third === undefined) {
    return 0
  }

  const abx = second.x - first.x
  const aby = second.y - first.y
  const abz = second.z - first.z
  const acx = third.x - first.x
  const acy = third.y - first.y
  const acz = third.z - first.z
  const cx = differenceOf(aby * acz, abz * acy)
  const cy = differenceOf(abz * acx, abx * acz)
  const cz = differenceOf(abx * acy, aby * acx)

  return Math.hypot(cx, cy, cz) / 2
}

/**
 * Builds a corner of a triangle, the way the level holds one.
 *
 * @param corner The corner to write.
 * @param index The place of the corner in the triangle.
 *
 * @returns The vertex of the file.
 */
function vertexOf(corner: ClipCorner, index: number): ArxPolygon['vertices'][number] {
  return { x: corner.x, y: corner.y, z: corner.z, u: corner.u, v: corner.v, llfColorIdx: index }
}

/**
 * Builds the face of a triangle of corners, the way the level holds one.
 *
 * @param source The face the corners came from: the room, the texture and the flags come with it.
 * @param corners The three corners of the triangle, around it.
 *
 * @returns The triangle, with the quad flag of the source taken off.
 *
 * @throws When the corners are not three: the clip never hands a face of another shape to this.
 */
function triangleOf(source: ArxPolygon, corners: readonly ClipCorner[]): ArxPolygon {
  const [first, second, third] = corners

  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('A triangle of the clip has no three corners.')
  }

  return {
    // the file holds four corners for every face, and the shape that is a triangle of three: the fourth is the third
    vertices: [vertexOf(first, 0), vertexOf(second, 1), vertexOf(third, 2), vertexOf(third, 3)],
    textureContainerId: source.textureContainerId,
    norm: { ...first.normal },
    norm2: { ...third.normal },
    normals: [{ ...first.normal }, { ...second.normal }, { ...third.normal }, { ...third.normal }],
    transval: source.transval,
    area: areaOf(corners),
    // the quad of the source is a triangle now: the flag of a shape is not inherited, the rest of them are
    flags: source.flags & ~ArxPolygonFlags.Quad,
    room: source.room,
  }
}

/**
 * Reads the pieces of a face that stand inside the map, as triangles.
 *
 * @remarks
 * The face is split the way the renderer splits it (a quad into its two triangles, the way the game draws it), and a
 * triangle is cut against the four sides of the map: the cut of a triangle by a side is a triangle or a quad, and a quad
 * of the cut is split into two triangles, because the file holds three and four cornered faces only (2026-10-31, the
 * owner; the faces of the model may be of any shape after the cut, which the 105 brings to the bake).
 *
 * @param polygon The face to cut.
 *
 * @returns The triangles of it that are inside the map; empty when the whole face is outside.
 */
function piecesOf(polygon: ArxPolygon): ArxPolygon[] {
  const corners = cornersOf(polygon)
  const pieces: ArxPolygon[] = []

  for (const [a, b, c] of polygonFillTriangles(polygon)) {
    const source = [corners[a], corners[b], corners[c]].filter((corner) => {
      return corner !== undefined
    })

    if (source.length < 3) {
      continue
    }

    let inside: ClipCorner[] = source

    for (const bound of MAP_BOUNDS) {
      inside = clipAgainst(inside, bound)

      if (inside.length < 3) {
        break
      }
    }

    const first = inside[0]

    if (first === undefined) {
      continue
    }

    for (let index = 1; index + 1 < inside.length; index = index + 1) {
      const second = inside[index]
      const third = inside[index + 1]

      if (second === undefined || third === undefined) {
        continue
      }

      pieces.push(triangleOf(polygon, [first, second, third]))
    }
  }

  return pieces
}

/**
 * Tells whether a face stands inside the map.
 *
 * @param polygon The face to read.
 *
 * @returns True when every corner of it is inside the square of the map.
 */
function isInMap(polygon: ArxPolygon): boolean {
  return cornersOf(polygon).every((corner) => {
    const across = corner.x >= 0 && corner.x <= MAP_LIMIT
    const along = corner.z >= 0 && corner.z <= MAP_LIMIT

    return across && along
  })
}

/**
 * Cuts the faces of a level to the square of the map, and says what it did.
 *
 * @remarks
 * The game draws and collides the faces of the cells of the map, and a face that stands past the square has no cell of
 * its own: the export used to refuse such a face (an error since the 304), and the Arx Level Generator deleted it whole.
 * The face is **cut** instead: the part inside the map stays, the part outside goes, and the author reads how many faces
 * the map cut, and how many it left out (2026-10-31, 2026-11-26, the owner).
 *
 * @param polygons The faces of the archive.
 *
 * @returns The faces to write, and the count of the ones the clip touched.
 */
export function clippedToMapOf(polygons: readonly ArxPolygon[]): MapClip {
  const kept: ArxPolygon[] = []
  let touched = 0
  let dropped = 0

  for (const polygon of polygons) {
    if (isInMap(polygon)) {
      kept.push(polygon)

      continue
    }

    touched = touched + 1

    const pieces = piecesOf(polygon)

    if (pieces.length === 0) {
      dropped = dropped + 1

      continue
    }

    kept.push(...pieces)
  }

  return { polygons: kept, clipped: touched - dropped, dropped }
}
