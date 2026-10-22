/**
 * Anchor (pathfinding graph) generation for Arx Fatalis FTS files.
 *
 * This is the experiment version of the future `arx-level-generator2` module. It has no
 * dependencies at all (no three.js, no DOM) so it can run in node.js and in the browser alike.
 *
 * The algorithm (see `.infos/experiments/anchor-generation/README.md` for the reasoning and the
 * numbers measured on the original levels):
 *
 * 1. walkable surface detection -- per grid point we collect every horizontal-ish polygon that
 *    covers the point in the XZ plane, sort them by height and keep the ones that have enough
 *    headroom above them. `upSign` decides which side of a polygon is the "up" side, because some
 *    level generators write mirrored geometry (the polygon normals point down on the floors);
 * 2. links -- two anchors get linked when they are within `linkDistance` and a horizontal ray
 *    between them (at `linkRayHeight` above the floor) is not blocked by any polygon. The ray is
 *    deliberately low (20): it has to be below the obstacles that a walking NPC cannot cross, not
 *    above them (`60` let the links pass over the 40..55 unit tall stone blocks of the test map);
 * 3. audit -- the generator re-tests the final links at several heights and counts the anchors that
 *    have geometry right above them, so a bad graph cannot slip through unnoticed.
 *
 * The output mirrors the FTS anchor format: an ordered list of positions + linked anchor indices.
 *
 * IMPORTANT: in the Arx level format the **Y axis points down**, so "up" is `-Y`. Every vertical
 * decision in this file is expressed as a *height above the floor* and converted with
 * {@link above}, never by adding to `y` directly. Evidence: the floors of the original levels have
 * `norm.y ~ -1` (checked on level 11 at a known player position), `FAST_ANCHOR_DATA.height` is
 * -165 (the height of the NPC, measured upwards), the anchors' debug ticks are drawn towards
 * `pos.y + height` and they point at the sky, and the level generators place the moon at a
 * negative Y.
 */

/** a point `distance` above `y` (up is -Y) */
const above = (y, distance) => y - distance

/**
 * Bumped on every change of this file. It is written into the debug payload, so we can tell
 * whether the editor is really running the fresh worker bundle.
 */
export const ANCHOR_GENERATOR_VERSION = 11

/** @see https://github.com/arx/ArxLibertatis/blob/1.2.1/src/graphics/GraphicsTypes.h#L88 */
const FLAG = {
  NoShadow: 1 << 0,
  DoubleSided: 1 << 1,
  Transparent: 1 << 2,
  Water: 1 << 3,
  Glow: 1 << 4,
  Ignore: 1 << 5,
  Quad: 1 << 6,
  Tiled: 1 << 7,
  Metal: 1 << 8,
  Hide: 1 << 9,
  Stone: 1 << 10,
  Wood: 1 << 11,
  Gravel: 1 << 12,
  Earth: 1 << 13,
  NoCollision: 1 << 14,
  Lava: 1 << 15,
  Climbable: 1 << 16,
  Falling: 1 << 17,
  NoPath: 1 << 18,
  NoDraw: 1 << 19,
  PrecisePath: 1 << 20,
  LateMip: 1 << 27,
}

/** Polygons with these flags are never walkable surfaces. */
export const UNWALKABLE_FLAGS =
  FLAG.Transparent |
  FLAG.Water |
  FLAG.Lava |
  FLAG.Climbable |
  FLAG.NoCollision |
  FLAG.Ignore |
  FLAG.NoDraw |
  FLAG.NoPath |
  FLAG.Hide

export const ANCHOR_DEFAULTS = {
  /** the distance between two anchor candidates (measured: ~100 on the original levels) */
  gridSize: 100,
  /** two anchors are linked within this distance (measured: max 200 on the original levels) */
  linkDistance: 200,
  /** links are only created when the floor height difference is at most this (stairs, steps) */
  maxStepHeight: 70,
  /** how deep a link may descend (the NPC can drop, it cannot climb this much) */
  maxDropHeight: 150,
  /** below this much free space above a surface there is no anchor (the player is ~160 tall) */
  minHeadroom: 150,
  /**
   * The links are tested with a horizontal ray at this height above the floor.
   *
   * This is the "feet clearance": the ray has to be low enough that the obstacles a walking NPC
   * cannot cross block it, but high enough that the small bumps of a terrain mesh do not. On the
   * level30 test map a ray at 60 passed **over** the ~40..55 unit tall stone blocks (52 links went
   * straight through them and the NPC got stuck on the blocks), while at 20 the stones block the
   * links and the gravel bumps (max ~12) do not. Measuring on other levels is still needed: stairs
   * could need a slightly higher value (see the README).
   */
  linkRayHeight: 20,
  /**
   * Legacy: the two sidelines offset by this radius had to be clear. The cylinder sweep below
   * replaced it (0 = off), it could not see the narrow gaps between the fence posts.
   */
  linkCorridorRadius: 0,
  /**
   * The NPC's body used for the link validation: a vertical cylinder swept along the link.
   *
   * `GetIORadius()` is `clamp(radius * scale, 25, 60)` and `GetIOHeight()` is ~160. The FTS anchor
   * `radius` field is 50 in every original level, and the game only lets an NPC use an anchor whose
   * `radius` is at least the NPC's radius -- so 50 is the widest body the graph has to work for.
   * The measured goblin cylinder (the in-game `Shapes` debug view) is ~50 as well. Validating with
   * 50 costs a few links/anchors near the walls (277 anchors / 590 links instead of 323 / 832) but
   * it means every NPC has a route.
   */
  linkBodyRadius: 30,
  linkBodyHeight: 160,
  /** the cylinder starts this much above the floor (the feet are not an obstacle) */
  linkBodyBottomOffset: 5,
  /** the link is sampled this often when the body is swept along it */
  linkBodySampleDistance: 20,
  /**
   * The fraction of the link skipped at both ends. The anchors are on walkable surfaces and the NPC
   * only has to *pass* between them, so the volume right at the anchor does not have to be free for
   * the whole body: an anchor 10 units from a block is still usable (the collision pushes the NPC
   * out, and the pathfinding tolerance is 30..60 units). Testing the whole link would drop every
   * anchor that happens to be close to a block.
   */
  linkBodyMargin: 0.25,
  /** the floor under the body is followed within this height difference */
  linkBodyStepUp: 60,
  /** the audit reports how many of the final links a body of these radii could walk */
  auditBodyRadii: [25, 35, 50],
  /**
   * Coverage pass: sample the centroid of every walkable polygon that the grid missed, so the graph
   * also covers small islands (the tops of the stone blocks) and not just the 100 unit grid points.
   */
  coverage: true,
  /**
   * Reject an anchor where the NPC's body does not fit (closer to a wall than the body radius).
   * Such an anchor is unusable: the collision pushes the NPC away from it, and in the debug view it
   * shows up as a line of anchors hugging the wall.
   */
  anchorClearance: true,
  /**
   * The radius of the free space an anchor needs. It is deliberately smaller than `linkBodyRadius`:
   * the NPC's centre does not have to be a full body away from the wall to *stand* there (the
   * collision pushes it), but the link between two anchors has to fit the body. A smaller value
   * keeps the grid closer to the walls, which matches the density of the original levels.
   */
  anchorClearanceRadius: 20,
  /** the minimum distance between two anchors (the coverage pass used to create dense clusters) */
  anchorMinDistance: 50,
  /** the coverage pass only samples surfaces this flat (the bevels of the pillars are steeper) */
  coverageMinAbsNormalY: 0.9,
  /** a polygon is "covered" when an anchor is closer than this in XZ */
  coverageRadius: 60,
  /** ... and closer than this in height (so a block top is not covered by the ground anchors) */
  coverageHeightRadius: 25,
  /**
   * Skip the small polygons. The coverage pass used to add anchors on top of every barrel, box,
   * shelf and tree branch (they are horizontal-ish and walkable in the format), which showed up as
   * dense "tangles" in the debug view and could steal the game's nearest-anchor search. 2000 is
   * about 45x45 units: furniture and props are below it, real floor pieces above it.
   */
  coverageMinArea: 2000,
  /**
   * The fixed-height ray also ignores vertical faces that are at most this tall (stair risers, the
   * sides of the low blocks): the NPC can climb them. 0 = every hit counts.
   */
  rayStepAllowance: 60,
  /**
   * Reconnect the pockets that the strict body test cut off from the main graph, through the widest
   * available passage (the body radius is reduced for that link only).
   */
  repairConnectivity: true,
  /** how many components may be repaired */
  repairConnectivityLimit: 50,
  /** the narrowest body radius the repair accepts */
  repairMinRadius: 5,
  repairRadiusStep: 5,
  /**
   * Retry the unlinked grid neighbours with a reduced body radius (the local holes of the strict
   * body test). `gapFillDistance` should stay around the grid diagonal so it does not create long
   * shortcuts.
   */
  gapFill: true,
  gapFillDistance: 200,
  dropUnreachableComponents: true,
  gapFillMinRadius: 5,
  /** the audit reports how many of the final links cross geometry at these heights above the floor */
  auditRayHeights: [20, 40, 60, 120],
  /** an anchor is reported when a surface is this close above it (should never happen) */
  auditRoofDistance: 150,
  /** a surface is horizontal-ish when `abs(normal.y)` reaches this */
  minAbsNormalY: 0.6,
  /** surfaces closer than this in height are treated as the same surface */
  surfaceMergeDistance: 5,
  /** restrict the anchors to this inclusive Z range; `null` = the whole level */
  minZ: null,
  maxZ: null,
  /** `1` = the polygon normal points up, `-1` = down (mirrored geometry), `'auto'` = guess */
  /**
   * The FTS format's Y axis is inverted: **up is -Y**, on every level (the floor normals of the
   * original levels are ~-0.98, and the anchor height of the format is negative). It is a format
   * constant, so it is not detected: a room's ceiling balances its floor, which makes any
   * area-based vote a coin flip (measured 49-59% across levels 0, 1, 4, 12, 16).
   */
  upSign: -1,
  /** polygons that are never walkable (ignored unless the caller overrides it) */
  unwalkableFlags: UNWALKABLE_FLAGS,
  /** drop the anchors that ended up without any link (the game ignores them anyway) */
  dropIsolated: true,
  /**
   * Drop the connected components smaller than this. A handful of anchors on a tiny island is not
   * useful (the NPC would wander in a 300 unit circle) and the game's nearest-anchor search could
   * pick one. The real pockets (e.g. the strip outside the fence) are bigger than this.
   */
  minComponentSize: 20,
  /** skip the link ray test when it is disabled (debug only) */
  skipLinkRaycast: false,
}

