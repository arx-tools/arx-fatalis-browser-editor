import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { bakeLlfColorsAt } from '../../../../generator/lighting.ts'
import { bakedCornersOf, cornersWithin, writeBakedCornerColors, type LightSphere } from './levelTextures/bakedColors.ts'
import { bumpLightingCacheVersion } from './lightingCache.ts'
import { paletteBakeOptionsOf, readsPalette } from './lightingProfile.ts'

/**
 * One light an edit touched: the light before the edit and the light after it.
 *
 * @remarks
 * The two states are what the partial bake needs, not only the new one: the corners a light **used to** reach have to go
 * back to the light of the other lamps when the light shrinks, moves away or stops baking, and those corners are the
 * ones the sphere of its old place holds.
 */
export type LightPaletteChange = {
  /**
   * The light before the edit.
   */
  readonly before: ArxLight
  /**
   * The light after it.
   */
  readonly after: ArxLight
}

/**
 * The spheres of the two states of every changed light, without the repeats.
 *
 * @remarks
 * The reach of a light is its `fallEnd` around its position, in the frame of the scene (the bake mirrors the position of
 * the light, the way the mesh is mirrored). Two states with the same place and the same end are the same sphere: a
 * color or an intensity edit gives one sphere instead of two, and the walk of the corners is the same.
 *
 * A **semidynamic** light is left out: the palette of a level is the light of its static lights (a torch is lit at
 * runtime), so a bake for one would write the static light of the corners over the layer that draws the torch, which
 * blinked the torch on every frame of a drag (2026-11-23, the owner).
 *
 * @param changed The lights the edit touched.
 *
 * @returns The spheres whose corners the bake takes.
 */
function spheresOf(changed: readonly LightPaletteChange[]): LightSphere[] {
  const seen = new Set<string>()
  const spheres: LightSphere[] = []

  for (const change of changed) {
    for (const light of [change.before, change.after]) {
      if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
        continue
      }

      const { x, y, z } = light.position
      const key = `${String(x)},${String(y)},${String(z)},${String(light.fallEnd)}`

      if (!seen.has(key)) {
        seen.add(key)
        spheres.push({ x: -x, y: -y, z, radius: light.fallEnd })
      }
    }
  }

  return spheres
}

/**
 * How far the shadow of a dragged face may fall from the place of the face, in the units of the game.
 *
 * @remarks
 * The light of a level is usually a torch a few hundred units above the floor, so the shadow of a mesh stands under it,
 * a cell or two to the side. The box of a drag takes this much around the faces, and a light that throws its shadow
 * farther is left to the bake of the step (the release), which reads the whole level.
 */
const SHADOW_FOOTPRINT_MARGIN = 200

/**
 * How many corners a drag bakes on one frame, at most.
 *
 * @remarks
 * A drag runs on every pointer move: a few thousand corners are a few milliseconds with the rays of the shadows, which
 * the eye reads as a shadow that follows the mouse. Above the limit the frames of the drag bake nothing (the faces keep
 * the light they had), and the bake of the step at the release writes the whole level.
 */
const DRAG_BAKE_LIMIT = 4000

/**
 * The box the shadow of the faces of a drag may fall in, in the frame of the bake.
 */
export type ShadowFootprint = {
  /**
   * The lower edge of the box on the X axis, in the frame of the scene.
   */
  readonly minX: number
  /**
   * The upper edge of the box on the X axis.
   */
  readonly maxX: number
  /**
   * The lower edge of the box on the Z axis.
   */
  readonly minZ: number
  /**
   * The upper edge of the box on the Z axis.
   */
  readonly maxZ: number
}

/**
 * Reads the box the shadow of a set of faces can fall in.
 *
 * @remarks
 * The corners of the bake stand in the frame of the scene (`M(v - scene)` of the file), so the box is read the same way:
 * the mirror turns the X around, and the scene position shifts both axes. The box of a frame is the union of it and the
 * box of the frame before it ({@link footprintUnionOf}), so the corners the faces have just left get their color back
 * and the shadow leaves no trail behind a drag.
 *
 * @param map The level of the faces.
 * @param faces The indices of the faces.
 *
 * @returns The box of the faces, or `undefined` when they have no place (a level without them).
 */
