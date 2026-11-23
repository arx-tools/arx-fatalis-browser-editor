/**
 * The tunnel of the POC (2026-11-16): the wall of an opening, taken out and joined by a sweep of quads.
 *
 * @remarks
 * **Parked (2026-11-17, the owner):** this is a proof of concept, and the editor has no button for it any more (the
 * Selection Inspector lost the Build tunnel button). The CSG-based tunnel digging will replace it; until then it stays
 * here for the parts it may reuse (the boundary loop, the fitted quad, the plan, the history step). Remove it or take
 * what it needs when that work starts.
 */
import type { ArxColor, ArxPolygon, ArxPortal, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { boundaryLoopsOf, fittedQuadOf, tunnelPolygonsOf } from '../../../../generator/tunnel.ts'
import { commandOf } from '../../history/commands.ts'
import { createBuildTunnelRecord } from '../../history/records.ts'
import { renameRoom } from '../../rooms/roomNames.ts'
import { selectionStore } from '../../selection/selectionStore.ts'
import { runStep } from './editing.ts'
import { levelStore } from './levelStore.ts'

/**
 * The texture the faces of a tunnel draw with.
 *
 * @remarks
 * The owner's choice (2026-11-16): the marble wall of the snake level, which reads apart from both the prison wall of
 * room 26 and the ground of room 17. It lives in the data directory of the game, so a hole of a level of the game can
 * use it without the level carrying the file.
 */
export const TUNNEL_TEXTURE_NAME = 'l5_snake_[marble]_wall04.jpg'

/**
 * The name the new room of a tunnel takes.
 */
export const TUNNEL_ROOM_NAME = 'Tunnel'

/**
 * The neutral medium light of a tunnel, on a scale of 255.
 *
 * @remarks
 * The tunnel has no light of its own (2026-11-16, the owner): its faces take a flat, medium color, so the inside of the
 * tunnel reads neither as the dark wall it goes through nor as a hole in the mesh. The baked light of the two rooms is
 * darker than this (measured: room 17 is about 25, room 26 about 44-50), which is what a hole through a wall would look
 * like; the owner asked for the neutral medium instead.
 */
export const TUNNEL_LIGHT = 128

/**
 * The level the tunnel builder reads.
 *
 * @remarks
 * It is the part of a level the plan needs, so a test can make one from a few polygons: the faces, the palette of the
 * lighting, and the containers of the textures.
 */
export type TunnelLevel = {
  /**
   * Every polygon of the level, in the order of the mesh.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The lighting of the level, as it was loaded.
   */
  readonly llf: { readonly colors: readonly ArxColor[] }
  /**
   * The id of the container the level has for a texture name.
   *
   * @param name The name of the texture.
   */
  textureContainerIdOfName(name: string): number | undefined
  /**
   * The id the next container of the level takes.
   */
  nextTextureContainerId(): number
}

/**
 * What a tunnel step is made of.
 */
export type TunnelPlan = {
  /**
   * The faces of the wall the step takes out, sorted.
   */
  readonly removed: readonly number[]
  /**
   * The polygons of the tunnel, in the order they take at the end of the level.
   */
  readonly added: readonly ArxPolygon[]
  /**
   * The id of the container the new faces draw with.
   */
  readonly textureContainerId: number
  /**
   * The name of the texture of the container.
   */
  readonly textureName: string
  /**
   * Whether the level needs the container of the texture.
   */
  readonly addedTexture: boolean
  /**
   * The colors the new faces read at the end of the palette.
   */
  readonly lighting: readonly ArxColor[]
  /**
   * The portals that join the tunnel to the rooms of the two openings.
   */
  readonly portals: readonly ArxPortal[]
  /**
   * The room the new faces belong to.
   */
  readonly room: number
}

/**
 * The key of an edge between two corners, whichever way the face walks it. The two keys of the corners are ordered, so
 * the same edge has one key from both of the faces that share it.
 */
function edgeKeyOf(one: string, other: string): string {
  if (one < other) {
    return `${one}|${other}`
  }

  return `${other}|${one}`
}

/**
 * The key of a corner, so two faces that share a corner say so.
 *
 * @param vertex A corner of a face.
 *
 * @returns The key of its position.
 */
function cornerKeyOf(vertex: ArxPolygon['vertices'][number]): string {
  return `${vertex.x.toFixed(3)},${vertex.y.toFixed(3)},${vertex.z.toFixed(3)}`
}

/**
 * The edges of a face around its perimeter.
 *
 * @remarks
 * The fourth corner of a triangle is not a part of the shape (the file keeps a zero there), so the edges of a face are
 * the edges of the shape the `Quad` flag names.
 *
 * @param polygon The face to read.
 *
 * @returns The keys of its edges, each one once.
 */
function edgesOf(polygon: ArxPolygon): string[] {
  const [a, b, c, d] = polygon.vertices
  let perimeter = [a, b, c]

  if (isQuad(polygon)) {
    // the stored corners of a quad are not a loop: the perimeter is 0, 1, 3, 2
    perimeter = [a, b, d, c]
  }

  return perimeter.map((vertex, index) => {
    return edgeKeyOf(cornerKeyOf(vertex), cornerKeyOf(perimeter[(index + 1) % perimeter.length]))
  })
}

/**
 * Splits the selected faces into the groups that touch each other.
 *
 * @remarks
 * Two faces of the selection belong together when they share an edge: the groups are the holes the selection covers. A
 * selection of two holes therefore gives two groups, and a hole that is a ring of faces (with a hole of its own in the
 * middle) is a group with two rims, which the builder refuses.
 *
 * @param polygons The polygons of the level.
 * @param faces The selected faces.
 *
 * @returns The groups, each one a list of face indices.
 */
export function faceGroupsOf(polygons: readonly ArxPolygon[], faces: readonly number[]): number[][] {
  const byEdge = new Map<string, number[]>()

  for (const face of faces) {
    const polygon = polygons[face]

    if (polygon === undefined) {
      continue
    }

    for (const edge of edgesOf(polygon)) {
      byEdge.set(edge, [...(byEdge.get(edge) ?? []), face])
    }
  }

  const neighbors = new Map<number, Set<number>>()

  for (const face of faces) {
    neighbors.set(face, new Set())
  }

  for (const facesOfAnEdge of byEdge.values()) {
    for (const one of facesOfAnEdge) {
      for (const other of facesOfAnEdge) {
        if (one !== other) {
          neighbors.get(one)?.add(other)
        }
      }
    }
  }

  const seen = new Set<number>()
  const groups: number[][] = []

  for (const face of faces) {
    if (seen.has(face) || !neighbors.has(face)) {
      continue
    }

    const group: number[] = []
    const queue = [face]
    seen.add(face)

    while (queue.length > 0) {
      const current = queue.shift()

      if (current === undefined) {
        continue
      }

      group.push(current)

      for (const neighbor of neighbors.get(current) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    groups.push(
      group.toSorted((one, other) => {
        return one - other
      }),
    )
  }

  return groups
}

/**
 * The id the next room of the level takes.
 *
 * @param polygons The polygons of the level.
 *
 * @returns One above the biggest room the level uses.
 */
export function nextRoomIdOf(polygons: readonly ArxPolygon[]): number {
  let biggest = 0

  for (const polygon of polygons) {
    biggest = Math.max(biggest, polygon.room)
  }

  return biggest + 1
}

/**
 * The room most of the faces of a group belong to.
 *
 * @param polygons The polygons of the level.
 * @param group The faces of one hole.
 *
 * @returns The room of the group, or `-1` when it has none.
 */
function roomOfGroup(polygons: readonly ArxPolygon[], group: readonly number[]): number {
  const counts = new Map<number, number>()

  for (const face of group) {
    const polygon = polygons[face]

    if (polygon === undefined) {
      continue
    }

    counts.set(polygon.room, (counts.get(polygon.room) ?? 0) + 1)
  }

  let best = -1
  let count = 0

  for (const [room, faces] of counts) {
    let better = faces > count

    if (faces === count && room < best) {
      better = true
    }

    if (better) {
      best = room
      count = faces
    }
  }

  return best
}

/**
 * The middle of the faces of a room.
 *
 * @remarks
 * It is the side the portal of the rim has to face: the average of the corners of the room stands in its volume, far
 * enough from the wall to tell which side of it the room is on.
 *
 * @param polygons The polygons of the level.
 * @param room The room to measure.
 *
 * @returns The middle of its corners, or `undefined` when the level has no face in it.
 */
function centerOfRoom(polygons: readonly ArxPolygon[], room: number): ArxVector3 | undefined {
  let x = 0
  let y = 0
  let z = 0
  let count = 0

  for (const polygon of polygons) {
    if (polygon.room !== room) {
      continue
    }

    let corners = 3

    if (isQuad(polygon)) {
      corners = 4
    }

    for (let index = 0; index < corners; index = index + 1) {
      const corner = polygon.vertices[index]

      x = x + corner.x
      y = y + corner.y
      z = z + corner.z
      count = count + 1
    }
  }

  if (count === 0) {
    return undefined
  }

  return { x: x / count, y: y / count, z: z / count }
}

/**
 * The scalar product of two vectors, as the sign of it is what the portal orientation reads.
 *
 * @param one A vector.
 * @param other Another vector.
 *
 * @returns The product of their lengths and the cosine of their angle.
 */
function dotOf(one: ArxVector3, other: ArxVector3): number {
  const x = one.x * other.x
  const y = one.y * other.y
  const z = one.z * other.z

  return x + y + z
}

/**
 * Builds the portal of one rim, between the room of its opening and the tunnel.
 *
 * @remarks
 * The quad is the bounding rectangle of the rim on its best plane (see {@link fittedQuadOf}). The normal is turned
 * toward the room, so the game reads `room1` as the room of the opening and `room2` as the tunnel, the way it reads the
 * portals the generator makes. The radius in the first corner is the average of the largest and the smallest corner
 * distance from the middle, as the game's own bake writes it.
 *
 * @param rim The rim of the opening.
 * @param room1 The room on the side the normal faces.
 * @param room2 The room on the other side.
 * @param roomCenter A point in the room of the opening.
 *
 * @returns The portal quad, oriented toward the room.
 */
function portalOfRim(rim: readonly ArxVector3[], room1: number, room2: number, roomCenter: ArxVector3): ArxPortal {
  const fitted = fittedQuadOf(rim)
  let corners = [...fitted.corners]
  let { normal } = fitted
  const towardRoom = {
    x: roomCenter.x - fitted.center.x,
    y: roomCenter.y - fitted.center.y,
    z: roomCenter.z - fitted.center.z,
  }

  if (dotOf(normal, towardRoom) < 0) {
    corners = corners.toReversed()
    normal = { x: -normal.x, y: -normal.y, z: -normal.z }
  }

  const center = { x: 0, y: 0, z: 0 }

  for (const corner of corners) {
    center.x = center.x + corner.x
    center.y = center.y + corner.y
    center.z = center.z + corner.z
  }

  center.x = center.x / 4
  center.y = center.y / 4
  center.z = center.z / 4
  const distances = corners.map((corner) => {
    return Math.hypot(corner.x - center.x, corner.y - center.y, corner.z - center.z)
  })
  const minimum = Math.min(...distances)
  const maximum = Math.max(...distances)
  const radius = (minimum + maximum) / 2
  const min = { x: corners[0].x, y: corners[0].y, z: corners[0].z }
  const max = { x: corners[0].x, y: corners[0].y, z: corners[0].z }

  for (const corner of corners) {
    min.x = Math.min(min.x, corner.x)
    min.y = Math.min(min.y, corner.y)
    min.z = Math.min(min.z, corner.z)
    max.x = Math.max(max.x, corner.x)
    max.y = Math.max(max.y, corner.y)
    max.z = Math.max(max.z, corner.z)
  }

  // the corners of the game are stored in the order of the edges, not around the perimeter (0, 1, 3, 2)
  const stored = [corners[0], corners[1], corners[3], corners[2]]
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
      norm: normal,
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
 * Plans the tunnel of a selection.
 *
 * @remarks
 * The selection is the wall the author wants to take out, and the two holes it leaves are the rims of its two groups.
 * Every group has to be one hole (one boundary loop): a group of faces with a hole in the middle has two rims, and a
 * tunnel can not be built on that without deciding which one is the way through.
 *
 * The faces of the tunnel are the closed quad strip between the two rims (see the tunnel builder of the generator), in a
 * room of their own, with the texture of {@link TUNNEL_TEXTURE_NAME} and the neutral light of {@link TUNNEL_LIGHT}. The
 * plan is plain data: the step of the history takes it (`createBuildTunnelRecord`), and the views follow the step.
 *
 * @param level The level the selection is on.
 * @param faces The selected faces, the wall of the opening.
 *
 * @returns The plan of the step, or `undefined` when the selection is not a pair of holes.
 */
export function tunnelPlanOf(level: TunnelLevel, faces: Iterable<number>): TunnelPlan | undefined {
  const selected = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  for (const face of selected) {
    if (level.polygons[face] === undefined) {
      return undefined
    }
  }

  const groups = faceGroupsOf(level.polygons, selected)

  if (groups.length !== 2) {
    return undefined
  }

  const sides: Array<{ rim: ArxVector3[]; room: number; center: ArxVector3 }> = []

  for (const group of groups) {
    const polygons = group.map((face) => {
      return level.polygons[face]
    })
    const loops = boundaryLoopsOf(polygons)

    if (loops.length !== 1) {
      return undefined
    }

    const rim = loops[0]
    const room = roomOfGroup(level.polygons, group)
    const center = centerOfRoom(level.polygons, room)

    if (rim === undefined) {
      return undefined
    }

    if (room <= 0) {
      return undefined
    }

    if (center === undefined) {
      return undefined
    }

    sides.push({ rim, room, center })
  }

  const [from, to] = sides

  if (from === undefined || to === undefined) {
    return undefined
  }

  const knownTexture = level.textureContainerIdOfName(TUNNEL_TEXTURE_NAME)
  const textureContainerId = knownTexture ?? level.nextTextureContainerId()
  const room = nextRoomIdOf(level.polygons)
  const lightingBase = level.llf.colors.length
  const hasPalette = lightingBase > 0
  const lighting: ArxColor[] = []

  if (hasPalette) {
    for (let corner = 0; corner < 4; corner = corner + 1) {
      lighting.push({ r: TUNNEL_LIGHT, g: TUNNEL_LIGHT, b: TUNNEL_LIGHT, a: 1 })
    }
  }

  const added = tunnelPolygonsOf({
    from: from.rim,
    to: to.rim,
    textureContainerId,
    room,
    lightingBase,
  })

  return {
    removed: selected,
    added,
    textureContainerId,
    textureName: TUNNEL_TEXTURE_NAME,
    addedTexture: knownTexture === undefined,
    lighting,
    portals: [portalOfRim(from.rim, from.room, room, from.center), portalOfRim(to.rim, to.room, room, to.center)],
    room,
  }
}

/**
 * The map of the editor as the builder reads it: the faces, the palette and the containers of the textures, which is the
 * part of a level a tunnel step reads.
 */
export function tunnelLevelOf(map: ArxMap): TunnelLevel {
  return {
    polygons: map.polygons,
    llf: map.llf,
    textureContainerIdOfName: (name: string): number | undefined => {
      return map.textureContainerIdOfName(name)
    },
    nextTextureContainerId: (): number => {
      return map.nextTextureContainerId()
    },
  }
}

/**
 * Builds the tunnel of the selected wall, through the history.
 *
 * @remarks
 * The selection is the wall of the opening: the plan of {@link tunnelPlanOf} takes the two holes it leaves, and the step
 * does the rest (the wall out, the tunnel in, its room and its texture). The room of the new faces takes the name
 * {@link TUNNEL_ROOM_NAME}, which is metadata of the level and not a step of the history.
 *
 * The selection is **dropped** after the step: the faces of the wall are gone, and the faces of the tunnel are new, so
 * the old indices would point at other faces.
 *
 * @returns True when the step ran, false when the selection is not a wall of two holes.
 */
export function buildTunnelOfSelection(): boolean {
  const map = levelStore.map.value

  if (map === undefined) {
    return false
  }

  const plan = tunnelPlanOf(tunnelLevelOf(map), selectionStore.polygons.value)

  if (plan === undefined) {
    return false
  }

  const command = commandOf(
    createBuildTunnelRecord({
      removed: plan.removed,
      added: plan.added,
      texture: { id: plan.textureContainerId, name: plan.textureName },
      addedTexture: plan.addedTexture,
      lighting: plan.lighting,
      portals: plan.portals,
    }),
    map,
  )

  if (command === undefined) {
    return false
  }

  runStep(command)
  renameRoom(plan.room, TUNNEL_ROOM_NAME)
  selectionStore.clear()

  return true
}
