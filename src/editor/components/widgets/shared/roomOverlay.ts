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
   * The position attribute of the level the map copied, or `undefined` when it has not painted yet.
   *
   * @remarks
   * The map owns a copy of the buffers, so a level that moves has to be copied again: `refillGeometry` builds new
   * attributes on every edit, so a different attribute than this one means the map is stale.
   */
  readonly painted: PositionSnapshot | undefined
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
 * The position buffer of a level, as the decision of a repaint reads it.
 *
 * @remarks
 * Two shapes of change: an insert or a delete **replaces** the attribute (`refillGeometry` builds a new one), and a
 * translate, a rotation or a scale writes **into** it (`needsUpdate` moves its `version` on). The buffer the map copied
 * is stale in both cases, so the decision reads the attribute and its version together.
 */
export type PositionSnapshot = {
  readonly attribute: BufferAttribute
  readonly version: number
}

/**
 * What the decision of a repaint of the room map reads.
 */
export type RoomRepaintState = {
  /**
   * The position buffer of the level, as it is now.
   */
  readonly level: PositionSnapshot | undefined
  /**
   * The position buffer the map copied, or `undefined` when it has not painted yet.
   */
  readonly painted: PositionSnapshot | undefined
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
 * Reads the position buffer of a level.
 *
 * @param map The level to read.
 *
 * @returns The attribute and its version, or `undefined` when the level has no geometry.
 */
export function positionSnapshotOf(map: ReadonlyArxMap): PositionSnapshot | undefined {
  const attribute = map.solidMeshes[0]?.geometry.getAttribute('position')

  // the level builds its geometry, so the position is a plain buffer: an interleaved one has no version to tell a
  // write in place, and a snapshot the decision can not trust is no snapshot (the map paints again)
  if (!(attribute instanceof BufferAttribute)) {
    return undefined
  }

  return { attribute, version: attribute.version }
}

/**
 * Tells whether the map copied the buffer the level has now.
 *
 * @param level The position buffer of the level, as it is now.
 * @param painted The snapshot the map painted the colors from.
 *
 * @returns True when both are the same attribute at the same version.
 */
function isSameBuffer(level: PositionSnapshot | undefined, painted: PositionSnapshot | undefined): boolean {
  if (level === undefined || painted === undefined) {
    return false
  }

  return level.attribute === painted.attribute && level.version === painted.version
}

/**
 * Whether the colors of the room map have to be written again.
 *
 * @remarks
 * Two things make the colors stale: an edit that rebuilds the geometry (a delete, an insert, a translate: `refillGeometry`
 * builds **new** attributes, so the attribute the map copied is not the one of the level any more), and a write of the
 * rooms of the faces (a move into a room the map has not colored yet: the buffers stay the same, so only the revision of
 * the rooms tells it, 2026-11-15).
 *
 * @param state The buffers of the geometry and the two revisions.
 *
 * @returns True when the map has to be painted again.
 */
export function roomsNeedRepaint(state: RoomRepaintState): boolean {
  return !isSameBuffer(state.level, state.painted) || state.paintedRevision !== state.revision
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
  let painted: PositionSnapshot | undefined
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
    const position = levelGeometry.getAttribute('position') as BufferAttribute

    painted = { attribute: position, version: position.version }
    geometry.setAttribute('position', position.clone())

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
    get painted(): PositionSnapshot | undefined {
      return painted
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
