import type {
  ArxColor,
  ArxInteractiveObject,
  ArxLight,
  ArxPolygon,
  ArxPortal,
  ArxRotation,
  ArxVector3,
} from 'arx-convert/types'
import type { FaceRoom, FaceTexture } from '../../../../generator/ArxMap.ts'
import type { FaceUv } from '../../../../generator/arxMap/uvs.ts'
import type { PolygonInsertion } from '../../../../generator/arxMap/removal.ts'
import type { PolygonTurn } from '../../../../generator/arxMap/transforms.ts'

/**
 * The version of the shape a stored step has.
 *
 * @remarks
 * A step is written as JSON (the persistence will come), and a build must not guess at a step it does not know: a
 * record of **this** version is the only one it reads, anything else is skipped. The number is bumped when the shape
 * of a record changes in a way an older or a newer build would read wrong.
 */
export const HISTORY_RECORD_VERSION = 1

/**
 * The step that takes faces out of the level.
 */
export type DeleteFacesRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'deleteFaces'
  /**
   * The faces the step takes out, by their index in the level.
   *
   * @remarks
   * The indices are the ones of the moment the step was made, and a replay walks the steps in the same order from
   * the same level, so it finds the same faces: that is why the polygons themselves are not in the record (a level
   * of 70 000 polygons would be megabytes, a list of indices is a few hundred bytes).
   */
  readonly faces: readonly number[]
}

/**
 * The step that pastes the faces of the clipboard into the level.
 */
export type PasteFacesRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'pasteFaces'
  /**
   * The faces to put at the end of the level, as the clipboard holds them.
   *
   * @remarks
   * The polygons are in the record, unlike the delete, which writes only the indices: the clipboard may hold faces of
   * another level, and then no index of this level names them. The command copies them again before it puts them in,
   * so a later edit of the pasted faces does not reach the record (or the clipboard).
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The colors of the corners, in the order of the polygons: three or four per face.
   *
   * @remarks
   * The pasted faces get their own colors (a block appended to the palette), so a light rebake can move them with the
   * faces. The field is optional: a record written before the colors existed reads its colors from the palette of the
   * level, at the indices the polygons name.
   */
  readonly colors?: readonly ArxColor[]
}

/**
 * The texture a face draws with after a step of {@link SetTextureRecord}.
 */
export type TextureReference = {
  /**
   * The id of the container in the level.
   */
  readonly id: number
  /**
   * The name of the texture, relative to `graph/obj3d/textures`.
   *
   * @remarks
   * The record carries it, so a replay can add the container with the name the step used: an id alone would say nothing
   * about what the face draws with, and the level a step is replayed on may not have it.
   */
  readonly name: string
}

/**
 * The step that paints faces with a texture.
 */
export type SetTextureRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setTexture'
  /**
   * The faces the step paints, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The container every face had before the step, in the order of {@link SetTextureRecord.faces}.
   */
  readonly from: readonly number[]
  /**
   * The container the faces take.
   */
  readonly to: TextureReference
  /**
   * Whether the step added the container of {@link SetTextureRecord.to} to the level.
   *
   * @remarks
   * The undo takes it out again, so a texture painted on a level that did not have it leaves nothing behind. A step
   * whose container the level already had does not touch the list.
   */
  readonly added: boolean
}

/**
 * The step that moves faces into a room.
 *
 * @remarks
 * The room of a face is an id of the FTS, and the step carries the ids the faces had, so the undo puts every face back
 * where it was. A face that belongs to no room takes `-1`, which is what the file says about it.
 */
export type SetRoomRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setRoom'
  /**
   * The faces the step moves, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The room every face had before the step, in the order of {@link SetRoomRecord.faces}.
   */
  readonly from: readonly number[]
  /**
   * The room the faces take, or `-1` to take them out of their room.
   */
  readonly to: number
}

/**
 * The step that takes rooms out of the level.
 *
 * @remarks
 * A room is the faces that name it, so the step writes `-1` into them: the faces stay in the level, and only their room
 * goes. The portals of the room go with it (the game walks the rooms through them), and the record keeps their indices, so
 * the undo puts the rooms and the portals back together.
 */
