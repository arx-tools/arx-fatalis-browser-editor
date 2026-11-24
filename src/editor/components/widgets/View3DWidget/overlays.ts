import type { ArxPolygon } from 'arx-convert/types'
import type { Mesh } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { roomRevision } from '../../../modules/rooms/roomRevision.ts'
import { litRooms } from '../../../modules/rooms/roomStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { isMeshVisible, isPortalsVisible, isRoomColorsVisible } from '../shared/levelDisplay.ts'
import type { LevelWireframe } from '../shared/levelScene.ts'
import type { NormalsOverlay } from '../shared/normalsOverlay.ts'
import type { PortalOverlay } from '../shared/portalOverlay.ts'
import { roomsNeedRepaint, type RoomOverlay } from '../shared/roomOverlay.ts'

/**
 * What the overlays of the view need from the widget that owns the scene.
 *
 * @remarks
 * The bindings of the scene are `let`s of the widget: a module can not read them, so they come in as getters, and a
 * getter always reads the binding of the moment. The overlays write the scene, never the bindings, except the marker of
 * the room colors, which is a cache of this module.
 */
export type OverlayHost = {
  readonly loadedMap: () => ArxMap | undefined
  readonly normals: () => NormalsOverlay | undefined
  readonly portalLines: () => PortalOverlay | undefined
  readonly requestRender: () => void
  readonly rooms: () => RoomOverlay | undefined
  readonly shown: () => readonly Mesh[]
  readonly wireframe: () => LevelWireframe | undefined
}

/**
 * The revision of the rooms the colors of the room map were written from.
 *
 * @remarks
 * A move of the faces into another room does not change the geometry, so the buffers can not tell that the colors are
 * stale: the revision of the rooms does (2026-11-15, the owner: the corner moved into a new room stayed gray).
 */
let paintedRoomRevision = roomRevision.value

/**
 * Marks the room map as painted at the revision of the moment.
 */
export function markRoomsPainted(): void {
  paintedRoomRevision = roomRevision.value
}

/**
 * Shows the level with the textures or as the room map, or hides both.
 *
 * @remarks
 * The two faces of the level are exclusive: the textured mesh is what the game draws, and the room map is the flat
 * color of the rooms, so only one of them is on at a time. The mesh switch of the key help turns off both.
 */
export function updateVisibility(host: OverlayHost): void {
  const visible = isMeshVisible.value
  const showRooms = visible && isRoomColorsVisible.value

  for (const mesh of host.shown()) {
    mesh.visible = visible && !showRooms
  }

  const rooms = host.rooms()

  if (rooms !== undefined) {
    rooms.mesh.visible = showRooms
  }

  // the line reads the flat color of the texture of its face: on the room map and with the mesh off there is no
  // texture under it, so the plain gray stays
  host.wireframe()?.setColored(visible && !isRoomColorsVisible.value)

  // the outline of the portals sits under the same switch as the room map: it shows where the game joins two rooms,
  // which is a read of the level, not a layer of its own
  host.portalLines()?.setVisible(visible && isPortalsVisible.value)
}

/**
 * Recolors the room map after an edit.
 *
 * @remarks
 * An edit refills the geometry of the level in place: the color attribute of the room map is not refilled with it,
 * so the map is colored again when its vertex count no longer matches the geometry. A texture or a uv edit does not
 * change the vertex buffers, so the map is not read again for it — but a move of the faces into another room does not
 * change them either, and the colors of the rooms are stale after it: the revision of the rooms tells that.
 */
export function repaintRooms(host: OverlayHost): void {
  const map = host.loadedMap()

  const rooms = host.rooms()

  if (map === undefined || rooms === undefined) {
    return
  }

  const vertexCount = map.solidMeshes[0].geometry.getAttribute('position').count
  const colorCount = rooms.mesh.geometry.getAttribute('color')?.count

  if (
    roomsNeedRepaint({
      vertexCount,
      colorCount,
      paintedRevision: paintedRoomRevision,
      revision: roomRevision.value,
    })
  ) {
    paintedRoomRevision = roomRevision.value
    rooms.repaint(map)
  }
}

