import type { ArxPolygon } from 'arx-convert/types'
import { computed, shallowRef, watch, type ComputedRef, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { onMetadataStep, runMetadataStep, type HistoryCommand } from '../history/history.ts'
import {
  createCreateFaceGroupRecord,
  createDeleteFaceGroupsRecord,
  createRenameFaceGroupRecord,
  labelOf,
  type FaceGroupReference,
  type HistoryRecord,
} from '../history/records.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { levelRevision } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { writeBakedColors } from '../level/edit/levelTextures/bakedColors.ts'
import { repaintLevelView } from '../level/edit/levelTextures.ts'
import {
  currentMapId,
  levelOpened,
  MAP_GROUP_PREFIXES,
  mapEntryOf,
  mapGroups as mapEntries,
} from '../level/source/maps.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import {
  groupsOfVersion,
  hasGroupsOfAnotherVersion,
  readStoredGroups,
  withGroupsOfVersion,
  writeStoredGroups,
  type StoredFaceGroup,
  type StoredGroups,
  type StoredVersionGroups,
} from './groupStorage.ts'

/**
 * A group of faces of the current level.
 *
 * @remarks
 * The members are the **polygons** of the level, not their indices: a step that takes faces out (or puts them back) moves
 * the indices, and a group has to go with the faces it was made of. The indices are the form of the storage, so a group
 * is resolved into polygons when the level opens and written back as indices when it is saved.
 *
 * A group that lost its faces is still a group: its members stay here (an undo of the delete brings the same polygons
 * back), and the count the widget shows is the members that are still in the level.
 */
export type FaceGroup = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * The polygons of the group.
   */
  readonly members: ReadonlySet<ArxPolygon>
  /**
   * Whether the mesh draws the faces of the group.
   *
   * @remarks
   * A hidden group is a view state, not an edit: its faces stay in the level, and the mesh leaves them out (the picking
   * can not reach them, and the export skips them). The eye of the row toggles it.
   */
  readonly visible: boolean
}

/**
 * One row of the group inspector: a group and how many of its faces are in the level.
 */
export type FaceGroupRow = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * What the row shows: the name of the group, or the default of the id.
   */
  readonly label: string
  /**
   * How many faces of the group are still in the level.
   */
  readonly faceCount: number
  /**
   * Whether the group is drawn: the eye of the row shows it.
   */
  readonly visible: boolean
}

/**
 * The polygons the hidden groups of the level take out of the mesh.
 *
 * @param groups The groups of the level.
 *
 * @returns The polygons no hidden group leaves in the view; a group that holds a face of another hidden group takes it
 * out once.
 */
function hiddenPolygonsOf(groups: readonly FaceGroup[]): Set<ArxPolygon> {
  const hidden = new Set<ArxPolygon>()

  for (const group of groups) {
    if (group.visible) {
      continue
    }

    for (const member of group.members) {
      hidden.add(member)
    }
  }

  return hidden
}

/**
 * The groups of the level on the screen.
 *
 * @remarks
 * A module level singleton, like the level and the selection: a dock widget is its own Vue app, so the panel can not get
 * the groups from a parent. The groups of every level live in the browser, and this ref is the ones of the map that is
 * open.
 */
export const activeFaceGroups: ShallowRef<readonly FaceGroup[]> = shallowRef([])

/**
 * The polygons of the level on the screen, as a set, so a member is counted without a search of the list.
 *
 * @remarks
 * The polygons of a map are not reactive: this set is written again when the map changes and when a step of the level
 * moves the faces (`levelRevision`), which is what keeps a count right.
 */
export const presentPolygons: ShallowRef<ReadonlySet<ArxPolygon>> = shallowRef(new Set())

/**
 * The groups of a level, with a face in the first group that holds it.
 *
 * @remarks
 * The groups were not a partition before 2026-11-18: an older storage, or the undo of a step, can hand over two groups
 * that hold the same face. The first group (by the order of the list) keeps it. A group whose every face went that way
 * is dropped, but a group that only lost its faces to a **delete** stays: it holds the polygons the undo brings back.
 *
 * @param groups The groups of the level.
 * @param present The polygons of the level, so a face that is not there is not claimed.
 *
 * @returns The groups, without the overlaps.
 */
