import type { ArxPolygon } from 'arx-convert/types'
import type { FaceRoom, FaceTexture } from '../../../generator/ArxMap.ts'
import type { PolygonInsertion } from '../../../generator/arxMap/removal.ts'
import { forgetRoomNames, renameRoom } from '../rooms/roomNames.ts'
import { bumpRoomRevision } from '../rooms/roomRevision.ts'
import type { HistoryCommand } from './history.ts'
import {
  HISTORY_RECORD_VERSION,
  labelOf,
  type BuildTunnelRecord,
  type DeleteRoomsRecord,
  type HistoryRecord,
  type MutableLevel,
  type RotateFacesRecord,
  type ScaleFacesRecord,
  type SetLightRecord,
  type SetRoomRecord,
  type SetTextureRecord,
  type SetUvRecord,
  type TranslateFacesRecord,
} from './records.ts'

/**
 * What a step of the history does: the command of a record.
 *
 * @remarks
 * A record is the **shape** of a step, written so it can be stored and read back (see [`records.ts`](records.ts)); a
 * command is the same step against a live level — the functions here read the polygons of the level, and give `undefined`
 * when they are no longer there (a step of another level, or of a level that was edited under it). A record of another
 * version, or of a kind this build does not know, gives no command either: the step is skipped rather than guessed at.
 */

/**
 * Puts polygons at the end of the level.
 *
 * @param level The level to add to.
 * @param polygons The polygons to add, in order.
 */
function addPolygonsAtTheEndOf(level: MutableLevel, polygons: readonly ArxPolygon[]): void {
  const insertions = Array.from(polygons, (polygon, position): PolygonInsertion => {
    return { index: level.polygons.length + position, polygon }
  })

  level.insertPolygons(insertions)
}

/**
 * Builds the command of a tunnel.
 *
 * @remarks
 * The two halves are the two states of the level: the step takes the faces of the wall out and puts the faces of the
 * tunnel at the end of the list (adding the texture container and the lighting block first, when the step added them);
 * the undo takes the tunnel out, puts the wall back at its indices, and drops the container and the colours. The
 * polygons of the tunnel are the ones of the record, so the redo puts the same objects back.
 *
 * **Parked with the tunnel POC (2026-11-17):** the editor has no UI for it any more; the CSG-based tunnel digging will
 * replace it or reuse it.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the wall is not in the level.
 */
function buildTunnelCommandOf(record: BuildTunnelRecord, level: MutableLevel): HistoryCommand | undefined {
  const removed: ArxPolygon[] = []
  const portalsBefore = [...level.portals]

  for (const index of record.removed) {
    const polygon = level.polygons[index]

    if (polygon === undefined) {
      return undefined
    }

    removed.push(polygon)
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      if (record.addedTexture) {
        level.addTextureContainer(record.texture.id, record.texture.name)
      }

      if (record.lighting.length > 0) {
        level.addLightingColors(record.lighting)
      }

      level.removePolygons(removed)
      addPolygonsAtTheEndOf(level, record.added)
      level.setPortals([...portalsBefore, ...record.portals])
    },
    revert: (): void => {
      level.removePolygons(record.added)

      const insertions: PolygonInsertion[] = []

      for (const [position, index] of record.removed.entries()) {
        const polygon = removed[position]

        if (polygon !== undefined) {
          insertions.push({ index, polygon })
        }
      }

      level.insertPolygons(insertions)
      level.setPortals(portalsBefore)

      if (record.lighting.length > 0) {
        level.removeLightingColors(record.lighting.length)
      }

      if (record.addedTexture) {
        level.removeTextureContainer(record.texture.id)
      }
    },
  }
}

/**
 * Builds the command of a paint.
 *
 * @remarks
 * The two halves are the two states of the faces: the step puts the container of `to` on every face (adding the
 * container first, when the step added it), and the undo puts the container each face had before it back, and takes
 * the added container out of the level. The face indices are the ones of the level the record was made on, so a replay
 * in order finds the same faces.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the record is not in the level.
 */
function roomCommandOf(record: SetRoomRecord, level: MutableLevel): HistoryCommand | undefined {
  const moved: FaceRoom[] = []
  const before: FaceRoom[] = []

  for (const [position, index] of record.faces.entries()) {
    if (level.polygons[index] === undefined) {
      return undefined
    }

    moved.push({ index, room: record.to })
    before.push({ index, room: record.from[position] ?? -1 })
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.setFaceRooms(moved)
      bumpRoomRevision()
    },
    revert: (): void => {
      level.setFaceRooms(before)
      bumpRoomRevision()
    },
  }
}

