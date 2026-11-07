import { BufferAttribute, Color, Mesh, MeshLambertMaterial } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { ROOM_COLORS, roomColoringForLevel, roomIdsOf, type RoomColoring } from '../../../../generator/rooms.ts'

/**
 * The colour of a face whose room has no colour: a room id that is not in the colouring (a polygon with no room, or
 * one the level does not know).
 *
 * @remarks
 * The grey is deliberately outside the palette: a face the map can not place is a data problem, and it should not read
 * as a room.
 */
const UNASSIGNED_COLOR = '#9a9a9a'

/**
 * How many numbers one vertex colour holds.
 */
const COLOR_ITEM_SIZE = 3

/**
 * How many vertices one triangle of the geometry owns.
 *
 * @remarks
 * The geometry is not indexed from the point of view of the vertex buffers: every triangle has its own three vertices,
 * so the triangle of a vertex is `floor(vertex / 3)`, the same index the picking uses.
 */
const VERTICES_PER_TRIANGLE = 3

/**
 * How much of its colour a room keeps while another one is highlighted.
 *
 * @remarks
 * The list of the areas highlights one room at a time: the map stays readable around it (the geometry is still there),
 * but the eye goes to the picked area. The value is a dim, not a hide, so a face outside the area is still seen.
 */
const DIMMED = 0.35

/**
 * The room map of a level, as a mesh a view can draw.
 *
 * @remarks
 * It is the first piece of the room editing feature: it **shows** the rooms of the level and changes nothing. The mesh
 * shares the geometry of the level, so the room colours are one more attribute on it and a second copy of the level is
 * not built; the material is flat (a colour per vertex, no texture), so the map reads as the areas of the level and
 * not as its art.
 */
export interface RoomOverlay {
  /**
   * The mesh to put into the scene of a view.
   *
   * @remarks
   * It draws with the colours of {@link RoomOverlay.coloring} while it is visible; a view hides the textured level
   * while it shows this one.
   */
  readonly mesh: Mesh
  /**
   * The colouring the colours were written from.
   */
  readonly coloring: RoomColoring
  /**
   * Colours the rooms again from the level, and writes the colours into the geometry.
   *
   * @remarks
   * An edit (a delete) rebuilds the geometry: the vertex buffers change, and the colour attribute has to follow. The
   * room graph also changes when a portal does, and the colouring is read again with it.
   *
   * @param map The level to read.
   * @param mapId The id of the level in the editor: the colours follow it, so every visit of the same level paints the
   * same map (and not the seed of the level, which is a generator parameter and can differ between two visits).
   */
  readonly repaint: (map: ArxMap, mapId: string) => void
  /**
   * Picks the room the map highlights, or clears the highlight.
   *
   * @param room The room to show at full colour, or `undefined` to show every room the same.
   */
  readonly setHighlight: (room: number | undefined) => void
  /**
   * Frees the material of the overlay.
   *
   * @remarks
   * The geometry is the level's: it is not disposed here, and the colour attribute stays on it (another view can show
   * the overlay at the same time, and the textured level does not read the attribute).
   */
  readonly dispose: () => void
}

/**
 * Writes the colour of every vertex of the level into its geometry.
 *
 * @remarks
 * The geometry is a flat list of triangles, and every triangle has its polygon: the vertex takes the colour of the
 * room of that polygon. The attribute is written on the geometry of the level, so every view that shares the geometry
 * sees the same map.
 *
 * @param map The level to read.
 * @param coloring The colour of every room.
 * @param highlight The room to keep at full colour, or `undefined` to show them all the same.
 */
function writeRoomColors(map: ArxMap, coloring: RoomColoring, highlight: number | undefined): void {
  const { geometry } = map.solidMeshes[0]
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * COLOR_ITEM_SIZE)
  const palette = ROOM_COLORS.map((color) => {
    return new Color(color)
  })
  const dimmedPalette = palette.map((color) => {
    return color.clone().multiplyScalar(DIMMED)
  })
  const unassigned = new Color(UNASSIGNED_COLOR)
  const dimmedUnassigned = unassigned.clone().multiplyScalar(DIMMED)

  for (let vertex = 0; vertex < positions.count; vertex++) {
    const triangle = Math.floor(vertex / VERTICES_PER_TRIANGLE)
    const polygon = map.polygons[map.triangleToPolygon[triangle]]
    const away = highlight !== undefined && polygon?.room !== highlight
    let roomPalette = palette
    let color = unassigned

    if (away) {
      roomPalette = dimmedPalette
      color = dimmedUnassigned
    }

    if (polygon !== undefined) {
      const colorIndex = coloring.colors.get(polygon.room)

      if (colorIndex !== undefined) {
        color = roomPalette[colorIndex % roomPalette.length]
      }
    }

    const offset = vertex * COLOR_ITEM_SIZE

    colors[offset] = color.r
    colors[offset + 1] = color.g
    colors[offset + 2] = color.b
  }

  geometry.setAttribute('color', new BufferAttribute(colors, COLOR_ITEM_SIZE))
}

/**
 * Builds the room map of a level.
 *
 * @param map The level to colour.
 * @param mapId The id of the level in the editor, which the colours are keyed with.
 *
 * @returns The overlay, ready to be put into a scene.
 */
export function createRoomOverlay(map: ArxMap, mapId: string): RoomOverlay {
  const { geometry } = map.solidMeshes[0]
  const material = new MeshLambertMaterial({ vertexColors: true })
  const mesh = new Mesh(geometry, material)

  mesh.visible = false

  let coloring: RoomColoring = { colors: new Map(), colorCount: 0 }
  let level = map
  let highlighted: number | undefined

  /**
   * Colours the rooms of a level and writes the colours into the geometry.
   *
   * @param next The level to read.
   * @param id The id of the level in the editor.
   */
  function repaint(next: ArxMap, id: string): void {
    const rooms = roomIdsOf(
      next.polygons.map((polygon) => {
        return polygon.room
      }),
    )

    coloring = roomColoringForLevel(next.fts.portals, rooms, id)
    level = next

    writeRoomColors(next, coloring, highlighted)
  }

  repaint(map, mapId)

  return {
    mesh,
    get coloring(): RoomColoring {
      return coloring
    },
    repaint,
    setHighlight: (room: number | undefined): void => {
      if (room === highlighted) {
        return
      }

      highlighted = room
      writeRoomColors(level, coloring, highlighted)
    },
    dispose: (): void => {
      material.dispose()
    },
  }
}
