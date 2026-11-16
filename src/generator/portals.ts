import type { ArxPolygon, ArxPortal, ArxVector3 } from 'arx-convert/types'
import { Vector3 } from 'three'
import { polygonPerimeter } from './polygons.ts'

/**
 * The height of a portal a generator makes when the level carries no height of its own, in game units.
 *
 * @remarks
 * The game measures in centimetres (`1 m = 100`), so this is **2 m**: the height of a door, and the median of the short
 * side of the portals of the original levels. The owner's default (2026-11-15); a later round puts it in a field of the
 * editor, and a generated portal can be raised over it.
 */
export const DEFAULT_PORTAL_HEIGHT = 200

/**
 * How close two numbers have to be to count as the same place, in game units.
 *
 * @remarks
 * The vertices of a level are floats, and two polygons that meet share them by value, not by reference: the edges are
 * keyed by the rounded position, and a hundredth of a unit is far below anything the game draws.
 */
const EPSILON = 0.01

/**
 * One shared edge of two polygons of a level, as the boundary of two rooms.
 */
type BoundaryEdge = {
  /**
   * The two polygons that share the edge, by their index in the level.
   */
  readonly polygons: readonly [number, number]
  /**
   * The two ends of the edge.
   */
  readonly from: ArxVector3
  readonly to: ArxVector3
}

/**
 * A piece of the boundary of two rooms on one line, before the collinear pieces are merged.
 */
type BoundarySegment = {
  readonly roomLow: number
  readonly roomHigh: number
  readonly start: ArxVector3
  readonly end: ArxVector3
  readonly startAt: number
  readonly endAt: number
  readonly lowCenter: Vector3
}

/**
 * A run of collinear boundary edges between the same two rooms.
 */
type BoundaryRun = {
  readonly roomLow: number
  readonly roomHigh: number
  start: ArxVector3
  end: ArxVector3
  startAt: number
  endAt: number
  readonly lowCenter: Vector3
  lowCount: number
}

/**
 * The options of {@link generatePortalsOf}.
 */
export type PortalGenerationOptions = {
  /**
   * The height of the quad above the edge, in game units.
   *
   * @default DEFAULT_PORTAL_HEIGHT
   */
  readonly height?: number
}

/**
 * Reads the centre of a polygon, as the average of its corners.
 *
 * @param polygon The polygon to read.
 *
 * @returns Its centre, in the game's coordinates.
 */
function centerOf(polygon: ArxPolygon): ArxVector3 {
  let x = 0
  let y = 0
  let z = 0

  for (const vertex of polygon.vertices) {
    x = x + vertex.x
    y = y + vertex.y
    z = z + vertex.z
  }

  const count = polygon.vertices.length

  return { x: x / count, y: y / count, z: z / count }
}

/**
 * Builds the key of a coordinate.
 *
 * @param value The coordinate.
 *
 * @returns The coordinate in hundredths: two polygons that meet share it.
 */
function keyOfNumber(value: number): string {
  return String(Math.round(value / EPSILON))
}

/**
 * Builds the key of a place.
 *
 * @param position The point whose three coordinates are the key.
 *
 * @returns The three rounded coordinates, joined.
 */
function keyOfPoint(position: ArxVector3): string {
  return `${keyOfNumber(position.x)},${keyOfNumber(position.y)},${keyOfNumber(position.z)}`
}

/**
 * Builds the key of a shared edge, whatever the order of its ends.
 *
 * @param from One end of the edge.
 * @param to The other end.
 *
 * @returns The two point keys, the smaller first.
 */
function keyOfEdge(from: ArxVector3, to: ArxVector3): string {
  const first = keyOfPoint(from)
  const second = keyOfPoint(to)

  if (first <= second) {
    return `${first}|${second}`
  }

  return `${second}|${first}`
}