/**
 * Builds the command of a room delete.
 *
 * @remarks
 * The two halves are the two states of the level: the step writes `-1` into the faces of the rooms and takes the portals
 * of the rooms out; the undo writes the rooms back and puts the portals back at the indices they were taken from. The
 * portals are read from the live level, and the record only carries their indices: a record of another level (or of a
 * level that lost them) gives no command.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face or a portal of the record is not in the level.
 */
function deleteRoomsCommandOf(record: DeleteRoomsRecord, level: MutableLevel): HistoryCommand | undefined {
  const portalsBefore = [...level.portals]
  const removedPortals = new Set(record.portals)

  for (const index of record.portals) {
    if (portalsBefore[index] === undefined) {
      return undefined
    }
  }

  const moved: FaceRoom[] = []
  const before: FaceRoom[] = []

  for (const [position, index] of record.faces.entries()) {
    if (level.polygons[index] === undefined) {
      return undefined
    }

    moved.push({ index, room: -1 })
    before.push({ index, room: record.from[position] ?? -1 })
  }

  const portalsAfter = portalsBefore.filter((_portal, index) => {
    return !removedPortals.has(index)
  })

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.setFaceRooms(moved)
      level.setPortals(portalsAfter)
      forgetRoomNames(
        record.names.map((named) => {
          return named.room
        }),
      )
      bumpRoomRevision()
    },
    revert: (): void => {
      level.setFaceRooms(before)
      level.setPortals(portalsBefore)

      for (const named of record.names) {
        renameRoom(named.room, named.name)
      }

      bumpRoomRevision()
    },
  }
}

function textureCommandOf(record: SetTextureRecord, level: MutableLevel): HistoryCommand | undefined {
  const painted: FaceTexture[] = []
  const before: FaceTexture[] = []

  for (const [position, index] of record.faces.entries()) {
    if (level.polygons[index] === undefined) {
      return undefined
    }

    painted.push({ index, textureContainerId: record.to.id })
    before.push({ index, textureContainerId: record.from[position] ?? 0 })
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      if (record.added) {
        level.addTextureContainer(record.to.id, record.to.name)
      }

      level.setFaceTextures(painted)
    },
    revert: (): void => {
      level.setFaceTextures(before)

      if (record.added) {
        level.removeTextureContainer(record.to.id)
      }
    },
  }
}

/**
 * Builds the command of a light edit.
 *
 * @remarks
 * The two halves are the two snapshots of the record: the step writes the light after the edit, the undo the one before
 * it. The lists are aligned (the index, the light before it and the light after it), and a record whose lists do not line
 * up, or a light the level no longer has, gives no command instead of writing the wrong index.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a light of the record is not in the level.
 */
function lightCommandOf(record: SetLightRecord, level: MutableLevel): HistoryCommand | undefined {
  if (record.before.length !== record.indices.length || record.after.length !== record.indices.length) {
    return undefined
  }

  for (const index of record.indices) {
    if (level.lights[index] === undefined) {
      return undefined
    }
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.setLights(
        record.after.map((light, at) => {
          return { index: record.indices[at], light }
        }),
      )
    },
    revert: (): void => {
      level.setLights(
        record.before.map((light, at) => {
          return { index: record.indices[at], light }
        }),
      )
    },
  }
}

/**
 * Builds the command of a uv edit.
 *
 * @remarks
 * The two halves are the two states of the corners: the step writes `to` and the undo writes `from`. The drag writes the
 * model before the step goes on the stack, so the apply of a step that just happened writes the same values again (a
 * redo after an undo writes the ones of the record).
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when the face is not in the level.
 */
function uvCommandOf(record: SetUvRecord, level: MutableLevel): HistoryCommand | undefined {
  for (const face of record.faces) {
    if (level.polygons[face] === undefined) {
      return undefined
    }
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      for (const face of record.faces) {
        level.setFaceUvs(face, record.to)
      }
    },
    revert: (): void => {
      for (const face of record.faces) {
        level.setFaceUvs(face, record.from)
      }
    },
  }
}

/**
 * Builds the command of a move.
 *
 * @remarks
 * The two halves are the two states of the corners: the step adds the delta, the undo takes it back. The faces are
 * checked on the level, so a step of another level (or of a level that lost a face) gives no command instead of moving
 * the wrong indices.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the record is not in the level.
 */
