import type { ArxPolygon, ArxRoomDistance, ArxVector3 } from 'arx-convert/types'

/**
 * The distance the matrix gives a pair of rooms it has no path for, and the one the game reads as
 * "use the true (euclidean) distance".
 *
 * @remarks
 * The value is the same one the archived editor wrote and the one the game's own loader starts from: a
 * `distance <= 0` means the straight line between the entity and the camera, which is what the original
 * levels use for the rooms that share a portal.
 */
const NO_DISTANCE = -1

/**
 * The position a distance that has no path carries.
 */
const ORIGIN: ArxVector3 = { x: 0, y: 0, z: 0 }

/**
 * A portal as the distance graph reads it: the two rooms it joins and the quad it crosses.
 *
 * @remarks
 * It is the part of an {@link ArxPortal} the graph needs. The quad only gives the point the path crosses
 * the portal at, so the rest of the portal record (the radius, the runtime flag) is left out, and the
 * tests can build one without a whole scene.
 */
export interface DistancePortal {
  /**
   * The room on the side the normal faces.
   */
  readonly room1: number
  /**
   * The room on the other side.
   */
  readonly room2: number
  /**
   * The quad of the portal, whose corners the crossing point comes from.
   */
  readonly polygon: {
    readonly vertices: ReadonlyArray<{ readonly position: ArxVector3 }>
  }
}

/**
 * An edge of the distance graph, with the node it leads to and its cost.
 */
interface GraphEdge {
  readonly to: number
  readonly cost: number
}

/**
 * The neighbours of every node of the graph.
 */
type Graph = GraphEdge[][]

/**
 * The place of a pair of rooms in the flat matrix.
 *
 * @remarks
 * The game reads the records as `from + to * roomCount`: the loader walks the target room in the outer loop, so the
 * pair of a room with itself is not a row but every `roomCount`-th record.
 *
 * @param from The room the path starts in.
 * @param to The room the path goes to.
 * @param roomCount How many room records the level has.
 *
 * @returns The index of the pair in the matrix.
 */
function indexOfPair(from: number, to: number, roomCount: number): number {
  const row = to * roomCount

  return from + row
}

/**
 * The distance between two points.
 *
 * @param first One point.
 * @param second The other point.
 *
 * @returns The length of the straight line between them.
 */
function distance3d(first: ArxVector3, second: ArxVector3): number {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z)
}

/**
 * The middle of a polygon, from its corners.
 *
 * @param polygon The polygon to read.
 *
 * @returns The center of its corners.
 */
function centerOfPolygon(polygon: ArxPolygon): ArxVector3 {
  const corners = polygon.vertices.slice(0, 4)
  const center = { x: 0, y: 0, z: 0 }

  for (const corner of corners) {
    center.x = center.x + corner.x
    center.y = center.y + corner.y
    center.z = center.z + corner.z
  }

  return {
    x: center.x / corners.length,
    y: center.y / corners.length,
    z: center.z / corners.length,
  }
}

/**
 * The middle of a portal, from its four corners.
 *
 * @param portal The portal to read.
 *
 * @returns The center of its corners.
 */
function centerOfPortal(portal: DistancePortal): ArxVector3 {
  const center = { x: 0, y: 0, z: 0 }

  for (const corner of portal.polygon.vertices) {
    center.x = center.x + corner.position.x
    center.y = center.y + corner.position.y
    center.z = center.z + corner.position.z
  }

  const count = portal.polygon.vertices.length

  return { x: center.x / count, y: center.y / count, z: center.z / count }
}

/**
 * Builds the graph of the distance: the room centers and the portal crossings.
 *
 * @remarks
 * A room center is joined to the crossings of its portals, and the crossings of the same room are joined to each
 * other: a path leaves a room through one portal and enters the next room through another. The distance between
 * two crossings of one room is the straight line between them, the same shortcut the archived editor took.
 *
 * @param portals The portals of the level.
 * @param crossingOf The node of every portal.
 * @param roomCount How many room nodes the graph starts with.
 * @param positions The position of every node.
 *
 * @returns The neighbours of every node.
 */