function withoutOverlapsOf(groups: readonly FaceGroup[], present: ReadonlySet<ArxPolygon>): FaceGroup[] {
  const claimed = new Set<ArxPolygon>()
  const kept: FaceGroup[] = []

  for (const group of groups) {
    const members = new Set<ArxPolygon>()

    for (const member of group.members) {
      if (present.has(member) && claimed.has(member)) {
        continue
      }

      if (present.has(member)) {
        claimed.add(member)
      }

      members.add(member)
    }

    if (members.size === 0 && group.members.size > 0) {
      let lost = false

      for (const member of group.members) {
        if (present.has(member)) {
          lost = true
        }
      }

      if (lost) {
        continue
      }
    }

    if (members.size === group.members.size) {
      kept.push(group)

      continue
    }

    kept.push({ ...group, members })
  }

  return kept
}

/**
 * The groups of the levels the author grouped faces on, by the value of the map.
 */
const storedGroups = shallowRef<StoredGroups>({})

/**
 * Whether the storage keeps groups of this level on another version of its file.
 *
 * @remarks
 * The groups of a level are the indices of the file they were made on, so a level that opens from another version starts
 * without them: the note of the widget says why, and that the other groups are kept for their own version.
 */
export const groupsOnAnotherVersion = shallowRef(false)

/**
 * Whether {@link activeFaceGroups} belongs to the map on the screen.
 *
 * @remarks
 * The map lands before its stored steps are replayed, and the indices of the groups only line up with the level after
 * that: between the two the groups are not loaded, and nothing is written from them.
 */
let isLoaded = false

/**
 * The map the active groups were resolved against.
 */
let activeMap: ArxMap | undefined

/**
 * The value of the map the active groups belong to.
 */
let activeMapId: string | undefined

/**
 * The id the next group of the open level takes.
 */
let nextGroupId = 1

/**
 * The name the widget shows for a group: the one the author gave it, or the default of its id.
 *
 * @param group The group to name.
 *
 * @returns The label of its row.
 */
function displayNameOf(group: FaceGroup): string {
  if (group.name === '') {
    return `group ${group.id.toString()}`
  }

  return group.name
}

/**
 * The name of a level, the way the header writes it: `Arx: Level 8`, `Blank: Flat Plane`.
 *
 * @remarks
 * The level of the screen is named from the list of the maps, so a rename of the list shows here too; a level that is not
 * in the list any more (the zip of a previous session) keeps the title the storage wrote down.
 *
 * @param id The value of the map.
 *
 * @returns The title of the section of that level.
 */
function titleOfMap(id: string): string {
  const entry = mapEntryOf(id, mapEntries.value)

  if (entry !== undefined) {
    return `${MAP_GROUP_PREFIXES[entry.group]}: ${entry.label}`
  }

  return storedGroups.value[id]?.title ?? id
}

/**
 * Reads the polygons of the level on the screen into {@link presentPolygons}.
 */
function refreshPresentPolygons(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    presentPolygons.value = new Set()

    return
  }

  presentPolygons.value = new Set(map.polygons)
}

/**
 * The rows of the group inspector: the groups of the level on the screen, in the order they were made.
 *
 * @remarks
 * Only the level on the screen has rows: the groups of the other levels are the storage of those levels, and the author
 * has nothing to do with them from here (a visit to that level finds them). The count of a row is the faces of the
 * group that are still in the level.
 */
export const faceGroupRows: ComputedRef<readonly FaceGroupRow[]> = computed(() => {
  const present = presentPolygons.value

  return activeFaceGroups.value.map((group) => {
    let faceCount = 0

    for (const member of group.members) {
      if (present.has(member)) {
        faceCount = faceCount + 1
      }
    }

    return { id: group.id, name: group.name, label: displayNameOf(group), faceCount, visible: group.visible }
  })
})

/**
 * The index of every polygon of the level.
 *
 * @param map The level to read.
 *
 * @returns The indices by the polygons.
 */