function translateFacesCommandOf(record: TranslateFacesRecord, level: MutableLevel): HistoryCommand | undefined {
  for (const index of record.faces) {
    if (level.polygons[index] === undefined) {
      return undefined
    }
  }

  const delta = { x: record.delta.x, y: record.delta.y, z: record.delta.z }
  const opposite = { x: -delta.x, y: -delta.y, z: -delta.z }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.translatePolygons(record.faces, delta)
    },
    revert: (): void => {
      level.translatePolygons(record.faces, opposite)
    },
  }
}

/**
 * Builds the command of a turn.
 *
 * @remarks
 * A turn is its own undo: the same axis with the opposite angle takes the faces back, so the record needs no second
 * state. The pivot and the axis are copied, because the level may turn the very vectors the record carries.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the record is not in the level.
 */
function rotateFacesCommandOf(record: RotateFacesRecord, level: MutableLevel): HistoryCommand | undefined {
  for (const index of record.faces) {
    if (level.polygons[index] === undefined) {
      return undefined
    }
  }

  const pivot = { x: record.pivot.x, y: record.pivot.y, z: record.pivot.z }
  const axis = { x: record.axis.x, y: record.axis.y, z: record.axis.z }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.rotatePolygons(record.faces, pivot, axis, record.angle)
    },
    revert: (): void => {
      level.rotatePolygons(record.faces, pivot, axis, -record.angle)
    },
  }
}

/**
 * Builds the command of a scale.
 *
 * @remarks
 * A scale is its own undo: the inverse of the factors takes the faces back, so the record needs no second state. The
 * factors are never zero (`MIN_SCALE_FACTOR` of `ArxMap`), which is what makes the inverse a number. The pivot and the
 * factors are copied, because the level may write the very vectors the record carries.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the record is not in the level.
 */
function scaleFacesCommandOf(record: ScaleFacesRecord, level: MutableLevel): HistoryCommand | undefined {
  for (const index of record.faces) {
    if (level.polygons[index] === undefined) {
      return undefined
    }
  }

  const pivot = { x: record.pivot.x, y: record.pivot.y, z: record.pivot.z }
  const scale = { x: record.scale.x, y: record.scale.y, z: record.scale.z }
  const inverse = { x: 1 / scale.x, y: 1 / scale.y, z: 1 / scale.z }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.scalePolygons(record.faces, pivot, scale)
    },
    revert: (): void => {
      level.scalePolygons(record.faces, pivot, inverse)
    },
  }
}

/**
 * Builds the command of a record: the step a replay runs.
 *
 * @remarks
 * It takes the polygons **from the level it is given**, so the same record runs on the level of the session (where a
 * user pressed the key) and on the level loaded from the files (where a reload replays the steps) — provided the
 * level is in the state the record was made on, which a replay in order gives.
 *
 * A record of another version, or of a kind this build does not know, gives **no command**: the step is skipped
 * rather than guessed at.
 *
 * @param record The record to build the step of.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when the record can not be read by this build.
 */
export function commandOf(record: HistoryRecord, level: MutableLevel): HistoryCommand | undefined {
  if (record.version !== HISTORY_RECORD_VERSION) {
    return undefined
  }

  // a record written by a build that knows more kinds carries one this build does not: the check is on the value of the
  // kind, and that step is skipped rather than guessed at
  if (record.kind === 'setTexture') {
    return textureCommandOf(record, level)
  }

  if (record.kind === 'buildTunnel') {
    return buildTunnelCommandOf(record, level)
  }

  if (record.kind === 'setRoom') {
    return roomCommandOf(record, level)
  }

  if (record.kind === 'deleteRooms') {
    return deleteRoomsCommandOf(record, level)
  }

  if (record.kind === 'setLight') {
    return lightCommandOf(record, level)
  }

  if (record.kind === 'setUv') {
    return uvCommandOf(record, level)
  }

  if (record.kind === 'translateFaces') {
    return translateFacesCommandOf(record, level)
  }

  if (record.kind === 'rotateFaces') {
    return rotateFacesCommandOf(record, level)
  }

  if (record.kind === 'scaleFaces') {
    return scaleFacesCommandOf(record, level)
  }

  if (record.kind !== 'deleteFaces') {
    return undefined
  }

  const insertions: PolygonInsertion[] = []

  for (const index of record.faces) {
    const polygon = level.polygons[index]

    if (polygon === undefined) {
      return undefined
    }

    insertions.push({ index, polygon })
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.removePolygons(
        insertions.map((insertion) => {
          return insertion.polygon
        }),
      )
    },
    revert: (): void => {
      level.insertPolygons(insertions)
    },
  }
}