// --------------------
// small vector helpers

const v3 = (x, y, z) => ({ x, y, z })

const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z)
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z

// ---------------------------
// polygon helpers (XZ plane)

export function isQuad(polygon) {
  return (polygon.flags & FLAG.Quad) !== 0
}

/** the vertex indices of the triangles of a polygon, matching the game's triangulation */
export function triangleVertexIndices(polygon) {
  return isQuad(polygon) ? [[0, 1, 2], [2, 1, 3]] : [[0, 1, 2]]
}

/**
 * The height of the polygon surface at the given XZ point (barycentric interpolation), or `null`
 * when the point is outside the polygon.
 */
export function surfaceHeightAt(polygon, x, z, epsilon = 1e-7) {
  for (const [ia, ib, ic] of triangleVertexIndices(polygon)) {
    const a = polygon.vertices[ia]
    const b = polygon.vertices[ib]
    const c = polygon.vertices[ic]

    const v0x = b.x - a.x
    const v0z = b.z - a.z
    const v1x = c.x - a.x
    const v1z = c.z - a.z
    const v2x = x - a.x
    const v2z = z - a.z

    const den = v0x * v1z - v1x * v0z
    if (Math.abs(den) < 1e-9) {
      continue
    }

    const u = (v2x * v1z - v1x * v2z) / den
    const v = (v0x * v2z - v2x * v0z) / den
    const w = 1 - u - v

    if (u < -epsilon || v < -epsilon || w < -epsilon) {
      continue
    }

    return w * a.y + u * b.y + v * c.y
  }

  return null
}

// ----------------------------------
// 2D (XZ) spatial index of polygons

class PolygonIndex {
  constructor(cellSize) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  static key(ix, iz) {
    return `${ix},${iz}`
  }

  add(polygonIndex, polygon) {
    const xs = polygon.vertices.slice(0, isQuad(polygon) ? 4 : 3).map((v) => v.x)
    const zs = polygon.vertices.slice(0, isQuad(polygon) ? 4 : 3).map((v) => v.z)
    const minX = Math.floor(Math.min(...xs) / this.cellSize)
    const maxX = Math.floor(Math.max(...xs) / this.cellSize)
    const minZ = Math.floor(Math.min(...zs) / this.cellSize)
    const maxZ = Math.floor(Math.max(...zs) / this.cellSize)

    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const key = PolygonIndex.key(ix, iz)
        let bucket = this.cells.get(key)
        if (bucket === undefined) {
          bucket = []
          this.cells.set(key, bucket)
        }
        bucket.push(polygonIndex)
      }
    }
  }

  /** polygon indices whose cell overlaps the point (superset: the caller still has to test) */
  queryPoint(x, z) {
    return this.cells.get(PolygonIndex.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize))) ?? []
  }

  queryBox(minX, minZ, maxX, maxZ) {
    const ix0 = Math.floor(minX / this.cellSize)
    const ix1 = Math.floor(maxX / this.cellSize)
    const iz0 = Math.floor(minZ / this.cellSize)
    const iz1 = Math.floor(maxZ / this.cellSize)
    const result = new Set()

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const bucket = this.cells.get(PolygonIndex.key(ix, iz))
        if (bucket === undefined) {
          continue
        }
        for (const polygonIndex of bucket) {
          result.add(polygonIndex)
        }
      }
    }

    return result
  }
}

// -------------------------------
// segment / triangle intersection

function segmentHitsTriangle(a, b, p0, p1, p2) {
  const dir = sub(b, a)
  const e1 = sub(p1, p0)
  const e2 = sub(p2, p0)
  const h = cross(dir, e2)
  const det = dot(e1, h)

  if (Math.abs(det) < 1e-9) {
    return false
  }

  const f = 1 / det
  const s = sub(a, p0)
  const u = f * dot(s, h)
  if (u < 0 || u > 1) {
    return false
  }

  const q = cross(s, e1)
  const v = f * dot(dir, q)
  if (v < 0 || u + v > 1) {
    return false
  }

  const t = f * dot(e2, q)
  return t > 1e-4 && t < 1 - 1e-4
}