function indexMapOf(map: ArxMap): Map<ArxPolygon, number> {
  const indexOf = new Map<ArxPolygon, number>()

  for (let index = 0; index < map.polygons.length; index = index + 1) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      indexOf.set(polygon, index)
    }
  }

  return indexOf
}

/**
 * Takes the faces of the hidden groups out of the mesh of the level on the screen, or puts them back.
 *
 * @remarks
 * The hidden state is a view of the level, not a step: the level keeps the faces, the mesh leaves them out, and the
 * export skips them. The faces a group just hid leave the selection too (a hidden face could not be picked, and the
 * gizmo would move it unseen), and the paint of the level runs again, because the geometry under it is new.
 */
function applyHiddenPolygons(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const hidden = hiddenPolygonsOf(activeFaceGroups.value)

  if (!map.setHiddenPolygons(hidden)) {
    return
  }

  // a hidden face can not be picked, so it leaves the selection: the gizmo would move a face that is not on the screen
  if (hidden.size > 0 && selectionStore.polygons.value.size > 0) {
    const indexOf = indexMapOf(map)
    const taken: number[] = []

    for (const polygon of hidden) {
      const index = indexOf.get(polygon)

      if (index !== undefined) {
        taken.push(index)
      }
    }

    if (taken.length > 0) {
      selectionStore.selectMany(taken, 'remove')
    }
  }

  // the index of the mesh is the visible faces now: the renderer needs the groups of the runs again, and a level that
  // was not painted yet gets the colors of the palette anyway
  repaintLevelView()

  if (map.solidMeshes[0]?.geometry.getAttribute('color') === undefined) {
    writeBakedColors(map)
  }
}

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
  if (activeMap === undefined) {
    return []
  }

  const indexOf = indexMapOf(activeMap)

  return activeFaceGroups.value.map((group) => {
    const faces: number[] = []

    for (const member of group.members) {
      // the faces a hidden group takes out of the view are out of the level the archive carries too
      if (activeMap?.isHidden(member) === true) {
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
 * The group the face of the open level belongs to.
 *
 * @remarks
 * A face is in one group at most (the groups are a partition of the faces the author locked, see
 * {@link createFaceGroupFromSelection} and the load): the first group that holds it is the one. The faces of the level
 * are polygons in memory, so the search is a walk of the groups and a set lookup in each.
 *
 * @param index The face, by its index in the level.
 *
 * @returns The group, or `undefined` when the face is free (or the level is not open).
 */
export function faceGroupOfFace(index: number): FaceGroup | undefined {
  const map = levelStore.map.value

  if (map === undefined) {
    return undefined
  }

  const polygon = map.polygons[index]

  if (polygon === undefined) {
    return undefined
  }

  return activeFaceGroups.value.find((group) => {
    return group.members.has(polygon)
  })
}

/**
 * The group the selection is exactly, when it is one.
 *
 * @remarks
 * The lock of the groups: a selection that is a whole group (every face of it that is in the level) is the group. The
 * faces are polygons in memory, so the check reads the selection as polygons and counts the members of every group.
 *
 * @returns The group the selection is, or `undefined`.
 */
export function faceGroupOfSelection(): FaceGroup | undefined {
  const map = levelStore.map.value
  const selection = selectionStore.polygons.value

  if (map === undefined || selection.size === 0) {
    return undefined
  }

  const selected = new Set<ArxPolygon>()

  for (const index of selection) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      selected.add(polygon)
    }
  }

  if (selected.size === 0) {
    return undefined
  }

  return activeFaceGroups.value.find((group) => {
    let inside = 0

    for (const member of group.members) {
      if (!presentPolygons.value.has(member)) {
        continue
      }

      if (!selected.has(member)) {
        return false
      }

      inside = inside + 1
    }

    return inside === selected.size
  })
}

/**
 * The faces of a set, with the faces of the groups they belong to.
 *
 * @remarks
 * A group is a unit: a gesture that touches one of its faces touches the whole group. The pick of a click, the pencil of
 * the walkable view and the fill of a double click all go through this, so a locked face never arrives alone in the
 * selection.
 *
 * @param indices The faces of the gesture.
 *
 * @returns The faces and their groups, in the order of the level, without repeats.
 */
export function faceIndicesWithGroupsOf(indices: Iterable<number>): number[] {
  const map = levelStore.map.value
  const faces = new Set<number>()
  let indexOf: Map<ArxPolygon, number> | undefined

  if (map !== undefined) {
    indexOf = indexMapOf(map)
  }

  for (const index of indices) {
    faces.add(index)

    const group = faceGroupOfFace(index)

    if (group === undefined || indexOf === undefined) {
      continue
    }

    for (const member of group.members) {
      const memberIndex = indexOf.get(member)

      if (memberIndex !== undefined) {
        faces.add(memberIndex)
      }
    }
  }

  return [...faces].toSorted((one, other) => {
    return one - other
  })
}

/**
 * The indices of the faces of a group of the open level.
 *
 * @param groupId The group whose faces the selection wants.
 *
 * @returns The indices, in the order of the level; an empty list when the group or the level is gone.
 */
export function faceIndicesOfGroup(groupId: number): number[] {
  const map = levelStore.map.value
  const group = activeFaceGroups.value.find((candidate) => {
    return candidate.id === groupId
  })

  if (map === undefined || group === undefined) {
    return []
  }

  const indexOf = indexMapOf(map)
  const indices: number[] = []

  for (const member of group.members) {
    const index = indexOf.get(member)

    if (index !== undefined) {
      indices.push(index)
    }
  }

  return indices.toSorted((one, other) => {
    return one - other
  })
}

/**
 * Writes the groups of one file of a level into the storage, and into the ref the sections read.
 *
 * @param mapId The level the entry belongs to.
 * @param fingerprint The fingerprint of the file the groups belong to.
 * @param entry The groups of that file.
 */
function writeGroupsOf(mapId: string, fingerprint: string, entry: StoredVersionGroups): void {
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
function soleVersionOf(
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
function saveOpenLevel(): void {
  if (!isLoaded || activeMap === undefined || activeMapId === undefined) {
    return
  }

  const indexOf = indexMapOf(activeMap)
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

  writeGroupsOf(activeMapId, activeMap.fingerprint, { nextId: nextGroupId, groups })

  // the storage has the groups of this file now: the note of the other version has nothing to say
  groupsOnAnotherVersion.value = false
}

/**
 * Puts groups into the open level, and writes the level down.
 *
 * @remarks
 * The step of a group calls this on its two halves: a group that is there already is not added twice (a redo of a create,
 * or a revert that meets the group it would bring back).
 *
 * @param groups The groups to add.
 */
function addGroups(groups: readonly FaceGroup[]): void {
  const existing = new Set(
    activeFaceGroups.value.map((group) => {
      return group.id
    }),
  )
  const missing = groups.filter((group) => {
    return !existing.has(group.id)
  })

  if (missing.length === 0) {
    return
  }

  const map = levelStore.map.value
  let present: ReadonlySet<ArxPolygon> = new Set()

  if (map !== undefined) {
    present = new Set(map.polygons)
  }

  // a step that puts a group back can not take faces the level grouped since: the first group keeps them
  activeFaceGroups.value = withoutOverlapsOf([...activeFaceGroups.value, ...missing], present)
  saveOpenLevel()
  applyHiddenPolygons()
}

/**
 * Puts groups into the open level from their stored shape, resolving the faces against the level.
 *
 * @remarks
 * The record of a metadata step keeps the faces as the indices of its moment; the step resolves them when it runs, which
 * is the map the step belongs to (the undo takes the steps after it back first, so the indices are the ones of its
 * moment).
 *
 * @param references The groups, with the indices of their faces.
 */
function addGroupsFromReference(references: readonly FaceGroupReference[]): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const groups: FaceGroup[] = []

  for (const reference of references) {
    const members = new Set<ArxPolygon>()

    for (const index of reference.faces) {
      const polygon = map.polygons[index]

      if (polygon !== undefined) {
        members.add(polygon)
      }
    }

    groups.push({ id: reference.id, name: reference.name, members, visible: reference.visible ?? true })
  }

  addGroups(groups)
}

/**
 * Takes groups out of the open level, and writes the level down.
 *
 * @param ids The groups to take out, by the id of the group.
 */
function removeGroups(ids: ReadonlySet<number>): void {
  activeFaceGroups.value = activeFaceGroups.value.filter((group) => {
    return !ids.has(group.id)
  })
  saveOpenLevel()
  // a group that goes takes its hiding with it: the faces it hid come back to the mesh
  applyHiddenPolygons()
}

/**
 * Names a group of the open level, and writes the level down.
 *
 * @param groupId The group to name.
 * @param name The name the author typed, trimmed.
 */
function setGroupName(groupId: number, name: string): void {
  activeFaceGroups.value = activeFaceGroups.value.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, name }
  })
  saveOpenLevel()
}