/**
 * Tells whether a direction has to be mirrored to be the canonical one of its line.
 *
 * @param direction The direction, a unit vector.
 *
 * @returns True when the negative of it is the canonical one.
 */
function isNegativeDirection(direction: Vector3): boolean {
  if (Math.abs(direction.x) > EPSILON) {
    return direction.x < 0
  }

  if (Math.abs(direction.y) > EPSILON) {
    return direction.y < 0
  }

  return direction.z < 0
}

/**
 * Rounds the parts of a vector for a key.
 *
 * @param vector The vector whose parts are keyed.
 *
 * @returns The three rounded parts, joined.
 */
function keyOfVector(vector: Vector3): string {
  return `${keyOfNumber(vector.x)},${keyOfNumber(vector.y)},${keyOfNumber(vector.z)}`
}

/**
 * Merges the pieces of a line into the runs of the boundary.
 *
 * @remarks
 * The pieces of a boundary are walked in the order of their place on the line; two pieces are one run when they touch
 * (the end of one is the start of the next), and a gap makes a new run: a hole between two pieces is another room, and
 * a portal across it would see through that room.
 *
 * @param segments The pieces on one line, between one pair of rooms.
 *
 * @returns The runs of the line.
 */
function runsOf(segments: readonly BoundarySegment[]): BoundaryRun[] {
  const sorted = segments.toSorted((first, second) => {
    return first.startAt - second.startAt
  })
  const runs: BoundaryRun[] = []

  for (const segment of sorted) {
    const last = runs.at(-1)

    if (last === undefined || segment.startAt > last.endAt + EPSILON) {
      runs.push({
        roomLow: segment.roomLow,
        roomHigh: segment.roomHigh,
        start: segment.start,
        end: segment.end,
        startAt: segment.startAt,
        endAt: segment.endAt,
        lowCenter: segment.lowCenter.clone(),
        lowCount: 1,
      })

      continue
    }

    if (segment.endAt > last.endAt) {
      last.end = segment.end
      last.endAt = segment.endAt
    }

    last.lowCenter.add(segment.lowCenter)
    last.lowCount = last.lowCount + 1
  }

  return runs
}

/**
 * Reads the edges two polygons of the level share, as the boundaries of two rooms.
 *
 * @param polygons The polygons of the level.
 *
 * @returns The shared edges whose two polygons are in two different rooms.
 */
function sharedEdgesOf(polygons: readonly ArxPolygon[]): BoundaryEdge[] {
  const uses = new Map<string, number[]>()
  const points = new Map<string, ArxVector3>()

  for (const [index, polygon] of polygons.entries()) {
    const perimeter = polygonPerimeter(polygon)

    for (let corner = 0; corner < perimeter.length; corner++) {
      const from = polygon.vertices[perimeter[corner]]
      const to = polygon.vertices[perimeter[(corner + 1) % perimeter.length]]

      points.set(keyOfPoint(from), from)
      points.set(keyOfPoint(to), to)

      const key = keyOfEdge(from, to)
      const list = uses.get(key) ?? []

      list.push(index)
      uses.set(key, list)
    }
  }

  const edges: BoundaryEdge[] = []

  for (const [key, used] of uses) {
    // an edge of one polygon is the border of the level, and more than two is a fold: neither is a way between rooms
    if (used.length !== 2) {
      continue
    }

    const [first, second] = used as [number, number]
    const firstPolygon = polygons[first]
    const secondPolygon = polygons[second]

    if (firstPolygon === undefined || secondPolygon === undefined) {
      continue
    }

    const firstRoom = firstPolygon.room
    const secondRoom = secondPolygon.room

    if (firstRoom === secondRoom || firstRoom <= 0 || secondRoom <= 0) {
      continue
    }

    const [fromKey, toKey] = key.split('|', 2)
    const from = points.get(fromKey)
    const to = points.get(toKey)

    if (from === undefined || to === undefined) {
      continue
    }

    edges.push({ polygons: [first, second], from, to })
  }

  return edges
}