function segmentHitsPolygon(a, b, polygon) {
  for (const [ia, ib, ic] of triangleVertexIndices(polygon)) {
    if (segmentHitsTriangle(a, b, polygon.vertices[ia], polygon.vertices[ib], polygon.vertices[ic])) {
      return true
    }
  }

  return false
}

/**
 * `true` when anything is between `a` and `b`.
 */
export function isBlocked(a, b, polygons, index, options = {}) {
  const stepAllowance = options.stepAllowance ?? 0
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minZ = Math.min(a.z, b.z)
  const maxZ = Math.max(a.z, b.z)

  for (const polygonIndex of index.queryBox(minX, minZ, maxX, maxZ)) {
    const polygon = polygons[polygonIndex]
    if (isWaterPolygon(polygon)) {
      continue
    }
    if (!segmentHitsPolygon(a, b, polygon)) {
      continue
    }

    // A vertical face that is not taller than a climbable step is a stair riser (or the side of a
    // low block the NPC can step onto), not a wall: the game lets the NPC climb it, so the link is
    // valid. Without this the whole staircase is cut out of the graph.
    if (stepAllowance > 0 && Math.abs(polygon.norm.y) < 0.3) {
      const ys = polygon.vertices.slice(0, isQuad(polygon) ? 4 : 3).map((vertex) => vertex.y)
      if (Math.max(...ys) - Math.min(...ys) <= stepAllowance) {
        continue
      }
    }

    return true
  }

  return false
}

// ------------------------------------
// vertical cylinder (the NPC's body) vs. the geometry
//
// The links are not validated as a line but as the volume a walking NPC needs: a vertical cylinder
// of `radius` (the NPC's body) and `height` (from its feet to its head), swept along the link. A
// cylinder test is what answers the real question ("can an NPC fit through here?") because the
// collision in the game is exactly a cylinder (`GetIOCyl()` / `ARX_COLLISION_Move_Cylinder()`).

/**
 * The closest point of a triangle's XZ projection to `(x, z)`, together with the barycentric
 * weights, so the caller can get the surface height at that point.
 */
function closestPointOnTriangle2D(x, z, a, b, c) {
  const area = (c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)

  // A vertical polygon's XZ projection is a *line* (a degenerate triangle). It has no interior, so
  // the point can only be close to its edges -- it must not be skipped: this is the case that
  // matters for walls, fence posts and the sides of the blocks.
  if (Math.abs(area) >= 1e-9) {
    const d1 = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)
    const d2 = (c.x - b.x) * (z - b.z) - (c.z - b.z) * (x - b.x)
    const d3 = (a.x - c.x) * (z - c.z) - (a.z - c.z) * (x - c.x)
    const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
    const hasPositive = d1 > 0 || d2 > 0 || d3 > 0

    if (!(hasNegative && hasPositive)) {
      // inside the triangle: barycentric coordinates from the edge distances
      const u = ((c.x - a.x) * (z - a.z) - (c.z - a.z) * (x - a.x)) / area
      const v = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / area
      const w = 1 - u - v
      return { distance: 0, x, z, y: w * a.y + u * b.y + v * c.y, u, v, w }
    }
  }

  // outside (or degenerate): the closest point is on one of the three edges
  let best = null
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const dx = q.x - p.x
    const dz = q.z - p.z
    const lengthSquared = dx * dx + dz * dz
    let t = lengthSquared === 0 ? 0 : ((x - p.x) * dx + (z - p.z) * dz) / lengthSquared
    t = Math.max(0, Math.min(1, t))
    const px = p.x + t * dx
    const pz = p.z + t * dz
    const distance = Math.hypot(x - px, z - pz)
    if (best === null || distance < best.distance) {
      best = { distance, x: px, z: pz, y: p.y + t * (q.y - p.y) }
    }
  }

  return best
}

/**
 * `true` when the vertical cylinder `[bottom, top]` around `(x, z)` intersects the polygon.
 *
 * Horizontal-ish polygons are compared by their surface height at the closest point (so the bumpy
 * floor the NPC walks on never blocks), vertical ones (walls, posts, the sides of the blocks) by
 * their height range.
 */
function cylinderHitsPolygon(x, z, radius, yMin, yMax, polygon, floorY, stepUp) {
  if (isWaterPolygon(polygon)) {
    return false
  }

  let hit = false

  for (const [ia, ib, ic] of triangleVertexIndices(polygon)) {
    const closest = closestPointOnTriangle2D(x, z, polygon.vertices[ia], polygon.vertices[ib], polygon.vertices[ic])
    if (closest === null || closest.distance > radius) {
      continue
    }

    if (Math.abs(polygon.norm.y) >= 0.3) {
      // a floor / ceiling / slope: only the surface at the closest point matters
      if (closest.y > yMin && closest.y < yMax) {
        hit = true
      }
    } else {
      // A vertical face. It is only an obstacle when it rises more than a climbable step above the
      // feet: the risers of a staircase are vertical faces too, and a step (up to
      // `linkBodyStepUp`) must not block the link. Up is -Y, so the *top* of the face is its
      // smallest y.
      const ys = [polygon.vertices[ia].y, polygon.vertices[ib].y, polygon.vertices[ic].y]
      const polygonTop = Math.min(...ys)
      const polygonBottom = Math.max(...ys)
      const risesAboveTheFeet = floorY - polygonTop
      if (risesAboveTheFeet > stepUp && polygonBottom > yMin && polygonTop < yMax) {
        hit = true
      }
    }

    if (hit) {
      return true
    }
  }

  return false
}

/**
 * The height the NPC's feet would be at `(x, z)`: the **highest** walkable surface inside the
 * body's footprint that is still climbable (`<= referenceY + linkBodyStepUp`).
 *
 * The footprint matters: on a bumpy floor or on a step the NPC stands on the highest point under
 * it, so a bump inside the footprint must not count as an obstacle. A surface that is *higher* than
 * the climb limit is not a floor for this step -- that is a wall/box the body collides with.
 */
function footFloorHeight(x, z, referenceY, radius, polygons, index, settings, upSign) {
  let floorY = referenceY
  const candidates = index.queryBox(x - radius, z - radius, x + radius, z + radius)

  for (const polygonIndex of candidates) {
    const polygon = polygons[polygonIndex]
    if (isWaterPolygon(polygon)) {
      continue
    }
    if (Math.abs(polygon.norm.y) < settings.minAbsNormalY) {
      continue
    }
    if (isUnwalkableByFlags(polygon, settings.unwalkableFlags)) {
      continue
    }
    if (polygon.norm.y * upSign < settings.minAbsNormalY) {
      continue
    }

    let bestY = Infinity
    for (const [ia, ib, ic] of triangleVertexIndices(polygon)) {
      const closest = closestPointOnTriangle2D(x, z, polygon.vertices[ia], polygon.vertices[ib], polygon.vertices[ic])
      if (closest === null || closest.distance > radius) {
        continue
      }
      bestY = Math.min(bestY, closest.y)
    }

    if (bestY === Infinity) {
      continue
    }
    // up is -Y: the *highest* climbable surface has the smallest y
    if (bestY >= referenceY - settings.linkBodyStepUp && bestY < floorY) {
      floorY = bestY
    }
  }

  return floorY
}