/**
 * Builds the step of a stored group record: a new group, a rename or a delete.
 *
 * @param record The stored record.
 *
 * @returns The step, or `undefined` when the record is not a group step.
 */
export function faceGroupCommandOf(record: HistoryRecord): HistoryCommand | undefined {
  if (record.kind === 'createFaceGroup') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        addGroupsFromReference([record.group])
      },
      revert: (): void => {
        removeGroups(new Set([record.group.id]))
      },
    }
  }

  if (record.kind === 'renameFaceGroup') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        setGroupName(record.groupId, record.to)
      },
      revert: (): void => {
        setGroupName(record.groupId, record.from)
      },
    }
  }

  if (record.kind === 'deleteFaceGroups') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        removeGroups(
          new Set(
            record.groups.map((group) => {
              return group.id
            }),
          ),
        )
      },
      revert: (): void => {
        addGroupsFromReference(record.groups)
      },
    }
  }

  return undefined
}

/**
 * Makes a group of the faces that are selected now.
 *
 * @remarks
 * The group takes the id after the last one of the level, and the name of the default, so a new group reads `group 3`
 * without the author naming it. A group can hold faces another group holds too: the groups are sets of faces, not a
 * partition of the level.
 *
 * @returns The id of the new group, or `undefined` when no face is selected.
 */
