import { getCellCoords, isQuad, MAP_WIDTH_IN_CELLS } from 'arx-convert/utils'
import type { Mesh } from 'three'
import { bakeLlfColors, type LightingCalculatorMode } from './lighting/bake.js'
import type { ArxColor, ArxEPData, ArxFTS, ArxLLF, ArxPolygon } from 'arx-convert/types'

export type SourcePolygon = {
  polygon: ArxPolygon
  /** the index of the polygon in the original `fts.polygons` array */
  sourceIndex: number
}

/**
 * Builds the `triangleIndex -> source polygon index` lookup of one mesh. `arxPolygonsToMesh` writes
 * one triangle per polygon, plus a second one for quads, in the order of the polygons, so the
 * triangle index of a face is `face.a / 3` (the geometry is not indexed).
 */
export function buildTriangleToPolygonMap(entries: ReadonlyArray<SourcePolygon>): Uint32Array {
  const triangles = entries.reduce((count, { polygon }) => {
    return count + (isQuad(polygon) ? 2 : 1)
  }, 0)

  const map = new Uint32Array(triangles)
  let triangleIndex = 0

  for (const { polygon, sourceIndex } of entries) {
    map[triangleIndex] = sourceIndex
    triangleIndex++

    if (isQuad(polygon)) {
      map[triangleIndex] = sourceIndex
      triangleIndex++
    }
  }

  return map
}

/**
 * M1 export: keeps the polygons that have not been deleted and rebuilds the data that references
 * them by index.
 *
 * - `getCellCoords()` is the same function `FTS.save()` uses, so the `(cellX, cellY, polygonIdx)`
 *   room references below point into the cells the save is going to write;
 * - a portal is kept only when both of its rooms still exist (`room <= max room id`), and the
 *   room portal indices are remapped;
 * - `roomDistances` is the sound distance cache: `-1` means "use the true distance", so the export
 *   can simply write `-1` for every room pair;
 * - the anchors, texture containers and unique headers are kept as they are.
 */
export function buildExportFts(fts: ArxFTS, deletedPolygons: ReadonlySet<number>): ArxFTS {
  const surviving: SourcePolygon[] = []

  fts.polygons.forEach((polygon, sourceIndex) => {
    if (!deletedPolygons.has(sourceIndex)) {
      surviving.push({ polygon, sourceIndex })
    }
  })

  const maxRoomId = surviving.reduce((max, { polygon }) => {
    return Math.max(max, polygon.room)
  }, 0)

  if (maxRoomId === 0) {
    throw new Error('cannot export a level without any polygon')
  }

  const rooms = fts.rooms.slice(0, maxRoomId + 1).map((room) => {
    return {
      portals: [...room.portals],
      polygons: [] as ArxEPData[],
    }
  })

  const cellPolygonIndices = new Map<number, number>()

  for (const { polygon } of surviving) {
    const [cellX, cellY] = getCellCoords(polygon.vertices)
    const cellKey = cellY * MAP_WIDTH_IN_CELLS + cellX
    const polygonIdx = cellPolygonIndices.get(cellKey) ?? 0
    cellPolygonIndices.set(cellKey, polygonIdx + 1)

    const room = rooms[polygon.room]

    if (room !== undefined) {
      room.polygons.push({ cellX, cellY, polygonIdx })
    }
  }

  const portalIndexRemap = new Map<number, number>()
  const portals = fts.portals.filter((portal, index) => {
    if (portal.room1 > maxRoomId || portal.room2 > maxRoomId) {
      return false
    }

    portalIndexRemap.set(index, portalIndexRemap.size)
    return true
  })

  for (const room of rooms) {
    room.portals = room.portals
      .map((portalIndex) => {
        return portalIndexRemap.get(portalIndex)
      })
      .filter((portalIndex): portalIndex is number => {
        return portalIndex !== undefined
      })
  }

  const roomDistances = Array.from({ length: (maxRoomId + 1) ** 2 }, () => {
    return {
      distance: -1,
      startPosition: { x: 0, y: 0, z: 0 },
      endPosition: { x: 0, y: 0, z: 0 },
    }
  })

  return {
    ...fts,
    polygons: surviving.map(({ polygon }) => polygon),
    portals,
    rooms,
    roomDistances,
  }
}

/**
 * The LLF palette is a flat array in the order of the FTS polygons: 3 colors per polygon vertex,
 * plus the 4th one for a quad (`arx-convert` adds the `llfColorIdx` indices this way on load). When
 * polygons are removed, the palette has to be filtered in the same order, otherwise the surviving
 * vertices get the colors of another polygon.
 */
export function buildExportLlf(
  fts: ArxFTS,
  llf: ArxLLF,
  deletedPolygons: ReadonlySet<number>,
  mode: LightingCalculatorMode = 'Arx',
  occluders: readonly Mesh[] = [],
  ambientFloor = 0,
  shadows = true,
  /** an already computed palette (the caller can cache it between the display and the export) */
  precomputedColors?: ArxColor[],
): ArxLLF {
  if (llf.colors.length === 0) {
    return { ...llf, colors: [] }
  }

  // the palette is computed from the lights (the `lightingCalculatorMode`), not copied from the
  // original LLF - the points of the M3a export
  const bakedColors = precomputedColors ?? bakeLlfColors(fts, llf, mode, occluders, ambientFloor, shadows)
  const colors: ArxColor[] = []

  fts.polygons.forEach((polygon, sourceIndex) => {
    if (deletedPolygons.has(sourceIndex)) {
      return
    }

    const base = polygon.vertices[0].llfColorIdx ?? 0
    const count = isQuad(polygon) ? 4 : 3

    for (let i = 0; i < count; i++) {
      const color = bakedColors[base + i]

      if (color === undefined) {
        console.warn('[export] missing baked LLF color for polygon', sourceIndex, '- using white')
        colors.push({ r: 255, g: 255, b: 255, a: 255 })
      } else {
        colors.push(color)
      }
    }
  })

  return { ...llf, colors }
}
