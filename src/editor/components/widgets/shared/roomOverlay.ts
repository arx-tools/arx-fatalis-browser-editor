import { BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial } from 'three'
import type { ReadonlyArxMap } from '../../../types/readonly.ts'
import { ROOM_COLORS, roomColoringForLevel, roomIdsOf, type RoomColoring } from '../../../../generator/rooms.ts'

/**
 * The color of a face whose room has no color: a room id that is not in the coloring (a polygon with no room, or
 * one the level does not know).
 *
 * @remarks
 * The gray is deliberately outside the palette: a face the map can not place is a data problem, and it should not read
 * as a room.
 */
const UNASSIGNED_COLOR = '#9a9a9a'

/**
 * How many numbers one vertex color holds.
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
 * How much of its color a room keeps while the map does not highlight it.
 *
 * @remarks
 * The map is dark by default: the rooms the author works with (the selection, the hover, the room of the crosshair) are
 * at full color, and everything else is dimmed, so the eye goes to them. The value is a dim, not a hide: the shape of
 * the level stays readable around the lit rooms.
 */
const DIMMED = 0.35

/**
 * The room map of a level, as a mesh a view can draw.
 *
 * @remarks
 * It is the first piece of the room editing feature: it **shows** the rooms of the level and changes nothing. The mesh
 * owns a **copy** of the positions of the level (the room colors are its own `color` attribute), so the palette of the
 * level (the `color` of the level's geometry, painted by the bake) stays untouched and the textured level keeps its
 * light; the material is flat (a color per vertex, no texture), so the map reads as the rooms of the level and not as
 * its art.
 */
export type RoomOverlay = {
  /**
   * The mesh to put into the scene of a view.
   *
   * @remarks
   * It draws with the colors of {@link RoomOverlay.coloring} while it is visible; a view hides the textured level
   * while it shows this one.
   */
  readonly mesh: Mesh
  /**
   * The coloring the colors were written from.
   */
  readonly coloring: RoomColoring
  /**
   * Colors the rooms again from the level, and writes the colors into the geometry.
   *
   * @remarks
   * An edit (a delete) rebuilds the geometry: the vertex buffers change, and the color attribute has to follow. The
   * room graph also changes when a portal does, and the coloring is read again with it.
   *
   * @param map The level to read.
   */
  readonly repaint: (map: ReadonlyArxMap) => void
  /**
   * Picks the rooms the map keeps at full color, or clears the highlight.
   *
   * @remarks
   * The colors of the rooms are read again here: the rooms of the faces can change without a repaint (the replay of
   * the stored steps), and a highlight written from the coloring before that would leave the new rooms gray.
   *
   * @param rooms The rooms to show at full color; an empty set dims every room.
   */
  readonly setHighlight: (rooms: ReadonlySet<number>) => void
  /**
   * Frees the material and the geometry of the overlay.
   *
   * @remarks
   * The geometry is the overlay's own copy: the geometry of the level is not touched by it.
   */
  readonly dispose: () => void
}

/**
 * Writes the color of every vertex of the level into its geometry.
 *
 * @remarks
 * The geometry is a flat list of triangles, and every triangle has its polygon: the vertex takes the color of the
 * room of that polygon. The colors go into the `color` attribute of the **overlay's** geometry (a copy of the
 * positions of the level), so the palette of the level (the `color` of the level's geometry) stays for the textured
 * level.
 *
 * @param geometry The geometry of the overlay, with the positions of the level.
 * @param map The level to read.
 * @param coloring The color of every room.
 * @param highlight The rooms to keep at full color; an empty set dims every room.
 */
function writeRoomColors(
  geometry: BufferGeometry,
  map: ReadonlyArxMap,
  coloring: RoomColoring,
  highlight: ReadonlySet<number>,
): void {
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
    // the map is dark by default: only the highlighted rooms keep their full color
    const away = polygon === undefined || !highlight.has(polygon.room)
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
 * What the decision of a repaint of the room map reads.
 */
export type RoomRepaintState = {
  /**
   * How many vertices the geometry of the level has.
   */
  readonly vertexCount: number
  /**
   * How many colors the attribute of the map has, or `undefined` when it has none yet.
   */
  readonly colorCount: number | undefined
  /**
   * The revision of the rooms the colors were written from.
   */
  readonly paintedRevision: number
  /**
   * The revision of the rooms the level has now.
   */
  readonly revision: number
}

/**
 * Whether the colors of the room map have to be written again.
 *
 * @remarks
 * Two things make the colors stale: an edit that rebuilds the geometry (a delete, an insert: the vertex buffers change
 * and the attribute has to follow), and a write of the rooms of the faces (a move into a room the map has not colored
 * yet: the vertex buffers stay the same, so only the revision of the rooms tells it, 2026-11-15).
 *
 * @param state The buffers of the geometry and the two revisions.
 *
 * @returns True when the map has to be painted again.
 */
export function roomsNeedRepaint(state: RoomRepaintState): boolean {
  return state.colorCount !== state.vertexCount || state.paintedRevision !== state.revision
}

/**
 * Reads the color of the rooms of a level.
 *
 * @param map The level to read.
 *
 * @returns The color of every room the level has a face in.
 */
function coloringOfLevel(map: ReadonlyArxMap): RoomColoring {
  return roomColoringForLevel(
    roomIdsOf(
      map.polygons.map((polygon) => {
        return polygon.room
      }),
    ),
  )
}

/**
 * Builds the room map of a level.
 *
 * @param map The level to color.
 *
 * @returns The overlay, ready to be put into a scene.
 */
export function createRoomOverlay(map: ReadonlyArxMap): RoomOverlay {
  // the geometry of the overlay is its own: it copies the positions of the level, and the room colors are its `color`
  // attribute. The level's geometry keeps its own `color` (the palette of the baked light), which the textured level
  // draws with, so the room map never writes over the light
  const geometry = new BufferGeometry()
  const material = new MeshLambertMaterial({ vertexColors: true })
  const mesh = new Mesh(geometry, material)

  mesh.visible = false

  let coloring: RoomColoring = { colors: new Map(), colorCount: 0 }
  let level = map
  let highlighted: ReadonlySet<number> = new Set()

  /**
   * Colors the rooms of a level and writes the colors into the geometry.
   *
   * @param next The level to read.
   */
  function repaint(next: ReadonlyArxMap): void {
    level = next
    coloring = coloringOfLevel(next)

    // the positions follow the level: an edit rebuilds its geometry, and the overlay copies the new buffers
    const { geometry: levelGeometry } = next.solidMeshes[0]
    const { index } = levelGeometry

    geometry.setAttribute('position', levelGeometry.getAttribute('position').clone())

    if (index === null) {
      geometry.setIndex(null)
    } else {
      geometry.setIndex(index.clone())
    }

    writeRoomColors(geometry, next, coloring, highlighted)
  }

  repaint(map)

  return {
    mesh,
    get coloring(): RoomColoring {
      return coloring
    },
    repaint,
    setHighlight: (rooms: ReadonlySet<number>): void => {
      highlighted = rooms

      // the rooms of the faces can change without a repaint: the replay of the stored steps writes them, and the
      // selection that follows comes through here. The color of a room is read again with the highlight, or the
      // vertices of the new rooms would fall back to the gray of the faces without a room (2026-11-15)
      coloring = coloringOfLevel(level)

      writeRoomColors(geometry, level, coloring, highlighted)
    },
    dispose: (): void => {
      material.dispose()
      geometry.dispose()
    },
  }
}
