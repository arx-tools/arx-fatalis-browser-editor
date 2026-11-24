import {
  HISTORY_RECORD_VERSION,
  type CreateFaceGroupRecord,
  type DeleteFaceGroupsRecord,
  type FaceGroupReference,
  type RenameFaceGroupRecord,
} from './types.ts'

/**
 * Builds the record of a new group, the way a metadata step writes it down.
 *
 * @param group The group the step makes, with the faces it held at the moment of the step.
 *
 * @returns The record of the step.
 */
export function createCreateFaceGroupRecord(group: FaceGroupReference): CreateFaceGroupRecord {
  return { version: HISTORY_RECORD_VERSION, kind: 'createFaceGroup', group }
}

/**
 * Builds the record of a group rename, the way a metadata step writes it down.
 *
 * @param groupId The group to rename.
 * @param from The name the group had.
 * @param to The name the group takes.
 *
 * @returns The record of the step.
 */
export function createRenameFaceGroupRecord(groupId: number, from: string, to: string): RenameFaceGroupRecord {
  return { version: HISTORY_RECORD_VERSION, kind: 'renameFaceGroup', groupId, from, to }
}

/**
 * Builds the record of a group delete, the way a metadata step writes it down.
 *
 * @param groups The groups the step takes out, with their names and faces.
 *
 * @returns The record of the step.
 */
export function createDeleteFaceGroupsRecord(groups: Iterable<FaceGroupReference>): DeleteFaceGroupsRecord {
  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'deleteFaceGroups',
    groups: [...groups]
      .map((group): FaceGroupReference => {
        return { id: group.id, name: group.name, faces: [...group.faces], visible: group.visible ?? true }
      })
      .toSorted((one, other) => {
        return one.id - other.id
      }),
  }
}