/**
 * Groups the shared edges by the line they lie on, with the pieces on one line in one list.
 *
 * @remarks
 * The line is keyed by its canonical direction and the moment of it (the cross product of the direction and a point of
 * the line, which does not move along the line), so the pieces of a wall of tiles land in one list whatever the order
 * of the polygons. The pair of rooms is part of the key: two boundaries of different rooms may share a line.
 *
 * @param edges The shared edges of the level.
 * @param polygons The polygons of the level.
 *
 * @returns The pieces of every line, between one pair of rooms.
 */
function segmentsOf(edges: readonly BoundaryEdge[], polygons: readonly ArxPolygon[]): Map<string, BoundarySegment[]> {
  const centers = polygons.map((polygon) => {
    const center = centerOf(polygon)

    return new Vector3(center.x, center.y, center.z)
  })
  const lines = new Map<string, BoundarySegment[]>()

  for (const edge of edges) {
    const from = new Vector3(edge.from.x, edge.from.y, edge.from.z)
    const to = new Vector3(edge.to.x, edge.to.y, edge.to.z)
    const direction = to.clone().sub(from).normalize()

    if (isNegativeDirection(direction)) {
      direction.negate()
    }

    const moment = new Vector3().crossVectors(direction, from)
    const [firstPolygon, secondPolygon] = edge.polygons
    const firstRoom = polygons[firstPolygon]?.room ?? 0
    const secondRoom = polygons[secondPolygon]?.room ?? 0
    const roomLow = Math.min(firstRoom, secondRoom)
    const roomHigh = Math.max(firstRoom, secondRoom)
    const lineKey = `${keyOfVector(direction)}|${keyOfVector(moment)}|${String(roomLow)}|${String(roomHigh)}`
    const fromAt = from.dot(direction)
    const toAt = to.dot(direction)
    let start = edge.from
    let end = edge.to

    if (fromAt > toAt) {
      start = edge.to
      end = edge.from
    }

    let lowCenter = centers[firstPolygon]

    if (firstRoom !== roomLow) {
      lowCenter = centers[secondPolygon]
    }

    if (lowCenter === undefined) {
      continue
    }

    const pieces = lines.get(lineKey) ?? []

    pieces.push({
      roomLow,
      roomHigh,
      start,
      end,
      startAt: Math.min(fromAt, toAt),
      endAt: Math.max(fromAt, toAt),
      lowCenter: lowCenter.clone(),
    })
    lines.set(lineKey, pieces)
  }

  return lines
}

/**
 * Builds the portal of one run of the boundary.
 *
 * @param run The run to turn into a quad.
 * @param height The height of the quad above the run.
 *
 * @returns The portal, or `undefined` for a run without a length.
 */
