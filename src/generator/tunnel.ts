import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { MathUtils, Vector3 } from 'three'

/**
 * The side of one repeat of the texture of a tunnel, in game units.
 *
 * @remarks
 * The walls of the game tile their texture about every 100 units (measured on the walls around the room 17/26 hole of
 * level 1: `l1_prison_[stone]_wall01.bmp` and `wall05.bmp` take 100.8 units per uv unit, and the ground textures of
 * room 17 take 120 to 160). A tunnel is a wall, so it follows the wall scale.
 */
export const TUNNEL_TEXTURE_SIZE = 100

/**
 * A rim of a hole: the boundary loop of a group of faces, as positions in the order of the loop.
 *
 * @remarks
 * A hole in a wall is bounded by the edges that only one face of the group uses. The loop is a **closed** line: the
 * last point is not repeated, it joins the first one.
 */
export type TunnelRim = readonly ArxVector3[]

/**
 * How a tunnel is built between two rims.
 */
export type TunnelOptions = {
  /**
   * The rim of the hole the tunnel starts at.
   */
  readonly from: TunnelRim
  /**
   * The rim of the hole the tunnel ends at.
   */
  readonly to: TunnelRim
  /**
   * The id of the texture container the tunnel faces draw with.
   */
  readonly textureContainerId: number
  /**
   * The room the new faces belong to.
   */
  readonly room: number
  /**
   * The first index of the lighting palette the faces read their colours from.
   *
   * @remarks
   * A face reads as many colours as it has corners, so the palette has to have four entries from this index on. Every
   * face of the tunnel points here, and the export copies the colours in the order of the faces.
   */
  readonly lightingBase: number
  /**
   * The side of one repeat of the texture, in game units.
   *
   * @default TUNNEL_TEXTURE_SIZE
   */
  readonly textureSize?: number
}

/**
 * The key of a position, so two corners of two faces are one point when the file gave them the same place.
 *
 * @param point A corner of a face, in the coordinates of the level.
 *
 * @returns The key of the position.
 */
