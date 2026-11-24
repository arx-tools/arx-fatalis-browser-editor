import type { ArxPolygon } from 'arx-convert/types'
import { shallowRef, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import type { StoredGroups } from './groupStorage.ts'
import type { FaceGroup } from './groupTypes.ts'

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
export const storedGroups = shallowRef<StoredGroups>({})

/**
 * Whether the storage keeps groups of this level on another version of its file.
 *
 * @remarks
 * The groups of a level are the indices of the file they were made on, so a level that opens from another version starts
 * without them: the note of the widget says why, and that the other groups are kept for their own version.
 */
export const groupsOnAnotherVersion = shallowRef(false)

/**
 * The state of the groups that is not a ref: the map they belong to, and the counter of their ids.
 *
 * @remarks
 * The state is one object because the parts of the module (the storage, the commands and the queries) all read it, and a
 * `let` of one file can not be written from another. A field is not a reactive value: a widget reads the refs above.
 */
export const groupState: {
  activeMap: ArxMap | undefined
  activeMapId: string | undefined
  isLoaded: boolean
  nextGroupId: number
} = {
  activeMap: undefined,
  activeMapId: undefined,
  isLoaded: false,
  nextGroupId: 1,
}