export function footprintOfFaces(map: ArxMap, faces: readonly number[]): ShadowFootprint | undefined {
  const scene = map.scenePosition
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    for (const vertex of polygon.vertices) {
      const x = -vertex.x + scene.x
      const z = vertex.z - scene.z

      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return undefined
  }

  return {
    minX: minX - SHADOW_FOOTPRINT_MARGIN,
    maxX: maxX + SHADOW_FOOTPRINT_MARGIN,
    minZ: minZ - SHADOW_FOOTPRINT_MARGIN,
    maxZ: maxZ + SHADOW_FOOTPRINT_MARGIN,
  }
}

/**
 * The box that holds two boxes.
 *
 * @remarks
 * A frame of a drag bakes the box of the frame before it and the box of this one: the corners the faces have just left
 * take the light of their place again, so the shadow of the drag leaves no trail, and the box stays the size of two
 * frames instead of growing with the whole drag.
 *
 * @param one A box.
 * @param other The other box.
 *
 * @returns The box around the two.
 */
export function footprintUnionOf(one: ShadowFootprint, other: ShadowFootprint): ShadowFootprint {
  return {
    minX: Math.min(one.minX, other.minX),
    maxX: Math.max(one.maxX, other.maxX),
    minZ: Math.min(one.minZ, other.minZ),
    maxZ: Math.max(one.maxZ, other.maxZ),
  }
}

/**
 * Tells whether a corner stands inside a box.
 *
 * @param positions The positions of the corners of the level, three channels each.
 * @param entry Which corner.
 * @param box The box to test.
 *
 * @returns True when the corner is inside the box on the X and Z axes.
 */
function insideOf(positions: Float32Array, entry: number, box: ShadowFootprint): boolean {
  const at = entry * 3
  const x = positions[at] ?? 0
  const z = positions[at + 2] ?? 0

  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ
}

/**
 * Writes the colors a bake of a set of corners made into the palette and onto the mesh.
 *
 * @param map The level the corners belong to.
 * @param corners The corners of the level.
 * @param reached Which of them the bake took.
 */
function writeBakeOf(
  map: ArxMap,
  corners: NonNullable<ReturnType<typeof bakedCornersOf>>,
  reached: readonly number[],
): void {
  const colors = bakeLlfColorsAt(map.llf, paletteBakeOptionsOf(map), corners, reached)

  if (colors.size === 0) {
    return
  }

  for (const [index, color] of colors) {
    if (index < map.llf.colors.length) {
      map.llf.colors[index] = color
    }
  }

  bumpLightingCacheVersion()
  writeBakedCornerColors(map, corners, reached)
}

/**
 * Bakes the light of the faces a drag moved, and of the corners under them, on the frame of the drag.
 *
 * @remarks
 * The step of the release bakes the moved faces again and the whole level with the shadows; a drag that does the same on
 * every frame would freeze a big level. So a frame bakes **the moved faces** (their own light follows the mesh) and **the
 * corners in the box of the drag** (the shadow the mesh casts on the floor), and the profile without the shadows pays
 * only for the faces. A **selection** over {@link DRAG_BAKE_LIMIT} corners keeps its own light for the step, and the
 * shadow under it follows the mouse anyway: a dense mesh of an import is the case this split is for (2026-11-27, the
 * owner: the big tree cast its shadow only when the drag ended). A **box** over the limit is left to the step.
 *
 * @param map The level of the faces.
 * @param faces The indices of the faces the drag moved.
 * @param footprint The box of the drag so far, or `undefined` to bake the faces only.
 */
