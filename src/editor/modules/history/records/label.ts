import type { HistoryRecord, SetEntityPositionRecord, SetSpawnRecord } from './types.ts'

/**
 * The caption of a move of the spawn.
 *
 * @param record The record of the step.
 *
 * @returns `Move the spawn`, or `Turn the spawn` when the feet stayed where they were.
 */
function spawnLabelOf(record: SetSpawnRecord): string {
  const moved =
    record.before.position.x !== record.after.position.x ||
    record.before.position.y !== record.after.position.y ||
    record.before.position.z !== record.after.position.z

  if (!moved) {
    return 'Turn the spawn'
  }

  return 'Move the spawn'
}

/**
 * The caption of a move of an entity.
 *
 * @param record The record of the step.
 *
 * @returns `Move entity 12`, or `Move 3 entities` when the step moves more than one.
 */
function entityPositionLabelOf(record: SetEntityPositionRecord): string {
  if (record.indices.length === 1) {
    return `Move entity ${String(record.indices[0])}`
  }

  return `Move ${String(record.indices.length)} entities`
}

/**
 * The caption of a step, from its record.
 *
 * @param record The record of the step.
 *
 * @returns What the step does, like `Delete 3 face(s)` or `Set texture on 4 face(s)`.
 */
export function labelOf(record: HistoryRecord): string {
  if (record.kind === 'setTexture') {
    return `Set texture on ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'setRoom') {
    if (record.to === -1) {
      return `Take ${String(record.faces.length)} face(s) out of their room`
    }

    return `Move ${String(record.faces.length)} face(s) to room ${String(record.to)}`
  }

  if (record.kind === 'deleteRooms') {
    return `Delete ${String(new Set(record.from).size)} room(s)`
  }

  if (record.kind === 'setRoomName') {
    return `Rename room ${String(record.room)}`
  }

  if (record.kind === 'createFaceGroup') {
    return 'Make a group'
  }

  if (record.kind === 'renameFaceGroup') {
    return `Rename group ${String(record.groupId)}`
  }

  if (record.kind === 'deleteFaceGroups') {
    return `Delete ${String(record.groups.length)} group(s)`
  }

  if (record.kind === 'setLight') {
    if (record.indices.length === 1) {
      return `Edit light ${String(record.indices[0])}`
    }

    return `Edit ${String(record.indices.length)} lights`
  }

  if (record.kind === 'setSpawn') {
    return spawnLabelOf(record)
  }

  if (record.kind === 'setEntityPosition') {
    return entityPositionLabelOf(record)
  }

  if (record.kind === 'setUv') {
    if (record.faces.length === 1) {
      return `Move the uv of face ${String(record.faces[0])}`
    }

    return `Move the uv of ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'buildTunnel') {
    return `Build a tunnel of ${String(record.added.length)} face(s)`
  }

  if (record.kind === 'translateFaces') {
    return `Move ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'rotateFaces') {
    return `Rotate ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'scaleFaces') {
    return `Scale ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'pasteFaces') {
    return `Paste ${String(record.polygons.length)} face(s)`
  }

  return `Delete ${String(record.faces.length)} face(s)`
}
