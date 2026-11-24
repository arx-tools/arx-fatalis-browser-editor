import type { ArxPolygon } from 'arx-convert/types'
import { type ComputedRef, computed } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { repaintLevelView } from '../level/edit/levelTextures.ts'
import { writeBakedColors } from '../level/edit/levelTextures/bakedColors.ts'
import { MAP_GROUP_PREFIXES, mapEntryOf, mapGroups as mapEntries } from '../level/source/maps.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { activeFaceGroups, presentPolygons, storedGroups } from './groupState.ts'
import type { FaceGroup, FaceGroupRow } from './groupTypes.ts'

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
export function withoutOverlapsOf(groups: readonly FaceGroup[], present: ReadonlySet<ArxPolygon>): FaceGroup[] {
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
export function titleOfMap(id: string): string {
  const entry = mapEntryOf(id, mapEntries.value)

  if (entry !== undefined) {
    return `${MAP_GROUP_PREFIXES[entry.group]}: ${entry.label}`
  }

  return storedGroups.value[id]?.title ?? id
}

/**
 * Reads the polygons of the level on the screen into {@link presentPolygons}.
 */
export function refreshPresentPolygons(): void {
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
export function indexMapOf(map: ArxMap): Map<ArxPolygon, number> {
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
export function applyHiddenPolygons(): void {
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