function buildEdges(
  portals: readonly DistancePortal[],
  crossingOf: readonly number[],
  roomCount: number,
  positions: readonly ArxVector3[],
): Graph {
  const edges: Graph = Array.from({ length: positions.length }, () => {
    return []
  })

  /**
   * Adds one edge in both directions.
   *
   * @param first One end.
   * @param second The other end.
   */
  function link(first: number, second: number): void {
    const cost = distance3d(positions[first], positions[second])

    edges[first].push({ to: second, cost })
    edges[second].push({ to: first, cost })
  }

  const portalsOfRoom = new Map<number, number[]>()

  for (const [index, portal] of portals.entries()) {
    const crossing = crossingOf[index]

    for (const room of [portal.room1, portal.room2]) {
      if (room < 0 || room >= roomCount) {
        continue
      }

      link(room, crossing)

      const list = portalsOfRoom.get(room)

      if (list === undefined) {
        portalsOfRoom.set(room, [crossing])
      } else {
        list.push(crossing)
      }
    }
  }

  for (const crossings of portalsOfRoom.values()) {
    for (let first = 0; first < crossings.length; first++) {
      for (let second = first + 1; second < crossings.length; second++) {
        link(crossings[first], crossings[second])
      }
    }
  }

  return edges
}

/**
 * The length of the path through a list of nodes.
 *
 * @param path The nodes of the path, in order.
 * @param positions The position of every node.
 *
 * @returns The sum of the steps.
 */
function pathLength(path: readonly number[], positions: readonly ArxVector3[]): number {
  let length = 0

  for (let index = 1; index < path.length; index++) {
    length = length + distance3d(positions[path[index - 1]], positions[path[index]])
  }

  return length
}

/**
 * Reads the path from the source of a search to a node.
 *
 * @param from The node the search started from.
 * @param to The node the path goes to.
 * @param previous The node every node was reached from.
 *
 * @returns The nodes of the path, or `undefined` when the node was not reached.
 */
function pathBetween(from: number, to: number, previous: ReadonlyArray<number | undefined>): number[] | undefined {
  const path: number[] = []
  let node: number | undefined = to

  while (node !== undefined) {
    path.push(node)

    if (node === from) {
      return path.toReversed()
    }

    node = previous[node]
  }

  return undefined
}

/**
 * Runs a shortest path search from one node.
 *
 * @remarks
 * The graph has a couple of hundred nodes, so the plain search for the nearest unvisited one is short enough, and
 * the code stays without a heap.
 *
 * @param from The node to start from.
 * @param edges The neighbours of every node.
 * @param nodeCount How many nodes the graph has.
 *
 * @returns The node every reached node came from.
 */
function shortestPaths(from: number, edges: Graph, nodeCount: number): Array<number | undefined> {
  const distance = Array.from({ length: nodeCount }, () => {
    return Number.POSITIVE_INFINITY
  })
  const previous: Array<number | undefined> = Array.from({ length: nodeCount }, () => {
    return undefined
  })
  const visited = Array.from({ length: nodeCount }, () => {
    return false
  })

  distance[from] = 0

  for (let step = 0; step < nodeCount; step++) {
    let current = -1

    for (let node = 0; node < nodeCount; node++) {
      if (visited[node] || !Number.isFinite(distance[node])) {
        continue
      }

      if (current === -1 || distance[node] < distance[current]) {
        current = node
      }
    }

    if (current === -1) {
      break
    }

    visited[current] = true

    for (const edge of edges[current]) {
      const next = distance[current] + edge.cost

      if (next < distance[edge.to]) {
        distance[edge.to] = next
        previous[edge.to] = current
      }
    }
  }

  return previous
}

/**
 * The center of every room, from the box of its polygon centers.
 *
 * @remarks
 * It is the room center the archived editor used (`GetRoomCenter`): the box of the centers of the room's
 * polygons, and the middle of that box. A room without a polygon has no center, and it is left out.
 *
 * @param polygons The polygons of the level.
 *
 * @returns The center of the rooms that have a polygon.
 */