export type DeleteRoomsRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'deleteRooms'
  /**
   * The faces of the rooms, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The room every face had before the step, in the order of {@link DeleteRoomsRecord.faces}.
   */
  readonly from: readonly number[]
  /**
   * The portals of the rooms, by their index in the level, sorted.
   */
  readonly portals: readonly number[]
  /**
   * The names the rooms had before the step.
   *
   * @remarks
   * A name is metadata, but the undo of a room delete has to bring it back with the room: the record carries the names
   * the step forgets, and the command writes them again on the way back.
   */
  readonly names: readonly NamedRoom[]
}

/**
 * A room and the name the author gave it.
 */
export type NamedRoom = {
  /**
   * The id of the room.
   */
  readonly room: number
  /**
   * The name of the room.
   */
  readonly name: string
}

/**
 * A group of faces, the way a metadata step writes it down.
 *
 * @remarks
 * The faces are the indices of the level the step was made on. The records of the metadata steps are not replayed on the
 * level (their store is written down on its own), so the indices are here for the note of the step and a reader, not for
 * a replay.
 */
export type FaceGroupReference = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * The indices of the faces of the group.
   */
  readonly faces: readonly number[]
  /**
   * Whether the group was drawn; `false` is a hidden group, and a missing value is a record of an older build.
   *
   * @remarks
   * The undo of a delete puts the group back the way it was: a hidden group comes back hidden, with its faces out of the
   * mesh again.
   */
  readonly visible?: boolean
}

/**
 * The step that renames a room.
 */
export type SetRoomNameRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setRoomName'
  /**
   * The id of the room.
   */
  readonly room: number
  /**
   * The name the room had before the step.
   */
  readonly from: string
  /**
   * The name the room takes.
   */
  readonly to: string
}

/**
 * The step that makes a group of faces.
 */
export type CreateFaceGroupRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'createFaceGroup'
  /**
   * The group the step makes.
   */
  readonly group: FaceGroupReference
}

/**
 * The step that renames a group.
 */
export type RenameFaceGroupRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'renameFaceGroup'
  /**
   * The id of the group inside its level.
   */
  readonly groupId: number
  /**
   * The name the group had before the step.
   */
  readonly from: string
  /**
   * The name the group takes.
   */
  readonly to: string
}

/**
 * The step that takes groups out of a level.
 */
export type DeleteFaceGroupsRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'deleteFaceGroups'
  /**
   * The groups the step takes out.
   */
  readonly groups: readonly FaceGroupReference[]
}

/**
 * The step that moves the corners of faces on their texture.
 *
 * @remarks
 * A selection of faces that **share** their texture and their uv is edited together (the uv mapper allows it), so the
 * step is a list of faces and one set of corners: the corners of every face are the ones of the record, before and
 * after. A step of one face is the same shape with one index.
 */
export type SetUvRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setUv'
  /**
   * The faces, by their index in the level.
   */
  readonly faces: readonly number[]
  /**
   * The uv of the corners before the step, in the order of the polygon.
   */
  readonly from: readonly FaceUv[]
  /**
   * The uv of the corners after it.
   */
  readonly to: readonly FaceUv[]
}

/**
 * The step that moves the corners of faces by an offset.
 *
 * @remarks
 * The delta is in the coordinates of the level (the game's), so the step replays on the polygons and the meshes follow
 * their own mirrored buffers. The drag writes the model while it runs; the step goes on the stack when the pointer is
 * let go, with the whole offset of the drag (the command applies it once, and the undo takes it back).
 */
export type TranslateFacesRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'translateFaces'
  /**
   * The faces the step moves, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The offset the corners take, in the coordinates of the level.
   */
  readonly delta: ArxVector3
}

/**
 * A step that turns faces around a point.
 *
 * @remarks
 * The turn is stored as the axis and the angle of it, the way the game writes a rotation: the step applies it, and the
 * undo applies the same axis with the opposite angle. A turn of more than half a circle is stored as the shorter way
 * around (a quaternion has no memory of the other one), which is what a dragged ring gives anyway.
 */
export type RotateFacesRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'rotateFaces'
  /**
   * The faces the step turns, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The point they turn around, in the coordinates of the level.
   */
  readonly pivot: ArxVector3
  /**
   * The axis of the turn, in the coordinates of the level (a unit vector).
   */
  readonly axis: ArxVector3
  /**
   * The angle of the turn, in radians, in the 0..π range of the shortest way of the axis.
   */
  readonly angle: number
}

/**
 * A step that scales faces around a point.
 *
 * @remarks
 * The factors of the scale are stored with the point it scales around: the step applies them, and the undo applies their
 * inverse (a factor is never zero, see `MIN_SCALE_FACTOR` of `ArxMap`), so the record needs no second state.
 */
