import type { ArxPolygon } from 'arx-convert/types'
import { computed, shallowRef, watch, type ComputedRef, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { levelRevision } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import {
  currentMapId,
  levelOpened,
  MAP_GROUP_PREFIXES,
  mapEntryOf,
  mapGroups as mapEntries,
} from '../level/source/maps.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { readStoredGroups, writeStoredGroups, type StoredGroups, type StoredMapGroups } from './groupStorage.ts'

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
}

/**
 * The groups of one level, under the name of that level.
 */
export type FaceGroupSection = {
  /**
   * The value of the map the groups belong to.
   */
  readonly mapId: string
  /**
   * The name of the level with its group, like `Arx: Level 8`, the way the header writes it.
   */
  readonly title: string
  /**
   * Whether this is the level on the screen: only its groups can be picked.
   */
  readonly isCurrent: boolean
  /**
   * The groups of the level, in the order they were made.
   */
  readonly groups: readonly FaceGroupRow[]
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
 * The groups of the levels the author grouped faces on, by the value of the map.
 */
const storedGroups = shallowRef<StoredGroups>({})

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
 * The name the widget shows for a stored group: the one the author gave it, or the default of its id.
 *
 * @param group The stored group to name.
 *
 * @returns The label of its row.
 */
function storedNameOf(group: Pick<FaceGroup, 'id' | 'name'>): string {
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
 * The groups of every level the author made one on, the open level first.
 *
 * @remarks
 * The open level's rows are the live groups (the count follows the level), and the ones of the other levels are the
 * storage: their faces are indices of a level that is not here, so the count is what the level had when it was left.
 */
export const faceGroupSections: ComputedRef<readonly FaceGroupSection[]> = computed(() => {
  const sections: FaceGroupSection[] = []
  const current = currentMapId.value
  const present = presentPolygons.value
  const rows: FaceGroupRow[] = []

  for (const group of activeFaceGroups.value) {
    let faceCount = 0

    for (const member of group.members) {
      if (present.has(member)) {
        faceCount = faceCount + 1
      }
    }

    rows.push({ id: group.id, name: group.name, label: displayNameOf(group), faceCount })
  }

  sections.push({ mapId: current, title: titleOfMap(current), isCurrent: true, groups: rows })

  const others = Object.entries(storedGroups.value)
    .filter(([mapId, entry]) => {
      return mapId !== current && entry.groups.length > 0
    })
    .toSorted((one, other) => {
      return one[1].title.localeCompare(other[1].title)
    })

  for (const [mapId, entry] of others) {
    const storedRows: FaceGroupRow[] = entry.groups.map((group) => {
      return { id: group.id, name: group.name, label: storedNameOf(group), faceCount: group.faces.length }
    })

    sections.push({ mapId, title: entry.title, isCurrent: false, groups: storedRows })
  }

  return sections
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
 * Writes one level's entry into the storage, and into the ref the sections read.
 *
 * @param mapId The level the entry belongs to.
 * @param entry The groups of the level.
 */
function writeEntry(mapId: string, entry: StoredMapGroups): void {
  const next = { ...storedGroups.value, [mapId]: entry }

  storedGroups.value = next
  writeStoredGroups(next)
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
    }
  })

  writeEntry(activeMapId, { title: titleOfMap(activeMapId), nextId: nextGroupId, groups })
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

  const group: FaceGroup = { id, name: '', members }

  activeFaceGroups.value = [...activeFaceGroups.value, group]
  saveOpenLevel()

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
    activeFaceGroups.value = activeFaceGroups.value.map((group) => {
      if (group.id !== groupId) {
        return group
      }

      return { ...group, name: trimmed }
    })
    saveOpenLevel()

    return
  }

  const entry = storedGroups.value[mapId]

  if (entry === undefined) {
    return
  }

  const groups = entry.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, name: trimmed }
  })

  writeEntry(mapId, { ...entry, groups })
}

/**
 * Takes groups out of a level.
 *
 * @remarks
 * Only the groups go: the faces they held stay in the level (and in the other groups they are in), and a group that is
 * deleted is not a step of the history. The groups of a level that is not open are dropped from the storage alone.
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
    activeFaceGroups.value = activeFaceGroups.value.filter((group) => {
      return !ids.has(group.id)
    })
    saveOpenLevel()

    return
  }

  const entry = storedGroups.value[mapId]

  if (entry === undefined) {
    return
  }

  const groups = entry.groups.filter((group) => {
    return !ids.has(group.id)
  })

  writeEntry(mapId, { ...entry, groups })
}

/**
 * Puts the groups of a level into the ref, resolved against the map of that level.
 *
 * @param id The value of the map.
 * @param map The map the groups belong to.
 */
function loadGroupsOf(id: string, map: ArxMap): void {
  activeMapId = id
  activeMap = map

  const entry = storedGroups.value[id]

  if (entry === undefined) {
    activeFaceGroups.value = []
    nextGroupId = 1
    isLoaded = true

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

    return { id: group.id, name: group.name, members }
  })

  activeFaceGroups.value = groups
  isLoaded = true
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

  onKeyboardAction('createFaceGroup', createFaceGroupFromSelection)
}