export function bakeDragOf(map: ArxMap, faces: readonly number[], footprint: ShadowFootprint | undefined): void {
  const options = paletteBakeOptionsOf(map)

  if (!readsPalette(options.mode)) {
    return
  }

  const corners = bakedCornersOf(map)

  if (corners === undefined) {
    return
  }

  const moved = new Set<number>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    for (const vertex of polygon.vertices) {
      if (vertex.llfColorIdx !== undefined) {
        moved.add(vertex.llfColorIdx)
      }
    }
  }

  // a big selection (a dense mesh of an import) is too many corners for the frames of a drag: its own light waits for
  // the step of the release, but the shadow under it still follows the mouse (the box holds the floor of the level)
  const bakeMoved = moved.size <= DRAG_BAKE_LIMIT
  const shadows = options.shadows === true && footprint !== undefined

  if (!bakeMoved && !shadows) {
    return
  }

  const reached: number[] = []

  for (let entry = 0; entry < corners.count; entry = entry + 1) {
    const palette = corners.paletteIndexes[entry] ?? -1
    let take = bakeMoved && moved.has(palette)

    if (!take && shadows && (corners.lit[entry] ?? 0) !== 0) {
      take = insideOf(corners.positions, entry, footprint)
    }

    if (!take) {
      continue
    }

    reached.push(entry)

    if (reached.length > DRAG_BAKE_LIMIT) {
      return
    }
  }

  if (reached.length === 0) {
    return
  }

  writeBakeOf(map, corners, reached)
}

/**
 * Bakes the light of the faces that moved, with the profile of the level.
 *
 * @remarks
 * A face that moves (a paste, a translate, a rotate, a scale) takes the light of its new place: the corners it owns are
 * baked again and only those are written, so a move stays cheap on a big level. A profile that does not read the lights
 * (the flat and the rainbow) needs nothing.
 *
 * @param map The level the faces belong to.
 * @param faces The indices of the faces that moved.
 */
export function refreshLightPaletteOfFaces(map: ArxMap, faces: readonly number[]): void {
  const options = paletteBakeOptionsOf(map)

  if (!readsPalette(options.mode)) {
    return
  }

  const corners = bakedCornersOf(map)

  if (corners === undefined) {
    return
  }

  const wanted = new Set<number>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    for (const vertex of polygon.vertices) {
      if (vertex.llfColorIdx !== undefined) {
        wanted.add(vertex.llfColorIdx)
      }
    }
  }

  const reached: number[] = []

  for (let entry = 0; entry < corners.count; entry = entry + 1) {
    if (wanted.has(corners.paletteIndexes[entry] ?? -1)) {
      reached.push(entry)
    }
  }

  if (reached.length === 0) {
    return
  }

  writeBakeOf(map, corners, reached)
}

/**
 * Bakes the palette again where the lights an edit touched have changed it.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the level has to follow it without the bake of the
 * whole palette (about half a second on a big level). Only the corners the **old** and the **new** sphere of a changed
 * light reach are baked, with the math and the light order of the full bake, and only those entries of the palette and
 * of the `color` attribute of the mesh are written. The corners no light of the edit reaches keep their color: the edit
 * can not reach them.
 *
 * The bake follows the profile of the widget: the flat and the rainbow ones do not read the lights, so there is nothing
 * to bake there. The palette cache of the profiles is dropped, because the palette of the level is not the one the last
 * full bake wrote.
 *
 * @param map The level the lights belong to.
 * @param changed The lights the edit touched, with the two states of each.
 */

export function refreshLightPalette(map: ArxMap, changed: readonly LightPaletteChange[]): void {
  const options = paletteBakeOptionsOf(map)

  if (!readsPalette(options.mode)) {
    return
  }

  const corners = bakedCornersOf(map)
  const spheres = spheresOf(changed)

  if (corners === undefined || spheres.length === 0) {
    return
  }

  const reached = cornersWithin(corners, spheres)

  if (reached.length === 0) {
    return
  }

  const colors = bakeLlfColorsAt(map.llf, options, corners, reached)

  if (colors.size === 0) {
    return
  }

  for (const [index, color] of colors) {
    if (index < map.llf.colors.length) {
      map.llf.colors[index] = color
    }
  }

  bumpLightingCacheVersion()
  writeBakedCornerColors(map, corners, reached)
}