function portalOfRun(run: BoundaryRun, height: number): ArxPortal | undefined {
  if (run.endAt - run.startAt <= EPSILON) {
    return undefined
  }

  const bottomFrom = run.start
  const bottomTo = run.end
  const topFrom = { x: bottomFrom.x, y: bottomFrom.y - height, z: bottomFrom.z }
  const topTo = { x: bottomTo.x, y: bottomTo.y - height, z: bottomTo.z }
  const corners = [bottomFrom, bottomTo, topTo, topFrom]
  const normal = new Vector3()
    .crossVectors(
      new Vector3(bottomTo.x - bottomFrom.x, bottomTo.y - bottomFrom.y, bottomTo.z - bottomFrom.z),
      new Vector3(topFrom.x - bottomFrom.x, topFrom.y - bottomFrom.y, topFrom.z - bottomFrom.z),
    )
    .normalize()
  const center = {
    x: (bottomFrom.x + bottomTo.x + topTo.x + topFrom.x) / corners.length,
    y: (bottomFrom.y + bottomTo.y + topTo.y + topFrom.y) / corners.length,
    z: (bottomFrom.z + bottomTo.z + topTo.z + topFrom.z) / corners.length,
  }
  const lowCenter = run.lowCenter.clone().divideScalar(run.lowCount)
  const lowSide = normal.dot(lowCenter.clone().sub(new Vector3(center.x, center.y, center.z)))
  let room1 = run.roomLow
  let room2 = run.roomHigh

  if (lowSide < 0) {
    room1 = run.roomHigh
    room2 = run.roomLow
  }

  let min = { x: corners[0].x, y: corners[0].y, z: corners[0].z }
  let max = { x: corners[0].x, y: corners[0].y, z: corners[0].z }
  let minimum = Number.POSITIVE_INFINITY
  let maximum = 0

  for (const corner of corners) {
    min = { x: Math.min(min.x, corner.x), y: Math.min(min.y, corner.y), z: Math.min(min.z, corner.z) }
    max = { x: Math.max(max.x, corner.x), y: Math.max(max.y, corner.y), z: Math.max(max.z, corner.z) }

    const distance = Math.hypot(corner.x - center.x, corner.y - center.y, corner.z - center.z)

    minimum = Math.min(minimum, distance)
    maximum = Math.max(maximum, distance)
  }

  const radius = (minimum + maximum) / 2
  // the game stores the corners in the "Z" order, and the perimeter is 0-1-3-2: the array is the four corners with the
  // two on the top swapped, so the perimeter walks the rectangle and not its diagonals
  const stored = [bottomFrom, bottomTo, topFrom, topTo]
  const vertices = stored.map((corner, index) => {
    let rhw = 0

    if (index === 0) {
      rhw = radius
    }

    return { position: corner, rhw }
  }) as ArxPortal['polygon']['vertices']

  return {
    polygon: {
      min,
      max,
      norm: { x: normal.x, y: normal.y, z: normal.z },
      norm2: { x: maximum, y: 0, z: 0 },
      vertices,
      center,
    },
    room1,
    room2,
    usePortal: 0,
  }
}

/**
 * Generates the portals of a level from the rooms of its faces, along the shared floor edges.
 *
 * @remarks
 * The portal of a flat level is a vertical quad on the line where two rooms meet: the game needs it to see from one room
 * into the other, and the line is the whole opening (nothing stands between the two floors). The function walks the
 * edges the polygons share, keeps the ones with two different rooms, merges the collinear pieces into one run (a grid
 * has many small edges along a wall of tiles), and builds one quad per run:
 *
 * - the bottom of the quad is the run, the top is {@link PortalGenerationOptions.height} above it (the game's Y axis
 * points down, so the top has the smaller Y);
 * - the normal comes from the order of the corners, and `room1` is the room on its side, as the game reads it;
 * - the radius in the first vertex is the average of the largest and the smallest corner distance from the centre, the
 * way the game's own bake writes it; the other vertices carry zero.
 *
 * The rooms 0 and below are the outside and the faces without a room: a run that touches one of them is not a portal
 * between two rooms, so it is left out. The function does not look at the mesh beyond the edges: it is meant for a
 * level whose rooms meet on one floor (see `isFlatLevel` of the editor). A 3D opening (a doorway between two rooms) has
 * no shared floor edge, and comes from a later round.
 *
 * @param polygons The polygons of the level.
 * @param options The height of the generated quads.
 *
 * @returns The portals, in the order the runs were found.
 */
export function generatePortalsOf(polygons: readonly ArxPolygon[], options: PortalGenerationOptions = {}): ArxPortal[] {
  const height = options.height ?? DEFAULT_PORTAL_HEIGHT
  const lines = segmentsOf(sharedEdgesOf(polygons), polygons)
  const portals: ArxPortal[] = []

  for (const pieces of lines.values()) {
    for (const run of runsOf(pieces)) {
      const portal = portalOfRun(run, height)

      if (portal !== undefined) {
        portals.push(portal)
      }
    }
  }

  return portals
}