/**
 * Sweeps the NPC's cylinder along the link and returns the first thing it would collide with
 * (or `null`). The returned object is also used by the debugging tools to explain a rejected link.
 *
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 */
export function findBodyBlocker(a, b, polygons, index, settings, upSign) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const samples = Math.max(2, Math.ceil((length * (1 - 2 * settings.linkBodyMargin)) / settings.linkBodySampleDistance))
  const minX = Math.min(a.x, b.x) - settings.linkBodyRadius
  const maxX = Math.max(a.x, b.x) + settings.linkBodyRadius
  const minZ = Math.min(a.z, b.z) - settings.linkBodyRadius
  const maxZ = Math.max(a.z, b.z) + settings.linkBodyRadius
  const candidates = [...index.queryBox(minX, minZ, maxX, maxZ)]

  for (let sample = 0; sample <= samples; sample++) {
    const t = settings.linkBodyMargin + (sample / samples) * (1 - 2 * settings.linkBodyMargin)
    const x = a.x + dx * t
    const z = a.z + dz * t
    const referenceY = a.y + (b.y - a.y) * t
    // the NPC's feet follow the highest climbable surface under its footprint
    const floorY = footFloorHeight(x, z, referenceY, settings.linkBodyRadius, polygons, index, settings, upSign)
    // up is -Y: the body occupies y in [floor - height, floor - offset]
    const yTop = above(floorY, settings.linkBodyHeight)
    const yBottom = above(floorY, settings.linkBodyBottomOffset)

    for (const polygonIndex of candidates) {
      if (
        cylinderHitsPolygon(
          x,
          z,
          settings.linkBodyRadius,
          yTop,
          yBottom,
          polygons[polygonIndex],
          floorY,
          settings.linkBodyStepUp,
        )
      ) {
        return { x, z, floorY, bottom: yBottom, top: yTop, polygonIndex, polygon: polygons[polygonIndex] }
      }
    }
  }

  return null
}

/** `true` when the NPC's body would collide with something while walking the link. */
export function isBodyBlocked(a, b, polygons, index, settings, upSign) {
  return findBodyBlocker(a, b, polygons, index, settings, upSign) !== null
}

// -----------------------------------
// walkability / surface classification

export function isHorizontal(polygon, minAbsNormalY) {
  return Math.abs(polygon.norm.y) >= minAbsNormalY
}

/**
 * The "do not use this polygon" flag test. The water surface of the original levels is usually
 * flagged `Transparent | Water`, so the transparency must not exclude it: water is walkable (the
 * player swims, the anchors of the original levels are there too). Lava stays excluded.
 */
/**
 * Water (and other "not solid" surfaces) is *ignored* by the generator: no anchor on it, and it does
 * not block anything either. The walkable surface is the solid mesh *under* the water (the riverbed),
 * which is what the original levels' anchors follow.
 */
export function isWaterPolygon(polygon) {
  return (polygon.flags & FLAG.Water) !== 0
}

export function isUnwalkableByFlags(polygon, unwalkableFlags) {
  return (polygon.flags & unwalkableFlags) !== 0
}

export function isWalkableSurface(polygon, { upSign, unwalkableFlags, minAbsNormalY }) {
  if (isUnwalkableByFlags(polygon, unwalkableFlags)) {
    return false
  }

  return polygon.norm.y * upSign >= minAbsNormalY
}

/**
 * Levels built with three.js got their Y axis mirrored by the generators
 * (`toArxCoordinateSystem()` scales Y by -1), which flips the polygon winding, so the floor
 * normals point down. The game does not care about the normal direction when it renders or walks,
 * but we need to know which side of the polygons is up. When the number of downward normals is
 * much larger than the upward ones, the level is mirrored.
 */
/**
 * A step is only climbable *upward*: the NPC walks off a ledge of any height (gravity does the
 * work) but it cannot climb more than `maxStepHeight`. In the FTS the up direction is -Y, so the
 * rise from `fromY` to `toY` is `(fromY - toY) * -upSign`.
 */
function isStepAllowed(fromY, toY, upSign, settings) {
  const rise = (fromY - toY) * -upSign
  return rise <= settings.maxStepHeight && -rise <= settings.maxDropHeight
}

export function detectUpSign(polygons, minAbsNormalY = 0.6) {
  let up = 0
  let down = 0

  for (const polygon of polygons) {
    if (polygon.norm.y >= minAbsNormalY) {
      up++
    } else if (polygon.norm.y <= -minAbsNormalY) {
      down++
    }
  }

  return { up, down, upSign: up >= down ? 1 : -1 }
}

// ------------------------------------
// anchor candidate sampling + linking

/**
 * @param {Array<{ vertices: Array<{x: number, y: number, z: number}>, norm: {x: number, y: number, z: number}, flags: number }>} polygons
 * @param {object} [options] see {@link ANCHOR_DEFAULTS}
 */