export function createFaceGroupFromSelection(): number | undefined {
  const map = levelStore.map.value

  if (map === undefined || !isLoaded) {
    return undefined
  }

  const members = new Set<ArxPolygon>()

  for (const index of selectionStore.polygons.value) {
    // a face of a group is locked: a selection that holds one is not grouped (the owner's rule, 2026-11-18)
    if (faceGroupOfFace(index) !== undefined) {
      return undefined
    }

    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      members.add(polygon)
    }
  }

  if (members.size === 0) {
    return undefined
  }

  const id = nextGroupId
  nextGroupId = nextGroupId + 1

  const faces = [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })
  const record = createCreateFaceGroupRecord({ id, name: '', faces })
  const command = faceGroupCommandOf(record)

  if (command !== undefined) {
    runMetadataStep(command)
  }

  return id
}

/**
 * Names a group, or puts the default of its id back.
 *
 * @param mapId The level the group lives on.
 * @param groupId The group to name.
 * @param name The name the author typed; an empty text puts the default back.
 */
export function renameFaceGroup(mapId: string, groupId: number, name: string): void {
  const trimmed = name.trim()

  if (mapId === activeMapId && isLoaded) {
    const group = activeFaceGroups.value.find((candidate) => {
      return candidate.id === groupId
    })

    if (group === undefined || group.name === trimmed) {
      return
    }

    const record = createRenameFaceGroupRecord(groupId, group.name, trimmed)
    const command = faceGroupCommandOf(record)

    if (command !== undefined) {
      runMetadataStep(command)
    }

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, name: trimmed }
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Shows or hides the faces of a group of the level on the screen.
 *
 * @remarks
 * The eye of the row writes this, and it is a **view** of the level, not a step of the history: the faces stay in the
 * level, the mesh leaves them out (the picking can not reach them, the export skips them), and the undo of an edit does
 * not turn the view back. The storage keeps the choice with the group, so the next visit of the level finds it.
 *
 * A group of a level that is not open only takes the flag: there is no mesh here to take its faces out of.
 *
 * @param mapId The level the group lives on.
 * @param groupId The group to show or hide.
 * @param visible Whether the mesh draws its faces.
 */
export function setFaceGroupVisibility(mapId: string, groupId: number, visible: boolean): void {
  if (mapId === activeMapId && isLoaded) {
    const group = activeFaceGroups.value.find((candidate) => {
      return candidate.id === groupId
    })

    if (group === undefined || group.visible === visible) {
      return
    }

    activeFaceGroups.value = activeFaceGroups.value.map((candidate) => {
      if (candidate.id !== groupId) {
        return candidate
      }

      return { ...candidate, visible }
    })
    saveOpenLevel()
    applyHiddenPolygons()

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, visible }
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Takes groups out of a level.
 *
 * @remarks
 * Only the groups go: the faces they held stay in the level (and in the other groups they are in). The step is metadata,
 * so the undo brings the same groups back (the faces are the ones the level holds again), and the groups of a level that
 * is not open are dropped from the storage alone.
 *
 * @param mapId The level the groups live on.
 * @param groupIds The groups to take out.
 */
export function deleteFaceGroups(mapId: string, groupIds: readonly number[]): void {
  const ids = new Set(groupIds)

  if (ids.size === 0) {
    return
  }

  if (mapId === activeMapId && isLoaded) {
    const removed = activeFaceGroups.value.filter((group) => {
      return ids.has(group.id)
    })

    if (removed.length === 0) {
      return
    }

    const references: FaceGroupReference[] = removed.map((group) => {
      return { id: group.id, name: group.name, faces: faceIndicesOfGroup(group.id), visible: group.visible }
    })
    const record = createDeleteFaceGroupsRecord(references)
    const command = faceGroupCommandOf(record)

    if (command !== undefined) {
      runMetadataStep(command)
    }

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.filter((group) => {
    return !ids.has(group.id)
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Groups the selection, or ungroups the group the selection is (the `Ctrl+G` of the editor).
 *
 * @remarks
 * The group is a lock: a selection that holds a locked face is not grouped (nothing happens), and a selection that is a
 * whole group takes the lock off (the group goes, the faces stay). The rule is the owner's (2026-11-18): the same key
 * puts the faces into a group and takes them out of it.
 */
export function groupOrUngroupTheSelection(): void {
  const group = faceGroupOfSelection()

  if (group !== undefined) {
    if (activeMapId !== undefined) {
      deleteFaceGroups(activeMapId, [group.id])
    }

    return
  }

  createFaceGroupFromSelection()
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
function loadGroupsOf(id: string, map: ArxMap): void {
  activeMapId = id
  activeMap = map

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
    nextGroupId = 1
    isLoaded = true
    applyHiddenPolygons()

    return
  }

  nextGroupId = entry.nextId

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
  isLoaded = true

  applyHiddenPolygons()
}

/**
 * Starts the groups of the editor: the storage, the level that opens, and the steps that move the faces.
 *
 * @remarks
 * The groups of the level are read when the level is whole ({@link levelOpened}): the map lands before its stored steps
 * are replayed, and an index of a group only points at its face after the replay. A step of the level and every change of
 * a group write the storage, so a reload and a visit to another level find the same groups.
 */
export function startFaceGroups(): void {
  onMetadataStep(faceGroupCommandOf)
  storedGroups.value = readStoredGroups()
  refreshPresentPolygons()

  watch(levelStore.map, (map) => {
    if (map === activeMap) {
      return
    }

    isLoaded = false
    activeMap = map
    activeMapId = currentMapId.value
    activeFaceGroups.value = []
    groupsOnAnotherVersion.value = false
    refreshPresentPolygons()
  })

  // the level is whole only when its stored steps are on it: the counter says when, and the map and the id are the ones
  // of the level the counter belongs to
  watch(
    levelOpened,
    () => {
      const map = levelStore.map.value

      if (map === undefined) {
        return
      }

      loadGroupsOf(currentMapId.value, map)
      refreshPresentPolygons()
    },
    { immediate: true },
  )

  watch(levelRevision, () => {
    if (!isLoaded) {
      return
    }

    refreshPresentPolygons()
    saveOpenLevel()
  })

  onKeyboardAction('createFaceGroup', groupOrUngroupTheSelection)
}