export type ScaleFacesRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'scaleFaces'
  /**
   * The faces the step scales, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The point they scale around, in the coordinates of the level.
   */
  readonly pivot: ArxVector3
  /**
   * How far the corners move along the three axes, around 1.
   */
  readonly scale: ArxVector3
}

/**
 * The step that takes a wall patch out and builds a tunnel between the two holes it leaves.
 *
 * @remarks
 * The holes are the rims of the two face groups of the patch, and the tunnel is the closed quad strip between them (see
 * the tunnel builder of the generator). The step is **one** step of the history: the faces of the wall go out and the
 * faces of the tunnel come in together, so the undo puts the wall back and takes the tunnel out in one move.
 *
 * The record carries the polygons of the tunnel, because they are not a part of the level before the step: a delete
 * record is a list of indices, a tunnel is the geometry the step makes. The faces of the wall stay indices (a replay
 * reads the same faces from the same level), and so do the container and the lighting block the new faces need.
 */
export type BuildTunnelRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'buildTunnel'
  /**
   * The faces of the wall the step takes out, by their index in the level, sorted.
   */
  readonly removed: readonly number[]
  /**
   * The faces of the tunnel, in the order they take at the end of the level.
   */
  readonly added: readonly ArxPolygon[]
  /**
   * The container the new faces draw with.
   */
  readonly texture: TextureReference
  /**
   * Whether the step added the container of {@link BuildTunnelRecord.texture} to the level.
   */
  readonly addedTexture: boolean
  /**
   * The block of lighting colors the new faces read, appended to the palette of the level.
   *
   * @remarks
   * A face reads as many colors as it has corners (four for a quad), so the block has four entries per face in the
   * palette the export reads. An empty block means the step did not touch the palette.
   */
  readonly lighting: readonly ArxColor[]
  /**
   * The portals that join the tunnel to the rooms of its two openings.
   *
   * @remarks
   * Without them the game does not render the room of the tunnel (it draws the rooms it can reach through the portals),
   * so the step makes them with the faces: the undo takes them out with the tunnel.
   */
  readonly portals: readonly ArxPortal[]
}

/**
 * One light of a step: the light before the edit and the light after it.
 *
 * @remarks
 * The light editor writes the fields of a light on the draft as the author drags, so the step that goes on the stack
 * holds the two **snapshots** of the light, not the movement: the same shape replays on the load, and the undo puts the
 * file's light back. A light is a plain object of numbers and three vectors, so the two are JSON.
 */
export type SetLightEdit = {
  /**
   * The light, by its index in the LLF.
   */
  readonly index: number
  /**
   * The light before the step.
   */
  readonly before: ArxLight
  /**
   * The light after it.
   */
  readonly after: ArxLight
}

/**
 * The step that writes one or more lights of the level.
 *
 * @remarks
 * The selection of the light editor may hold more than one light, and they are edited together in one step (only when
 * every editable field matches, see `lightSelectionOf`). The three lists are aligned: the index, the light before it and
 * the light after it at the same place. The fields are the whole light, so the step does not have to know which of them
 * the author touched.
 */
export type SetLightRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setLight'
  /**
   * The lights, by their index in the LLF, sorted.
   */
  readonly indices: readonly number[]
  /**
   * The lights before the step, in the order of {@link indices}.
   */
  readonly before: readonly ArxLight[]
  /**
   * The lights after it, in the same order.
   */
  readonly after: readonly ArxLight[]
}

/**
 * A change of a light the step writes, as the command and the level speak it.
 */
export type LightChange = {
  /**
   * The light, by its index in the LLF.
   */
  readonly index: number
  /**
   * The light it takes.
   */
  readonly light: ArxLight
}

/**
 * One entity of a step: the place before the edit and the place after it.
 *
 * @remarks
 * The entity editor writes the place of the entity on the draft as the author drops it, so the step that goes on the
 * stack holds the two **places**, not the movement: the same shape replays on the load, and the undo puts the place of
 * the file back.
 */
export type EntityPositionEdit = {
  /**
   * The entity, by its index in the DLF.
   */
  readonly index: number
  /**
   * The place before the step.
   */
  readonly before: ArxVector3
  /**
   * The place after it.
   */
  readonly after: ArxVector3
}