export function generateAnchors(polygons, options = {}) {
  const settings = { ...ANCHOR_DEFAULTS, ...options }
  const index = new PolygonIndex(Math.max(settings.gridSize, 100))

  polygons.forEach((polygon, polygonIndex) => {
    index.add(polygonIndex, polygon)
  })

  let upSign = settings.upSign
  let upSignInfo = { up: 0, down: 0 }
  if (upSign === 'auto') {
    upSignInfo = detectUpSign(polygons, settings.minAbsNormalY)
    upSign = upSignInfo.upSign
  }

  const classificationOptions = {
    upSign,
    unwalkableFlags: settings.unwalkableFlags,
    minAbsNormalY: settings.minAbsNormalY,
  }

  // --------
  // 1. bounds
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const polygon of polygons) {
    for (const vertex of polygon.vertices.slice(0, isQuad(polygon) ? 4 : 3)) {
      bounds.minX = Math.min(bounds.minX, vertex.x)
      bounds.maxX = Math.max(bounds.maxX, vertex.x)
      bounds.minZ = Math.min(bounds.minZ, vertex.z)
      bounds.maxZ = Math.max(bounds.maxZ, vertex.z)
      bounds.minY = Math.min(bounds.minY, vertex.y)
      bounds.maxY = Math.max(bounds.maxY, vertex.y)
    }
  }

  const minZ = settings.minZ ?? bounds.minZ
  const maxZ = settings.maxZ ?? bounds.maxZ
  const startX = Math.ceil(bounds.minX / settings.gridSize) * settings.gridSize
  const startZ = Math.ceil(minZ / settings.gridSize) * settings.gridSize
  const endX = Math.floor(bounds.maxX / settings.gridSize) * settings.gridSize
  const endZ = Math.floor(maxZ / settings.gridSize) * settings.gridSize

  const stats = {
    gridPoints: 0,
    gridPointsWithSurface: 0,
    gridPointsWithAnchor: 0,
    coveragePoints: 0,
    coverageAnchors: 0,
    surfaces: 0,
    rejectedNoHeadroom: 0,
    rejectedNotAFloor: 0,
    rejectedClearance: 0,
    rejectedFlags: 0,
    rejectedMerge: 0,
    upSign,
    ...upSignInfo,
    bounds,
    grid: { startX, endX, startZ, endZ, step: settings.gridSize },
  }

  // ------------------
  // 2. anchor candidates
  const anchors = []
  // spatial hash of the accepted anchors, used to enforce `anchorMinDistance`
  const spacingCell = Math.max(50, settings.anchorMinDistance)
  const spacingHash = new Map()
  const spacingKey = (x, y, z) =>
    `${Math.floor(x / spacingCell)},${Math.floor(y / spacingCell)},${Math.floor(z / spacingCell)}`
  const anchorsNear = (position) => {
    const ix = Math.floor(position.x / spacingCell)
    const iy = Math.floor(position.y / spacingCell)
    const iz = Math.floor(position.z / spacingCell)
    const result = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = spacingHash.get(`${ix + dx},${iy + dy},${iz + dz}`)
          if (bucket !== undefined) {
            result.push(...bucket)
          }
        }
      }
    }
    return result
  }

  /**
   * The anchors that can be placed at one XZ point: the surfaces covering it, from the top down,
   * with enough headroom above them and a walkable ("floor") normal.
   */
  const samplePoint = (x, z, collectStats = true) => {
    const positions = []

    // every horizontal-ish polygon that covers this point, from the highest to the lowest
    const surfaces = []
    for (const polygonIndex of index.queryPoint(x, z)) {
      const polygon = polygons[polygonIndex]
      if (isWaterPolygon(polygon)) {
        continue
      }
      if (!isHorizontal(polygon, settings.minAbsNormalY)) {
        continue
      }
      const y = surfaceHeightAt(polygon, x, z)
      if (y === null) {
        continue
      }
      surfaces.push({ y, polygon, polygonIndex })
    }

    if (surfaces.length === 0) {
      return positions
    }

    if (collectStats) {
      stats.gridPointsWithSurface++
      stats.surfaces += surfaces.length
    }

    // up is -Y: the smallest y is the highest surface, so the stack is built from the top down
    surfaces.sort((a, b) => a.y - b.y)

    // merge the surfaces that are practically at the same height (shared edges of coplanar
    // triangles, the two triangles of a quad, ...)
    const merged = []
    for (const surface of surfaces) {
      const last = merged.at(-1)
      if (last !== undefined && Math.abs(last.y - surface.y) <= settings.surfaceMergeDistance) {
        if (collectStats) {
          stats.rejectedMerge++
        }
        // prefer the walkable one when two polygons overlap at the same height
        if (!isWalkableSurface(last.polygon, classificationOptions) && isWalkableSurface(surface.polygon, classificationOptions)) {
          merged[merged.length - 1] = surface
        }
        continue
      }
      merged.push(surface)
    }

    for (const [i, surface] of merged.entries()) {
      // the free space above this surface (the next surface above it = the previous entry, or
      // the sky)
      const headroom = i === 0 ? Infinity : surface.y - merged[i - 1].y
      if (headroom < settings.minHeadroom) {
        if (collectStats) {
          stats.rejectedNoHeadroom++
        }
        continue
      }

      if (!isWalkableSurface(surface.polygon, classificationOptions)) {
        if (collectStats) {
          stats.rejectedNotAFloor++
        }
        continue
      }

      if (isUnwalkableByFlags(surface.polygon, settings.unwalkableFlags)) {
        if (collectStats) {
          stats.rejectedFlags++
        }
        continue
      }

      const position = v3(x, surface.y, z)

      if (settings.anchorClearance) {
        // a zero length body sweep at the anchor: does the NPC fit here at all?
        const clearanceSettings = {
          ...settings,
          linkBodyMargin: 0,
          linkBodyRadius: settings.anchorClearanceRadius ?? settings.linkBodyRadius,
        }
        if (findBodyBlocker(position, position, polygons, index, clearanceSettings, upSign) !== null) {
          if (collectStats) {
            stats.rejectedClearance++
          }
          continue
        }
      }

      positions.push({ position, linkedAnchors: [], polygonIndex: surface.polygonIndex })
    }

    return positions
  }

  const addAnchor = (anchor) => {
    // keep a minimum distance between the anchors: the coverage pass proposes the centroid of every
    // walkable polygon, and on a bumpy floor or around a pillar that would create a dense, uneven
    // clump next to the regular grid
    for (const other of anchorsNear(anchor.position)) {
      const distance = Math.hypot(
        other.position.x - anchor.position.x,
        other.position.y - anchor.position.y,
        other.position.z - anchor.position.z,
      )
      if (distance < settings.anchorMinDistance) {
        return false
      }
    }

    const key = spacingKey(anchor.position.x, anchor.position.y, anchor.position.z)
    let bucket = spacingHash.get(key)
    if (bucket === undefined) {
      bucket = []
      spacingHash.set(key, bucket)
    }
    bucket.push(anchor)
    anchors.push(anchor)
    return true
  }

  // 2a. the grid pass
  for (let z = startZ; z <= endZ; z += settings.gridSize) {
    for (let x = startX; x <= endX; x += settings.gridSize) {
      stats.gridPoints++
      const found = samplePoint(x, z).filter(addAnchor)
      if (found.length > 0) {
        stats.gridPointsWithAnchor++
      }
    }
  }

  // 2b. the coverage pass
  //
  // The 100 unit grid can miss small walkable islands: the test map's stone blocks are 80 wide and
  // they sit between the grid lines, so the graph never reached their tops even though the NPC can
  // step onto them (the step is ~50, well below `maxStepHeight`). For every walkable polygon that
  // has no anchor near it we sample its centroid: the graph then spreads over the whole walkable
  // surface ("like a sheet"), including the tops of the blocks.
  if (settings.coverage) {
    for (const polygon of polygons) {
      if (!isWalkableSurface(polygon, classificationOptions)) {
        continue
      }
      if (isUnwalkableByFlags(polygon, settings.unwalkableFlags)) {
        continue
      }
      if (!isHorizontal(polygon, settings.coverageMinAbsNormalY)) {
        continue
      }
      if (polygon.area < settings.coverageMinArea) {
        continue
      }

      const used = polygon.vertices.slice(0, isQuad(polygon) ? 4 : 3)
      const cx = used.reduce((sum, vertex) => sum + vertex.x, 0) / used.length
      const cz = used.reduce((sum, vertex) => sum + vertex.z, 0) / used.length
      // respect the requested area even when the caller restricts it (the coverage pass would
      // otherwise add anchors outside the grid pass' range)
      if (cz < minZ || cz > maxZ) {
        continue
      }
      const surfaceY = surfaceHeightAt(polygon, cx, cz)
      if (surfaceY === null) {
        continue
      }

      const covered = anchors.some(
        (anchor) =>
          Math.abs(anchor.position.x - cx) < settings.coverageRadius &&
          Math.abs(anchor.position.z - cz) < settings.coverageRadius &&
          Math.abs(anchor.position.y - surfaceY) < settings.coverageHeightRadius,
      )
      if (covered) {
        continue
      }

      stats.coveragePoints++
      if (samplePoint(cx, cz, false).filter(addAnchor).length > 0) {
        stats.coverageAnchors++
      }
    }
  }

  // ------------
  // 3. anchor links
  const hashCell = settings.linkDistance
  const anchorHash = new Map()
  const hashKey = (x, z) => `${Math.floor(x / hashCell)},${Math.floor(z / hashCell)}`

  anchors.forEach((anchor, anchorIndex) => {
    const key = hashKey(anchor.position.x, anchor.position.z)
    let bucket = anchorHash.get(key)
    if (bucket === undefined) {
      bucket = []
      anchorHash.set(key, bucket)
    }
    bucket.push(anchorIndex)
  })

  let blockedLinks = 0
  let narrowLinks = 0
  let bodyLinks = 0
  let stepLinks = 0

  for (const [anchorIndex, anchor] of anchors.entries()) {
    const ix = Math.floor(anchor.position.x / hashCell)
    const iz = Math.floor(anchor.position.z / hashCell)
    const candidates = []

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = anchorHash.get(`${ix + dx},${iz + dz}`)
        if (bucket === undefined) {
          continue
        }
        for (const otherIndex of bucket) {
          if (otherIndex <= anchorIndex) {
            continue
          }
          candidates.push(otherIndex)
        }
      }
    }

    for (const otherIndex of candidates) {
      const other = anchors[otherIndex]
      const dx = other.position.x - anchor.position.x
      const dy = other.position.y - anchor.position.y
      const dz = other.position.z - anchor.position.z
      const distance = Math.hypot(dx, dy, dz)

      if (distance > settings.linkDistance) {
        continue
      }

      if (!isStepAllowed(anchor.position.y, other.position.y, upSign, settings)) {
        stepLinks++
        continue
      }

      if (!settings.skipLinkRaycast) {
        const from = v3(anchor.position.x, above(anchor.position.y, settings.linkRayHeight), anchor.position.z)
        const to = v3(other.position.x, above(other.position.y, settings.linkRayHeight), other.position.z)
        if (isBlocked(from, to, polygons, index, { stepAllowance: settings.rayStepAllowance })) {
          blockedLinks++
          continue
        }

        // Legacy corridor test (off by default, the body test below is stricter and correct).
        if (settings.linkCorridorRadius > 0) {
          const length = Math.hypot(dx, dz)
          const perpX = length === 0 ? 0 : dz / length
          const perpZ = length === 0 ? 0 : -dx / length
          const r = settings.linkCorridorRadius
          const leftFrom = v3(from.x + perpX * r, from.y, from.z + perpZ * r)
          const leftTo = v3(to.x + perpX * r, to.y, to.z + perpZ * r)
          const rightFrom = v3(from.x - perpX * r, from.y, from.z - perpZ * r)
          const rightTo = v3(to.x - perpX * r, to.y, to.z - perpZ * r)
          if (isBlocked(leftFrom, leftTo, polygons, index) || isBlocked(rightFrom, rightTo, polygons, index)) {
            narrowLinks++
            continue
          }
        }

        // The NPC's body (a vertical cylinder) is swept along the link: this is what the game's
        // collision uses, so a link that passes is one the NPC can actually walk.
        if (settings.linkBodyRadius > 0) {
          const bodySettings = {
            ...settings,
            linkBodyRadius: settings.linkBodyRadius,
          }
          if (isBodyBlocked(anchor.position, other.position, polygons, index, bodySettings, upSign)) {
            bodyLinks++
            continue
          }
        }
      }

      anchor.linkedAnchors.push(otherIndex)
      other.linkedAnchors.push(anchorIndex)
    }
  }

  // -------------------------------------------------------------
  // 4. drop the anchors that have no links (the game ignores them)
  let droppedIsolated = 0
  let result = anchors

  if (settings.dropIsolated) {
    const kept = []
    const remap = new Map()

    anchors.forEach((anchor, anchorIndex) => {
      if (anchor.linkedAnchors.length === 0) {
        droppedIsolated++
        return
      }
      remap.set(anchorIndex, kept.length)
      kept.push(anchor)
    })

    result = kept.map((anchor) => {
      return {
        ...anchor,
        linkedAnchors: anchor.linkedAnchors.map((linkedIndex) => remap.get(linkedIndex)).filter((i) => i !== undefined).sort((a, b) => a - b),
      }
    })
  }

  // -------------------------------------------------------------------------------------------
  // 4a. connectivity repair
  //
  // The strict body test can cut a pocket off from the main graph (a doorway narrower than the
  // body, a ledge in the air). The original levels' graph connects those pockets, so the generator
  // reconnects every component to the main one through the *widest available passage*: the body
  // radius is reduced only for the added link, and the link is recorded (radius + positions) so the
  // debug payload can show where and how narrow the passage is.
  const repairedLinks = []
  const gapFilledLinks = []
  const unreachableComponents = []

  if (settings.repairConnectivity && result.length > 1) {
    const radiusSteps = []
    for (let radius = settings.linkBodyRadius; radius >= settings.repairMinRadius; radius -= settings.repairRadiusStep) {
      radiusSteps.push(radius)
    }

    const spatialCell = settings.linkDistance
    const spatialKey = (x, z) => `${Math.floor(x / spatialCell)},${Math.floor(z / spatialCell)}`
    const spatial = new Map()
    result.forEach((anchor, anchorIndex) => {
      const cellKey = spatialKey(anchor.position.x, anchor.position.z)
      let bucket = spatial.get(cellKey)
      if (bucket === undefined) {
        bucket = []
        spatial.set(cellKey, bucket)
      }
      bucket.push(anchorIndex)
    })

    const candidatePairs = []
    for (const [i, a] of result.entries()) {
      const ix = Math.floor(a.position.x / spatialCell)
      const iz = Math.floor(a.position.z / spatialCell)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of spatial.get(`${ix + dx},${iz + dz}`) ?? []) {
            if (j <= i) {
              continue
            }
            const b = result[j]
            const distance = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            if (distance > settings.linkDistance) {
              continue
            }
            if (!isStepAllowed(a.position.y, b.position.y, upSign, settings)) {
              continue
            }
            candidatePairs.push({ i, j, distance })
          }
        }
      }
    }

    candidatePairs.sort((a, b) => a.distance - b.distance)

    for (let round = 0; round < settings.repairConnectivityLimit; round++) {
      const parent = result.map((_, i) => i)
      const find = (i) => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]]
          i = parent[i]
        }
        return i
      }
      for (const [i, a] of result.entries()) {
        for (const j of a.linkedAnchors) {
          const rootA = find(i)
          const rootB = find(j)
          if (rootA !== rootB) {
            parent[rootA] = rootB
          }
        }
      }
      const sizes = new Map()
      result.forEach((_, i) => {
        const root = find(i)
        sizes.set(root, (sizes.get(root) ?? 0) + 1)
      })
      if (sizes.size <= 1) {
        break
      }
      let mainRoot = null
      let mainSize = 0
      for (const [root, size] of sizes) {
        if (size > mainSize) {
          mainSize = size
          mainRoot = root
        }
      }

      let repaired = false
      for (const radius of radiusSteps) {
        const pair = candidatePairs.find(({ i, j }) => {
          if (find(i) === find(j)) {
            return false
          }
          // always attach to the main component, so the repair does not merge two small pockets
          if (find(i) !== mainRoot && find(j) !== mainRoot) {
            return false
          }
          return !isBodyBlocked(result[i].position, result[j].position, polygons, index, { ...settings, linkBodyRadius: radius }, upSign)
        })
        if (pair === undefined) {
          continue
        }
        result[pair.i].linkedAnchors.push(pair.j)
        result[pair.j].linkedAnchors.push(pair.i)
        result[pair.i].linkedAnchors.sort((a, b) => a - b)
        result[pair.j].linkedAnchors.sort((a, b) => a - b)
        repairedLinks.push({
          a: result[pair.i].position,
          b: result[pair.j].position,
          distance: pair.distance,
          radius,
        })
        repaired = true
        break
      }
      if (!repaired) {
        break
      }
    }
  }

    // diagnostics: why did a component stay separate? The nearest pair to the main component and its
    // height difference tell whether the link distance, the step limit or the body test was the
    // blocker.
    {
      const parent = result.map((_, i) => i)
      const find = (i) => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]]
          i = parent[i]
        }
        return i
      }
      for (const [i, a] of result.entries()) {
        for (const j of a.linkedAnchors) {
          const rootA = find(i)
          const rootB = find(j)
          if (rootA !== rootB) {
            parent[rootA] = rootB
          }
        }
      }
      const sizes = new Map()
      result.forEach((_, i) => {
        const root = find(i)
        sizes.set(root, (sizes.get(root) ?? 0) + 1)
      })
      let mainRoot = null
      let mainSize = 0
      for (const [root, size] of sizes) {
        if (size > mainSize) {
          mainSize = size
          mainRoot = root
        }
      }
      for (const [root, size] of sizes) {
        if (root === mainRoot) {
          continue
        }
        let best = null
        for (const [i, a] of result.entries()) {
          if (find(i) !== root) {
            continue
          }
          for (const [j, b] of result.entries()) {
            if (find(j) !== mainRoot) {
              continue
            }
            const distance = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            if (best === null || distance < best.distance) {
              best = {
                componentAnchors: size,
                a: a.position,
                b: b.position,
                distance,
                dy: Math.abs(b.position.y - a.position.y),
              }
            }
          }
        }
        if (best !== null) {
          unreachableComponents.push(best)
        }
      }
    }

  // -------------------------------------------------------------------------------------------
  // 4a2. local gap fill
  //
  // The global repair only attaches whole components. A *single* missing connection inside the main
  // component (a grid neighbour that the strict body test rejected, e.g. a doorway narrower than the
  // body) is not covered by it. Every unlinked grid neighbour pair is retried with a reduced body
  // radius, so the local holes close up like in the original levels' graph.
  if (settings.gapFill) {
    const spatialCell = settings.linkDistance
    const spatial = new Map()
    const spatialKey = (x, z) => `${Math.floor(x / spatialCell)},${Math.floor(z / spatialCell)}`
    result.forEach((anchor, anchorIndex) => {
      const cellKey = spatialKey(anchor.position.x, anchor.position.z)
      let bucket = spatial.get(cellKey)
      if (bucket === undefined) {
        bucket = []
        spatial.set(cellKey, bucket)
      }
      bucket.push(anchorIndex)
    })

    const gapPairs = []
    for (const [i, a] of result.entries()) {
      const ix = Math.floor(a.position.x / spatialCell)
      const iz = Math.floor(a.position.z / spatialCell)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of spatial.get(`${ix + dx},${iz + dz}`) ?? []) {
            if (j <= i || a.linkedAnchors.includes(j)) {
              continue
            }
            const b = result[j]
            const distance = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
            if (distance > settings.gapFillDistance) {
              continue
            }
            if (!isStepAllowed(a.position.y, b.position.y, upSign, settings)) {
              continue
            }
            gapPairs.push({ i, j, distance })
          }
        }
      }
    }

    gapPairs.sort((a, b) => a.distance - b.distance)

    for (const { i, j, distance } of gapPairs) {
      for (let radius = settings.linkBodyRadius - settings.repairRadiusStep; radius >= settings.gapFillMinRadius; radius -= settings.repairRadiusStep) {
        if (isBodyBlocked(result[i].position, result[j].position, polygons, index, { ...settings, linkBodyRadius: radius }, upSign)) {
          continue
        }
        result[i].linkedAnchors.push(j)
        result[j].linkedAnchors.push(i)
        result[i].linkedAnchors.sort((a, b) => a - b)
        result[j].linkedAnchors.sort((a, b) => a - b)
        gapFilledLinks.push({ a: result[i].position, b: result[j].position, distance, radius })
        break
      }
    }
  }

  // -------------------------------------------------------------------
  // 4b. drop the tiny islands (they are not useful navigation targets)
  let droppedSmallComponent = 0
  let droppedUnreachable = 0

  if (settings.minComponentSize > 1 && result.length > 0) {
    const parent = result.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    for (const [anchorIndex, anchor] of result.entries()) {
      for (const linkedIndex of anchor.linkedAnchors) {
        const a = find(anchorIndex)
        const b = find(linkedIndex)
        if (a !== b) {
          parent[a] = b
        }
      }
    }
    const sizes = new Map()
    result.forEach((_, i) => {
      const root = find(i)
      sizes.set(root, (sizes.get(root) ?? 0) + 1)
    })
    let mainRoot = null
    let mainSize = 0
    for (const [root, size] of sizes) {
      if (size > mainSize) {
        mainSize = size
        mainRoot = root
      }
    }
    const inMainComponent = (i) => find(i) === mainRoot
    const bigEnough = (i) =>
      (sizes.get(find(i)) ?? 0) >= settings.minComponentSize
      && (!settings.dropUnreachableComponents || inMainComponent(i))
    const kept = []
    const remap = new Map()
    result.forEach((anchor, anchorIndex) => {
      if (!bigEnough(anchorIndex)) {
        if (!inMainComponent(anchorIndex)) {
          droppedUnreachable++
        } else {
          droppedSmallComponent++
        }
        return
      }
      remap.set(anchorIndex, kept.length)
      kept.push(anchor)
    })
    result = kept.map((anchor) => {
      return {
        ...anchor,
        linkedAnchors: anchor.linkedAnchors
          .map((linkedIndex) => remap.get(linkedIndex))
          .filter((i) => i !== undefined)
          .sort((a, b) => a - b),
      }
    })
  }

  // -----
  // 5. cells
  const cellAnchors = new Map()
  for (const [anchorIndex, anchor] of result.entries()) {
    const cellX = Math.floor(anchor.position.x / 100)
    const cellY = Math.floor(anchor.position.z / 100)
    const key = cellY * 160 + cellX
    let bucket = cellAnchors.get(key)
    if (bucket === undefined) {
      bucket = []
      cellAnchors.set(key, bucket)
    }
    bucket.push(anchorIndex)
  }

  // -------
  // 6. stats
  const degrees = result.map((anchor) => anchor.linkedAnchors.length)
  const links = degrees.reduce((sum, degree) => sum + degree, 0) / 2
  const linkLengths = []
  const linkHeights = []
  for (const [anchorIndex, anchor] of result.entries()) {
    for (const linkedIndex of anchor.linkedAnchors) {
      if (linkedIndex <= anchorIndex) {
        continue
      }
      const other = result[linkedIndex]
      linkLengths.push(
        Math.hypot(
          other.position.x - anchor.position.x,
          other.position.y - anchor.position.y,
          other.position.z - anchor.position.z,
        ),
      )
      linkHeights.push(Math.abs(other.position.y - anchor.position.y))
    }
  }

  // connected components (union-find)
  const parent = result.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (const [anchorIndex, anchor] of result.entries()) {
    for (const linkedIndex of anchor.linkedAnchors) {
      const a = find(anchorIndex)
      const b = find(linkedIndex)
      if (a !== b) {
        parent[a] = b
      }
    }
  }
  const componentSizes = new Map()
  result.forEach((_, i) => {
    const root = find(i)
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1)
  })

  const pick = (list, q) => {
    if (list.length === 0) {
      return 0
    }
    const sorted = [...list].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  }

  stats.anchors = result.length
  stats.droppedIsolated = droppedIsolated
  stats.droppedSmallComponent = droppedSmallComponent
  stats.droppedUnreachable = droppedUnreachable
  stats.repairedLinks = repairedLinks
  stats.gapFilledLinks = gapFilledLinks
  stats.unreachableComponents = unreachableComponents
  stats.links = links
  stats.linksBlockedByGeometry = blockedLinks
  stats.linksRejectedByCorridor = narrowLinks
  stats.linksRejectedByBody = bodyLinks
  stats.linksRejectedByStep = stepLinks
  stats.degree = { min: Math.min(...degrees), max: Math.max(...degrees), avg: links === 0 ? 0 : (2 * links) / result.length }
  stats.linkLength = {
    min: Math.min(...linkLengths),
    median: pick(linkLengths, 0.5),
    p95: pick(linkLengths, 0.95),
    max: Math.max(...linkLengths),
  }
  stats.linkHeight = {
    min: Math.min(...linkHeights),
    median: pick(linkHeights, 0.5),
    p95: pick(linkHeights, 0.95),
    max: Math.max(...linkHeights),
  }
  stats.components = componentSizes.size
  stats.largestComponent = Math.max(0, ...componentSizes.values())
  stats.cellsWithAnchors = cellAnchors.size
  stats.yRange = result.length === 0 ? null : {
    min: Math.min(...result.map((anchor) => anchor.position.y)),
    max: Math.max(...result.map((anchor) => anchor.position.y)),
  }
  stats.zRange = result.length === 0 ? null : {
    min: Math.min(...result.map((anchor) => anchor.position.z)),
    max: Math.max(...result.map((anchor) => anchor.position.z)),
  }

  // -------------------------------------------------------------------------
  // 7. audit: prove that the graph does not go through the level's geometry
  //
  // `linksBlockedAt` counts the links whose straight line crosses a polygon at the given height
  // above the floor. `linkRayHeight` must be 0 there (the link test used the same test) but the
  // *higher* values are the interesting ones: a non-zero number means the NPC has to climb over
  // or squeeze through something during that step, which the game may not be able to do.
  stats.generatorVersion = ANCHOR_GENERATOR_VERSION

  stats.audit = {
    linksBlockedAt: Object.fromEntries(
      settings.auditRayHeights.map((height) => {
        let blocked = 0
        for (const [anchorIndex, anchor] of result.entries()) {
          for (const linkedIndex of anchor.linkedAnchors) {
            if (linkedIndex <= anchorIndex) {
              continue
            }
            const other = result[linkedIndex]
            const from = v3(anchor.position.x, above(anchor.position.y, height), anchor.position.z)
            const to = v3(other.position.x, above(other.position.y, height), other.position.z)
            if (isBlocked(from, to, polygons, index)) {
              blocked++
            }
          }
        }
        return [height, blocked]
      }),
    ),
    anchorsWithRoof: 0,
    /**
     * How many of the final links a body of the given radius could walk (the cylinder sweep with
     * that radius). It answers the "can an NPC fit through here?" question for wider NPCs too: the
     * game's `GetIORadius()` is 25..60.
     */
    linksPassableByRadius: {},
  }

  for (const radius of settings.auditBodyRadii) {
    let passable = 0
    for (const [anchorIndex, anchor] of result.entries()) {
      for (const linkedIndex of anchor.linkedAnchors) {
        if (linkedIndex <= anchorIndex) {
          continue
        }
        const other = result[linkedIndex]
        if (!isBodyBlocked(anchor.position, other.position, polygons, index, { ...settings, linkBodyRadius: radius }, upSign)) {
          passable++
        }
      }
    }
    stats.audit.linksPassableByRadius[radius] = passable
  }

  for (const anchor of result) {
    const { x, y, z } = anchor.position
    for (const polygonIndex of index.queryPoint(x, z)) {
      const polygon = polygons[polygonIndex]
      if (isWaterPolygon(polygon)) {
        continue
      }
      if (Math.abs(polygon.norm.y) < 0.3) {
        continue
      }
      const surfaceY = surfaceHeightAt(polygon, x, z)
      if (surfaceY === null) {
        continue
      }
      if (surfaceY < above(y, 15) && surfaceY > above(y, settings.auditRoofDistance)) {
        stats.audit.anchorsWithRoof++
        break
      }
    }
  }

  return {
    anchors: result.map(({ position, linkedAnchors }) => ({ position, linkedAnchors })),
    cellAnchors,
    stats,
    polygons,
  }
}

