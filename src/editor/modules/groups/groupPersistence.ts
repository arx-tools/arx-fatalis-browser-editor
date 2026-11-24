import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { applyHiddenPolygons, indexMapOf, titleOfMap, withoutOverlapsOf } from './groupDerived.ts'
import { activeFaceGroups, groupState, groupsOnAnotherVersion, storedGroups } from './groupState.ts'
import {
  type StoredFaceGroup,
  type StoredVersionGroups,
  groupsOfVersion,
  hasGroupsOfAnotherVersion,
  readStoredGroups,
  withGroupsOfVersion,
  writeStoredGroups,
} from './groupStorage.ts'
import type { FaceGroup } from './groupTypes.ts'

/**
 * The groups of the open level, with the faces resolved to the indices of the level.
 *
 * @remarks
 * The export writes this into the archive, and the save of the level uses the same shape: the faces of a group are
 * polygons in memory and indices on the disk.
 *
 * @returns The groups, in the order they were made; an empty list when no level is open.
 */
export function faceGroupsJsonOf(): readonly StoredFaceGroup[] {
  if (groupState.activeMap === undefined) {
    return []
  }

  const indexOf = indexMapOf(groupState.activeMap)

  return activeFaceGroups.value.map((group) => {
    const faces: number[] = []

    for (const member of group.members) {
      // the faces a hidden group takes out of the view are out of the level the archive carries too
      if (groupState.activeMap?.isHidden(member) === true) {
        continue
      }

      const index = indexOf.get(member)

      if (index !== undefined) {
        faces.push(index)
      }
    }

    return {
      id: group.id,
      name: group.name,
      faces: faces.toSorted((one, other) => {
        return one - other
      }),
      visible: group.visible,
    }
  })
}

/**
 * Writes the groups of one file of a level into the storage, and into the ref the sections read.
 *
 * @param mapId The level the entry belongs to.
 * @param fingerprint The fingerprint of the file the groups belong to.
 * @param entry The groups of that file.
 */
export function writeGroupsOf(mapId: string, fingerprint: string, entry: StoredVersionGroups): void {
  const map = storedGroups.value[mapId]
  const next = {
    ...storedGroups.value,
    [mapId]: withGroupsOfVersion(map, titleOfMap(mapId), fingerprint, entry),
  }

  storedGroups.value = next
  writeStoredGroups(next)
}

/**
 * The one stored version of a level that is not open.
 *
 * @remarks
 * The widget lists the groups of the level on the screen, so a group of another level is only reached by the older paths
 * of the store. Such a level has no fingerprint at hand here: its single stored file is addressed, and a level with more
 * than one is left alone (the note of the storage says the versions are apart).
 *
 * @param mapId The level the groups live on.
 *
 * @returns The fingerprint and the groups, or `undefined` when the level has none, or more than one.
 */
export function soleVersionOf(
  mapId: string,
): { readonly fingerprint: string; readonly entry: StoredVersionGroups } | undefined {
  const versions = storedGroups.value[mapId]?.versions

  if (versions === undefined) {
    return undefined
  }

  const fingerprints = Object.keys(versions)

  if (fingerprints.length !== 1) {
    return undefined
  }

  const fingerprint = fingerprints[0]

  if (fingerprint === undefined) {
    return undefined
  }

  const entry = versions[fingerprint]

  if (entry === undefined) {
    return undefined
  }

  return { fingerprint, entry }
}

/**
 * Writes the groups of the open level down, with the faces resolved to the indices of the level.
 *
 * @remarks
 * The write happens after every group change and after every step of the level: the storage holds the level's current
 * order, so the next visit can resolve the indices on the map the stored steps replay to. A group member that a step took
 * out is not written: the group keeps it in memory (an undo puts the same polygon back), but the file only holds the
 * faces that are in the level.
 */
export function saveOpenLevel(): void {
  if (!groupState.isLoaded || groupState.activeMap === undefined || groupState.activeMapId === undefined) {
    return
  }

  const indexOf = indexMapOf(groupState.activeMap)
  const groups = activeFaceGroups.value.map((group) => {
    const faces: number[] = []

    for (const member of group.members) {
      const index = indexOf.get(member)

      if (index !== undefined) {
        faces.push(index)
      }
    }

    return {
      id: group.id,
      name: group.name,
      faces: faces.toSorted((one, other) => {
        return one - other
      }),
      visible: group.visible,
    }
  })

  writeGroupsOf(groupState.activeMapId, groupState.activeMap.fingerprint, { nextId: groupState.nextGroupId, groups })

  // the storage has the groups of this file now: the note of the other version has nothing to say
  groupsOnAnotherVersion.value = false
}

/**
 * Puts the groups of a file of a level into the ref, resolved against the map of that level.
 *
 * @remarks
 * The groups carry indices of the file they were made on, so only the groups of the file that is open are applied: the
 * groups of another version of the level stay in the storage (see {@link groupsOnAnotherVersion}).
 *
 * @param id The value of the map.
 * @param map The map the groups belong to; its fingerprint picks the version of the level.
 */
export function loadGroupsOf(id: string, map: ArxMap): void {
  groupState.activeMapId = id
  groupState.activeMap = map

  // the storage is the source of the level that opens (a zip seeds it before the level is whole); the ref is the cache
  // of the levels of the session, and this level joins it for the sections of the others
  const stored = readStoredGroups()[id]
  const entry = groupsOfVersion(stored, map.fingerprint)

  groupsOnAnotherVersion.value = entry === undefined && hasGroupsOfAnotherVersion(stored, map.fingerprint)

  if (stored !== undefined) {
    storedGroups.value = { ...storedGroups.value, [id]: stored }
  }

  if (entry === undefined) {
    activeFaceGroups.value = []
    groupState.nextGroupId = 1
    groupState.isLoaded = true
    applyHiddenPolygons()

    return
  }

  groupState.nextGroupId = entry.nextId

  const groups: FaceGroup[] = entry.groups.map((group) => {
    const members = new Set<ArxPolygon>()

    for (const index of group.faces) {
      const polygon = map.polygons[index]

      if (polygon !== undefined) {
        members.add(polygon)
      }
    }

    return { id: group.id, name: group.name, members, visible: group.visible ?? true }
  })

  // an older storage can hold a face in two groups: the first one keeps it
  activeFaceGroups.value = withoutOverlapsOf(groups, new Set(map.polygons))
  groupState.isLoaded = true

  applyHiddenPolygons()
}