function pointKeyOf(point: ArxVector3): string {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`
}

/**
 * The key of the edge between two points, whichever way the face walks it. The two keys of the ends are ordered, so the
 * same edge has one key from both of the faces that share it.
 */
function edgeKeyOf(one: string, other: string): string {
  if (one < other) {
    return `${one}|${other}`
  }

  return `${other}|${one}`
}

/**
 * A position of the level as a vector, so the arithmetic of the tunnel reads as one line instead of six.
 *
 * @param point A corner of a face, in the coordinates of the level.
 *
 * @returns The same position as a vector of the library.
 */
function vectorOf(point: ArxVector3): Vector3 {
  return new Vector3(point.x, point.y, point.z)
}

/**
 * A vector as a position of the level.
 *
 * @param vector A point in the room of the library.
 *
 * @returns The position in the coordinates of the level.
 */
function positionOf(vector: Vector3): ArxVector3 {
  return { x: vector.x, y: vector.y, z: vector.z }
}

/**
 * The corners of a face, in the order of its perimeter.
 *
 * @remarks
 * The corners of an FTS quad are **not** a loop: the first two are the ends of one edge and the last two the ends of
 * the opposite one (the perimeter is `0, 1, 3, 2`). The rim of a hole has to follow the shape, so the corners are read
 * in that order here.
 *
 * @param polygon The face to read.
 *
 * @returns The positions of its corners, around the face.
 */
function perimeterOf(polygon: Pick<ArxPolygon, 'vertices' | 'flags'>): Vector3[] {
  const [a, b, c, d] = polygon.vertices

  if (isQuad(polygon)) {
    return [a, b, d, c].map((vertex) => {
      return vectorOf(vertex)
    })
  }

  return [a, b, c].map((vertex) => {
    return vectorOf(vertex)
  })
}

/**
 * The boundary loops of a group of faces.
 *
 * @remarks
 * An edge of the group is interior when two faces of the group share it, and boundary when it is left alone: those
 * edges chain into the rims of the holes the group covers. A group of faces that does not cover one hole gives one loop
 * per hole (the room 17 group of the level 1 test case gives two), and the order of the loops follows the walk of the
 * edges.
 *
 * The loop follows the winding of the faces as far as the edges allow. A group that mixes two sides of a wall (a floor
 * and a wall around one opening) may reverse a loop or leave a pinch point where the rim touches itself; the tunnel
 * builder pairs two rims by distance, so a reversed rim is not a problem there.
 *
 * @param polygons The faces of the group.
 *
 * @returns The rims of the holes, each one a closed loop of positions.
 */
export function boundaryLoopsOf(polygons: ReadonlyArray<Pick<ArxPolygon, 'vertices' | 'flags'>>): ArxVector3[][] {
  const points = new Map<string, Vector3>()
  const boundary = new Map<string, { from: string; to: string }>()

  for (const polygon of polygons) {
    const perimeter = perimeterOf(polygon)

    for (const point of perimeter) {
      points.set(pointKeyOf(point), point)
    }

    for (let index = 0; index < perimeter.length; index = index + 1) {
      const from = pointKeyOf(perimeter[index])
      const to = pointKeyOf(perimeter[(index + 1) % perimeter.length])
      const key = edgeKeyOf(from, to)

      // an edge a second face of the group uses is interior: the two faces walk it the other way around, and the rim
      // keeps the pairs that are left alone
      if (boundary.has(key)) {
        boundary.delete(key)
      } else {
        boundary.set(key, { from, to })
      }
    }
  }

  const out = new Map<string, string[]>()

  for (const edge of boundary.values()) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to])
  }

  const used = new Set<string>()
  const loops: ArxVector3[][] = []

  for (const [key, edge] of boundary) {
    if (used.has(key)) {
      continue
    }

    const loop: Vector3[] = []
    const start = edge.from
    let current = edge.from
    let following = edge.to

    for (let step = 0; step <= boundary.size + 1; step = step + 1) {
      const point = points.get(current)

      if (point !== undefined) {
        loop.push(point)
      }

      used.add(edgeKeyOf(current, following))

      if (following === start) {
        break
      }

      // the rim may touch itself at a pinch point: the walk takes the next edge that is still free
      const candidates = out.get(following) ?? []
      let next: string | undefined

      for (const candidate of candidates) {
        if (!used.has(edgeKeyOf(following, candidate))) {
          next = candidate

          break
        }
      }

      if (next === undefined) {
        break
      }

      current = following
      following = next
    }

    if (loop.length >= 3) {
      loops.push(
        loop.map((point) => {
          return positionOf(point)
        }),
      )
    }
  }

  return loops
}

/**
 * The length of the loop, with the closing edge.
 *
 * @param loop The rim to measure.
 *
 * @returns The length of the perimeter, in game units.
 */
function perimeterLengthOf(loop: readonly Vector3[]): number {
  let length = 0

  for (let index = 0; index < loop.length; index = index + 1) {
    length = length + loop[index].distanceTo(loop[(index + 1) % loop.length])
  }

  return length
}

/**
 * Reads the same rim with a given number of points.
 *
 * @remarks
 * The points are spread by the arc length of the rim, so a corner of the rim that is not a point of the result still
 * lies on one of its edges: the shape of the hole does not change, only the corners of the quads that walk around it.
 * The first point stays the first point of the rim.
 *
 * @param loop The rim to read.
 * @param count How many points the result has.
 *
 * @returns The rim with that many points.
 */
export function resampleLoop(loop: TunnelRim, count: number): ArxVector3[] {
  const points = loop.map((point) => {
    return vectorOf(point)
  })

  if (count === points.length) {
    return points.map((point) => {
      return positionOf(point)
    })
  }

  const total = perimeterLengthOf(points)
  const result: Vector3[] = []

  for (let index = 0; index < count; index = index + 1) {
    let remaining = (total * index) / count
    let corner = 0

    while (corner < points.length) {
      const one = points[corner]
      const other = points[(corner + 1) % points.length]
      const segment = one.distanceTo(other)

      if (remaining <= segment || corner === points.length - 1) {
        let ratio = 0

        if (segment !== 0) {
          ratio = MathUtils.clamp(remaining / segment, 0, 1)
        }

        result.push(new Vector3().lerpVectors(one, other, ratio))

        break
      }

      remaining = remaining - segment
      corner = corner + 1
    }
  }

  return result.map((point) => {
    return positionOf(point)
  })
}

/**
 * The sum of the squared distances of two rings that are read corner by corner.
 *
 * @param fixed The ring that keeps its points.
 * @param moving The ring that is turned and shifted.
 * @param shift How many points the moving ring is turned.
 * @param reversed Whether the moving ring is walked the other way.
 *
 * @returns How far the paired points are from each other.
 */
function pairingCostOf(
  fixed: readonly Vector3[],
  moving: readonly Vector3[],
  shift: number,
  reversed: boolean,
): number {
  const count = fixed.length
  let cost = 0

  for (let index = 0; index < count; index = index + 1) {
    let at = index + shift

    if (reversed) {
      at = shift - index
    }

    cost = cost + fixed[index].distanceToSquared(moving[((at % count) + count) % count])
  }

  return cost
}

/**
 * A pair of rims with the same number of points, read together.
 */
type RingPair = {
  /**
   * The points of the first rim, in the order the tunnel walks them.
   */
  readonly from: readonly Vector3[]
  /**
   * The paired points of the second rim, in the same order.
   */
  readonly to: readonly Vector3[]
}

/**
 * Pairs the corners of two rims.
 *
 * @remarks
 * The rims of two holes of a wall usually have a different number of corners, and the two rims are walked with opposite
 * directions when they face each other. The rim with more corners keeps them all (the shape of the hole is the one the
 * game draws); the other one is read with the same count along its own perimeter. The pair is then **turned and
 * reversed** until the paired points are as close as possible: that is the pairing without a twist, whatever direction
 * the faces of the two groups happened to walk in.
 *
 * @param from The rim of the hole the tunnel starts at.
 * @param to The rim of the hole it ends at.
 *
 * @returns The two rims with the same count, paired.
 */
function pairRings(from: TunnelRim, to: TunnelRim): RingPair {
  const count = Math.max(from.length, to.length)
  const fromPoints = from.map((point) => {
    return vectorOf(point)
  })
  const toPoints = to.map((point) => {
    return vectorOf(point)
  })

  let fixed = fromPoints
  let moving = toPoints
  let movingIsFrom = false

  if (fromPoints.length < toPoints.length) {
    fixed = toPoints
    moving = resampleLoop(from, count).map((point) => {
      return vectorOf(point)
    })
    movingIsFrom = true
  } else {
    moving = resampleLoop(to, count).map((point) => {
      return vectorOf(point)
    })
  }

  let best = { shift: 0, reversed: false, cost: Number.POSITIVE_INFINITY }

  for (let shift = 0; shift < count; shift = shift + 1) {
    for (const reversed of [false, true]) {
      const cost = pairingCostOf(fixed, moving, shift, reversed)

      if (cost < best.cost) {
        best = { shift, reversed, cost }
      }
    }
  }

  function readAt(index: number): Vector3 {
    let at = index + best.shift

    if (best.reversed) {
      at = best.shift - index
    }

    return moving[((at % count) + count) % count]
  }

  const ordered: Vector3[] = []

  for (let index = 0; index < count; index = index + 1) {
    ordered.push(readAt(index))
  }

  if (movingIsFrom) {
    return { from: ordered, to: fixed }
  }

  return { from: fixed, to: ordered }
}

/**
 * The normal of a triangle, pointing the way its three corners wind.
 *
 * @param one A corner of the triangle.
 * @param other Another corner, the one after it around the triangle.
 * @param third The corner after that one.
 *
 * @returns The normal of the triangle, with a length of one.
 */
function normalOf(one: Vector3, other: Vector3, third: Vector3): Vector3 {
  return new Vector3().subVectors(other, one).cross(new Vector3().subVectors(third, one)).normalize()
}

/**
 * The middle of a ring of points.
 *
 * @param points The corners of the ring.
 *
 * @returns The average of the points.
 */
function centerOf(points: readonly Vector3[]): Vector3 {
  const center = new Vector3()

  for (const point of points) {
    center.add(point)
  }

  return center.divideScalar(points.length)
}

/**
 * A corner of a quad of the tunnel, with its place on the texture.
 */
type TunnelCorner = {
  /**
   * The position of the corner.
   */
  readonly point: Vector3
  /**
   * The `u` of the texture.
   */
  readonly u: number
  /**
   * The `v` of the texture.
   */
  readonly v: number
}

/**
 * Builds the closed tube of a tunnel between two rims.
 *
 * @remarks
 * The tube is a **closed quad strip**: every pair of neighbouring corners of the two rims gives one quad, around the
 * whole perimeter, so the floor, the ceiling and the two sides of the tunnel come from the same walk. Two rims with a
 * different number of corners are paired corner by corner (see the pairing), and the tube therefore has as many quads
 * as the longer rim.
 *
 * The normal of every quad points **into the tunnel**. A rim can be walked either way around (a group of faces is not
 * one surface), so the winding of the quads is decided by the geometry: the face turns its back on the middle of the
 * tube when its normal points the other way.
 *
 * @param options The two rims and the look of the faces.
 *
 * @returns The quads of the tube, in the order of the walk.
 */
export function tunnelPolygonsOf(options: TunnelOptions): ArxPolygon[] {
  const ring = pairRings(options.from, options.to)
  const count = ring.from.length
  const textureSize = options.textureSize ?? TUNNEL_TEXTURE_SIZE
  const axis = centerOf([...ring.from, ...ring.to])
  const polygons: ArxPolygon[] = []

  // how far the walk is from the first pair, in game units: the texture follows the perimeter, not the corners
  const distances = [0]

  for (let index = 1; index <= count; index = index + 1) {
    distances.push(distances[index - 1] + ring.from[index - 1].distanceTo(ring.from[index % count]))
  }

  for (let index = 0; index < count; index = index + 1) {
    const next = (index + 1) % count
    const fromOne = ring.from[index]
    const fromOther = ring.from[next]
    const toOne = ring.to[index]
    const toOther = ring.to[next]
    const across = (fromOne.distanceTo(toOne) + fromOther.distanceTo(toOther)) / 2
    const corners: TunnelCorner[] = [
      { point: fromOne, u: distances[index] / textureSize, v: 0 },
      { point: fromOther, u: distances[index + 1] / textureSize, v: 0 },
      { point: toOther, u: distances[index + 1] / textureSize, v: across / textureSize },
      { point: toOne, u: distances[index] / textureSize, v: across / textureSize },
    ]

    const middle = new Vector3().add(fromOne).add(fromOther).add(toOne).add(toOther).divideScalar(4)
    const normal = normalOf(corners[0].point, corners[1].point, corners[3].point)

    // the corners of the quad are a loop here; a normal that points away from the middle of the tube is turned around
    if (normal.dot(axis.clone().sub(middle)) < 0) {
      corners.reverse()
    }

    // the polygons of the FTS are not loops: the first two corners are one edge, the last two the opposite one
    const stored = [corners[0], corners[1], corners[3], corners[2]]
    const base = options.lightingBase
    const firstNormal = normalOf(stored[0].point, stored[1].point, stored[2].point)
    const secondNormal = normalOf(stored[2].point, stored[1].point, stored[3].point)
    const firstArea =
      new Vector3()
        .subVectors(stored[1].point, stored[0].point)
        .cross(new Vector3().subVectors(stored[2].point, stored[0].point))
        .length() / 2
    const secondArea =
      new Vector3()
        .subVectors(stored[1].point, stored[2].point)
        .cross(new Vector3().subVectors(stored[3].point, stored[2].point))
        .length() / 2
    const area = firstArea + secondArea

    polygons.push({
      vertices: [
        { ...positionOf(stored[0].point), u: stored[0].u, v: stored[0].v, llfColorIdx: base },
        { ...positionOf(stored[1].point), u: stored[1].u, v: stored[1].v, llfColorIdx: base + 1 },
        { ...positionOf(stored[2].point), u: stored[2].u, v: stored[2].v, llfColorIdx: base + 2 },
        { ...positionOf(stored[3].point), u: stored[3].u, v: stored[3].v, llfColorIdx: base + 3 },
      ],
      textureContainerId: options.textureContainerId,
      norm: positionOf(firstNormal),
      norm2: positionOf(secondNormal),
      transval: 0,
      area,
      flags: ArxPolygonFlags.Quad,
      room: options.room,
    })
  }

  return polygons
}

/**
 * A quad fitted on a rim: the rectangle that covers the rim on its best plane.
 *
 * @remarks
 * A portal of the game is a planar quad, and a rim of a hole is not always planar (the room 17 rim of the level 1 test
 * case is out of its best plane by about 32 units). The corners are the bounding rectangle of the rim projected on that
 * plane, in the order of the perimeter, so a portal built from them has the plane's normal.
 */
export type RimQuad = {
  /**
   * The four corners of the rectangle, around its perimeter.
   */
  readonly corners: readonly [ArxVector3, ArxVector3, ArxVector3, ArxVector3]
  /**
   * The normal of the plane of the rectangle.
   */
  readonly normal: ArxVector3
  /**
   * The middle of the rectangle.
   */
  readonly center: ArxVector3
}

/**
 * Fits a quad on a rim.
 *
 * @remarks
 * The plane is the Newell plane of the rim (the best plane of a loop that is not flat), and the rectangle is the bounding
 * box of the rim's projection on it. The corners are slightly apart from the rim when it is curved; the portal is a
 * cover of the opening, not a copy of it.
 *
 * @param rim The rim to fit.
 *
 * @returns The rectangle that covers it.
 */
export function fittedQuadOf(rim: TunnelRim): RimQuad {
  const points = rim.map((point) => {
    return vectorOf(point)
  })
  const normal = new Vector3()

  for (let index = 0; index < points.length; index = index + 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]

    const acrossY = current.y - next.y
    const acrossZ = current.z + next.z
    const upZ = current.z - next.z
    const upX = current.x + next.x
    const depthX = current.x - next.x
    const depthY = current.y + next.y

    const alongX = acrossY * acrossZ
    const alongY = upZ * upX
    const alongZ = depthX * depthY

    normal.x = normal.x + alongX
    normal.y = normal.y + alongY
    normal.z = normal.z + alongZ
  }

  if (normal.lengthSq() === 0) {
    normal.set(0, 1, 0)
  }

  normal.normalize()

  const middle = centerOf(points)
  // the longest edge of the rim is the direction of the rectangle: a box turned against the edges of a square would
  // enclose it with a larger one
  let across = new Vector3()
  let longest = 0

  for (let index = 0; index < points.length; index = index + 1) {
    const edge = points[(index + 1) % points.length].clone().sub(points[index])
    edge.sub(normal.clone().multiplyScalar(edge.dot(normal)))

    if (edge.lengthSq() > longest) {
      across = edge
      longest = edge.lengthSq()
    }
  }

  if (longest < 1e-12) {
    across = points[0].clone().sub(middle)
    across.sub(normal.clone().multiplyScalar(across.dot(normal)))
  }

  if (across.lengthSq() < 1e-12) {
    let helper = new Vector3(1, 0, 0)

    if (Math.abs(normal.y) < 0.9) {
      helper = new Vector3(0, 1, 0)
    }

    across.crossVectors(normal, helper)
  }

  across.normalize()
  // so the loop of the corners has the normal of the plane
  const up = new Vector3().crossVectors(normal, across)
  let minAcross = Number.POSITIVE_INFINITY
  let maxAcross = Number.NEGATIVE_INFINITY
  let minUp = Number.POSITIVE_INFINITY
  let maxUp = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const offset = point.clone().sub(middle)
    const at = offset.dot(across)
    const upAt = offset.dot(up)

    minAcross = Math.min(minAcross, at)
    maxAcross = Math.max(maxAcross, at)
    minUp = Math.min(minUp, upAt)
    maxUp = Math.max(maxUp, upAt)
  }

  const center = middle
    .clone()
    .add(across.clone().multiplyScalar(MathUtils.lerp(minAcross, maxAcross, 0.5)))
    .add(up.clone().multiplyScalar(MathUtils.lerp(minUp, maxUp, 0.5)))

  function cornerOf(at: number, upAt: number): ArxVector3 {
    const corner = center.clone().add(across.clone().multiplyScalar(at)).add(up.clone().multiplyScalar(upAt))

    return positionOf(corner)
  }

  return {
    corners: [
      cornerOf(minAcross, minUp),
      cornerOf(maxAcross, minUp),
      cornerOf(maxAcross, maxUp),
      cornerOf(minAcross, maxUp),
    ],
    normal: positionOf(normal),
    center: positionOf(center),
  }
}