/**
 * Sanity checks of a generated anchor graph against the FTS format rules.
 *
 * @param {{ anchors: Array<{ position: { x: number, y: number, z: number }, linkedAnchors: number[] }>, cellAnchors: Map<number, number[]> }} result
 * @param {object} [options]
 * @returns {string[]} the list of problems (empty when everything is fine)
 */
export function validateAnchors(result, options = {}) {
  const { minZ = null, maxZ = null } = options
  const problems = []
  const { anchors, cellAnchors } = result

  for (const [anchorIndex, anchor] of anchors.entries()) {
    if (!Number.isFinite(anchor.position.x) || !Number.isFinite(anchor.position.y) || !Number.isFinite(anchor.position.z)) {
      problems.push(`anchor ${anchorIndex} has a non-finite position`)
    }

    if (minZ !== null && anchor.position.z < minZ) {
      problems.push(`anchor ${anchorIndex} is outside the requested Z range (z=${anchor.position.z})`)
    }

    if (maxZ !== null && anchor.position.z > maxZ) {
      problems.push(`anchor ${anchorIndex} is outside the requested Z range (z=${anchor.position.z})`)
    }

    if (anchor.linkedAnchors.length === 0) {
      problems.push(`anchor ${anchorIndex} has no links`)
    }

    for (const linkedIndex of anchor.linkedAnchors) {
      if (linkedIndex < 0 || linkedIndex >= anchors.length) {
        problems.push(`anchor ${anchorIndex} links to the invalid index ${linkedIndex}`)
        continue
      }

      if (!anchors[linkedIndex].linkedAnchors.includes(anchorIndex)) {
        problems.push(`the link ${anchorIndex} -> ${linkedIndex} is not symmetric`)
      }
    }
  }

  for (const [cellIndex, anchorIndices] of cellAnchors) {
    if (cellIndex < 0 || cellIndex >= 160 * 160) {
      problems.push(`cell ${cellIndex} is outside the 160x160 cell grid`)
    }
    for (const anchorIndex of anchorIndices) {
      if (anchorIndex < 0 || anchorIndex >= anchors.length) {
        problems.push(`cell ${cellIndex} references the invalid anchor ${anchorIndex}`)
      }
    }
  }

  return problems
}