/**
 * The step that moves entities of the level.
 *
 * @remarks
 * The entity editor writes the place of an entity (today the drop to the floor, later a transform), and the step keeps
 * the two places: the undo puts the one of the press back. The place is the local space of the level, the one the DLF
 * keeps (see `playerSpawn`), and the three lists are aligned the way the ones of {@link SetLightRecord} are: a step of
 * several entities writes them together, the indices sorted.
 */
export type SetEntityPositionRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setEntityPosition'
  /**
   * The entities, by their index in the DLF, sorted.
   */
  readonly indices: readonly number[]
  /**
   * The places before the step, in the order of {@link indices}.
   */
  readonly before: readonly ArxVector3[]
  /**
   * The places after it, in the same order.
   */
  readonly after: readonly ArxVector3[]
}

/**
 * A change of the place of an entity, as the command and the level speak it.
 */
export type EntityPositionChange = {
  /**
   * The entity, by its index in the DLF.
   */
  readonly index: number
  /**
   * The place it takes.
   */
  readonly position: ArxVector3
}

/**
 * A step the way a JSON can hold it.
 *
 * @remarks
 * The command of the editor is a pair of closures (`apply`/`revert`), and a closure can not be written to a file. A
 * record is the **description** of the same step: the plain data it needs, without the code. Every command carries
 * one (see `HistoryCommand.record` in `../history.ts`), so what can be undone is exactly what can be stored — the two can not
 * drift apart.
 *
 * The union grows with the kinds of the steps: `deleteFaces` and `setTexture` today, `moveVertex`, `moveLight` and the
 * rest as they arrive.
 */
/**
 * The spawn of a player, the way a step copies it.
 *
 * @remarks
 * It is the shape of the `PlayerSpawn` of the level module: the feet of the player and the yaw it faces, so a step read
 * back from the storage does not have to know the module.
 */
export type SpawnSnapshot = {
  /**
   * Where the feet of the player stand, in the game's coordinates.
   */
  readonly position: ArxVector3
  /**
   * The way the player faces, in degrees, around the Y axis of the game.
   */
  readonly yaw: number
}

/**
 * The step that moves the spawn of the player.
 *
 * @remarks
 * The spawn is the `player` of the DLF header, so the step keeps the whole pose: the undo puts the place and the yaw
 * back together, the way the keep of a light does.
 */
export type SetSpawnRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setSpawn'
  /**
   * The spawn before the step.
   */
  readonly before: SpawnSnapshot
  /**
   * The spawn after it.
   */
  readonly after: SpawnSnapshot
}

export type HistoryRecord =
  | BuildTunnelRecord
  | CreateFaceGroupRecord
  | DeleteFaceGroupsRecord
  | DeleteFacesRecord
  | DeleteRoomsRecord
  | PasteFacesRecord
  | RenameFaceGroupRecord
  | RotateFacesRecord
  | ScaleFacesRecord
  | SetEntityPositionRecord
  | SetLightRecord
  | SetRoomNameRecord
  | SetSpawnRecord
  | SetRoomRecord
  | SetTextureRecord
  | SetUvRecord
  | TranslateFacesRecord

/**
 * The part of the level a step may touch.
 *
 * @remarks
 * A step works on the level, but only on the side of it a command is allowed to change. Naming that side here keeps
 * the commands (and their tests) away from the whole `ArxMap` — a fake with three polygons is enough to prove that a
 * step goes out and comes back.
 */
/**
 * The polygon list of a level, as a step changes it.
 *
 * @remarks
 * The steps take faces out, put them back or move them, and every one of those is a method of the list of the level
 * (`map.polygons`, see {@link Polygons}). The history reads only this much of it, so a test can stand a list of its own.
 */
export type MutablePolygons = {
  /**
   * The polygon at an index of the list.
   */
  readonly [index: number]: ArxPolygon | undefined
  /**
   * How many polygons the list holds.
   */
  readonly length: number
  /**
   * Takes polygons out, by identity.
   *
   * @param polygons The polygons to take out.
   */
  remove(polygons: readonly ArxPolygon[]): void
  /**
   * Puts polygons back at the indices they were taken from.
   *
   * @param insertions The polygons and their places.
   */
  insert(insertions: readonly PolygonInsertion[]): void
  /**
   * Moves the corners of faces.
   *
   * @param faces The faces to move.
   * @param delta The offset.
   */
  translate(faces: readonly number[], delta: ArxVector3): void
  /**
   * Turns the corners of faces around a point.
   *
   * @param faces The faces to turn.
   * @param turn The pivot, the axis and the angle.
   */
  rotate(faces: readonly number[], turn: PolygonTurn): void
  /**
   * Scales the corners of faces from a point.
   *
   * @param faces The faces to scale.
   * @param pivot The point they scale from.
   * @param scale The factors of the three axes.
   */
  scale(faces: readonly number[], pivot: ArxVector3, scale: ArxVector3): void
}