export function roomCentersOf(polygons: readonly ArxPolygon[]): Map<number, ArxVector3> {
  const boxes = new Map<number, { min: ArxVector3; max: ArxVector3 }>()

  for (const polygon of polygons) {
    if (polygon.room < 0) {
      continue
    }

    const center = centerOfPolygon(polygon)
    const box = boxes.get(polygon.room)

    if (box === undefined) {
      boxes.set(polygon.room, { min: { ...center }, max: { ...center } })

      continue
    }

    box.min = {
      x: Math.min(box.min.x, center.x),
      y: Math.min(box.min.y, center.y),
      z: Math.min(box.min.z, center.z),
    }
    box.max = {
      x: Math.max(box.max.x, center.x),
      y: Math.max(box.max.y, center.y),
      z: Math.max(box.max.z, center.z),
    }
  }

  const centers = new Map<number, ArxVector3>()

  for (const [room, box] of boxes) {
    centers.set(room, {
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2,
      z: (box.min.z + box.max.z) / 2,
    })
  }

  return centers
}

/**
 * Builds the sound and interaction distance of every pair of rooms.
 *
 * @remarks
 * The matrix is **not** decoration: the game reads it to decide how far an entity is, and that distance is the
 * treat zone — inside it the entity can be picked up, hit and aimed at, outside it not. A `-1` means "the straight
 * line", so a level whose rooms are joined by a portal would let the player reach through the wall; a path
 * distance makes the walk around the portal the real distance.
 *
 * The graph is the one of the archived editor (`ComputeRoomDistance`): a node per room center and one per portal
 * center, the room center joined to the crossings of its portals, and the crossings of the same room joined to
 * each other. The path goes room center, the crossings it passes, room center; the stored distance is the part
 * **between the first and the last crossing**, because the game adds the entity and the camera to their ends. A
 * pair of rooms that share a portal keeps the straight line: the player is on one side of the opening and can see
 * the other.
 *
 * The matrix is flat, and the index of the pair (from, to) is `from + (to * roomCount)`: that is the order the
 * game's loader reads the records in, and the order `arx-convert` writes them.
 *
 * @param centers The center of every room, from {@link roomCentersOf}.
 * @param portals The portals of the level.
 * @param roomCount How many room records the level has (`max room id + 1`).
 *
 * @returns The distance of every pair, in the order of the file.
 */
export function roomDistancesOf(
  centers: ReadonlyMap<number, ArxVector3>,
  portals: readonly DistancePortal[],
  roomCount: number,
): ArxRoomDistance[] {
  const distances: ArxRoomDistance[] = Array.from({ length: roomCount ** 2 }, () => {
    return { distance: NO_DISTANCE, startPosition: { ...ORIGIN }, endPosition: { ...ORIGIN } }
  })

  // the nodes: the room centers first, then the crossing of every portal
  const positions: ArxVector3[] = []

  for (let room = 0; room < roomCount; room++) {
    positions.push(centers.get(room) ?? ORIGIN)
  }

  const crossingOf = portals
    .keys()
    .map((index) => {
      return roomCount + index
    })
    .toArray()

  for (const [index, portal] of portals.entries()) {
    positions[crossingOf[index]] = centerOfPortal(portal)
  }

  const edges = buildEdges(portals, crossingOf, roomCount, positions)
  const rooms = centers
    .keys()
    .filter((room) => {
      return room >= 0 && room < roomCount
    })
    .toArray()
    .toSorted((first, second) => {
      return first - second
    })

  for (const from of rooms) {
    const previous = shortestPaths(from, edges, positions.length)

    for (const to of rooms) {
      if (to === from) {
        continue
      }

      const path = pathBetween(from, to, previous)

      if (path === undefined) {
        continue
      }

      // the path runs from the center of one room to the center of the other: the crossings between them are the
      // points the game measures from
      const crossings = path.slice(1, -1)

      if (crossings.length === 0) {
        continue
      }

      distances[indexOfPair(from, to, roomCount)] = {
        distance: pathLength(crossings, positions),
        startPosition: { ...positions[crossings[0]] },
        endPosition: { ...positions[crossings.at(-1) ?? crossings[0]] },
      }
    }
  }

  // the rooms that share a portal keep the straight line: the two are one opening apart, and the player sees the
  // other side of it (the archived editor did the same, "don't use this for contiguous rooms")
  for (const portal of portals) {
    distances[indexOfPair(portal.room1, portal.room2, roomCount)] = {
      distance: NO_DISTANCE,
      startPosition: { ...ORIGIN },
      endPosition: { ...ORIGIN },
    }
    distances[indexOfPair(portal.room2, portal.room1, roomCount)] = {
      distance: NO_DISTANCE,
      startPosition: { ...ORIGIN },
      endPosition: { ...ORIGIN },
    }
  }

  return distances
}