/**
 * Writes the rooms the room map keeps at full color into the overlay.
 *
 * @remarks
 * The lit set is the selection, the hover of the room inspector and the room under the crosshair ({@link litRooms}),
 * so every view of the map shows the same rooms. The map is the only thing the highlight paints: while it is off the
 * set can change (the camera walks into another room), and repainting the vertex colors for it would be wasted work.
 */
export function applyRoomHighlight(host: OverlayHost): void {
  const rooms = host.rooms()

  if (rooms === undefined || !isRoomColorsVisible.value) {
    return
  }

  rooms.setHighlight(litRooms.value)
  host.requestRender()
}

/**
 * The faces of the selection, as the polygons of the level.
 *
 * @param map The map the selection belongs to.
 *
 * @returns The selected faces; an empty set when the selection is empty.
 */
export function selectedPolygonsOf(map: ArxMap): Set<ArxPolygon> {
  const selected = new Set<ArxPolygon>()

  for (const index of selectionStore.polygons.value) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      selected.add(polygon)
    }
  }

  return selected
}

/**
 * Builds the lines of the normals again from the polygons the mesh draws.
 *
 * @remarks
 * The normals are built from the polygons and not from the geometry of the mesh: a line starts in the middle of a face
 * and on its corners, which the buffers of the triangles no longer know. The source is therefore rebuilt after every
 * edit, and after a group hides or shows a face (the level draws the visible polygons only). The selection comes along,
 * because the lines of a selected face take a color of their own.
 */
export function refreshNormals(host: OverlayHost): void {
  const map = host.loadedMap()

  const normals = host.normals()

  if (map === undefined || normals === undefined) {
    return
  }

  normals.setSource(map.visiblePolygons, arxVector3toVector3(map.scenePosition), selectedPolygonsOf(map))
}

/**
 * How long a burst of edits waits between two builds of the normal lines, in milliseconds.
 *
 * @remarks
 * A drag of the gizmo bumps the level revision on every frame, and a rebuild of the lines of level 11 (69 817 faces) is
 * **19-27 ms** for the face normals and **42 ms** for both layers (measured, 2026-11-23). The normals are a debug layer,
 * so during a drag they may follow at 6-7 frames a second: the frame that moves the face stays whole, and the lines catch
 * up when the burst ends.
 */
const NORMALS_REBUILD_INTERVAL = 150

/**
 * When the normal lines were built the last time, in the clock of the page.
 */
let normalsBuiltAt = 0

/**
 * The wait of the rebuild of the normal lines a burst of edits asked for.
 */
let normalsRebuild: ReturnType<typeof setTimeout> | undefined

/**
 * Asks for a rebuild of the normal lines, at most once in {@link NORMALS_REBUILD_INTERVAL}.
 *
 * @remarks
 * The last edit of a burst still gets its rebuild: the timer of the first one fires after the wait and takes the state
 * of the level of that moment, and the edits that came meanwhile schedule the next one.
 */
export function scheduleNormals(host: OverlayHost): void {
  if (normalsRebuild !== undefined) {
    return
  }

  const wait = Math.max(0, NORMALS_REBUILD_INTERVAL - (performance.now() - normalsBuiltAt))

  normalsRebuild = setTimeout(() => {
    normalsRebuild = undefined
    normalsBuiltAt = performance.now()
    refreshNormals(host)
    host.requestRender()
  }, wait)
}

/**
 * Drops the rebuild of the normal lines that is still waiting.
 */
export function cancelNormalsRebuild(): void {
  if (normalsRebuild === undefined) {
    return
  }

  clearTimeout(normalsRebuild)
  normalsRebuild = undefined
}