export type MutableLevel = {
  /**
   * Every polygon of the level, in the order of the mesh, with the operations that change them.
   */
  readonly polygons: MutablePolygons
  /**
   * The lighting of the level: the palette the faces read their color from.
   */
  readonly llf: { readonly colors: ArxColor[] }
  /**
   * The portals of the level, as the FTS keeps them.
   */
  readonly portals: readonly ArxPortal[]
  /**
   * Replaces the portals of the level.
   *
   * @param portals The portals the level should have.
   */
  setPortals(portals: readonly ArxPortal[]): void
  /**
   * Sets the texture container of faces.
   *
   * @param changes The faces and the container each of them takes.
   */
  setFaceTextures(changes: readonly FaceTexture[]): void
  /**
   * Moves faces into rooms.
   *
   * @param changes The faces and the room each of them takes.
   */
  setFaceRooms(changes: readonly FaceRoom[]): void
  /**
   * Adds a texture container to the level.
   *
   * @param id The id the container takes.
   * @param filename The name of the texture.
   */
  addTextureContainer(id: number, filename: string): void
  /**
   * Takes a texture container out of the level.
   *
   * @param id The id of the container.
   */
  removeTextureContainer(id: number): void
  /**
   * Adds a block of colors to the lighting palette of the level.
   *
   * @param colors The colors to append.
   */
  addLightingColors(colors: readonly ArxColor[]): void
  /**
   * Takes the last colors of the lighting palette out.
   *
   * @param count How many colors to take out.
   */
  removeLightingColors(count: number): void
  /**
   * Sets the uv of the corners of a face.
   *
   * @param faceIndex The face in the level.
   * @param uvs The uv of the corners, in the order they are stored.
   */
  setFaceUvs(faceIndex: number, uvs: readonly FaceUv[]): void
  /**
   * The lights of the level, as the LLF holds them.
   */
  readonly lights: readonly ArxLight[]
  /**
   * Writes lights of the level, by their index in the LLF.
   *
   * @param changes The lights the step sets.
   */
  setLights(changes: readonly LightChange[]): void
  /**
   * The interactive objects of the level, as the DLF holds them.
   *
   * @remarks
   * The step of an entity reads the list to check that the entity it moves is still there (the way a light step checks
   * the LLF), and writes the place of one through {@link setEntityPositions}.
   */
  readonly entities: readonly ArxInteractiveObject[]
  /**
   * Writes the places of entities of the level, by their index in the DLF.
   *
   * @param changes The entities the step sets.
   */
  setEntityPositions(changes: readonly EntityPositionChange[]): void
  /**
   * The player of the level: the eye of the spawn, and the way it faces.
   *
   * @remarks
   * It is the `player` of the DLF header (see the `playerSpawn` module), and a step of the spawn writes it.
   */
  readonly player: {
    readonly position: ArxVector3
    readonly orientation: ArxRotation
  }
}

/**
 * The face and the container it has before a paint, the way a step writes it down.
 */
export type FaceTextureChange = {
  /**
   * The index of the face in the level.
   */
  readonly index: number
  /**
   * The id of the container the face draws with now.
   */
  readonly from: number
}

/**
 * What the builder of a tunnel says to the record.
 */
export type BuildTunnelOptions = {
  /**
   * The faces of the wall the step takes out.
   */
  readonly removed: Iterable<number>
  /**
   * The polygons of the tunnel, in the order they take at the end of the level.
   */
  readonly added: readonly ArxPolygon[]
  /**
   * The container the new faces draw with.
   */
  readonly texture: TextureReference
  /**
   * Whether the step adds the container to the level.
   */
  readonly addedTexture: boolean
  /**
   * The colors the new faces read, appended to the palette.
   */
  readonly lighting: readonly ArxColor[]
  /**
   * The portals that join the tunnel to the rooms of its openings.
   */
  readonly portals: readonly ArxPortal[]
}
