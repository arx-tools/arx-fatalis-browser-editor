import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { cameraAngle, cameraPosition } from '../../../components/widgets/camera/cameraState.ts'
import { cameraStore } from '../../../components/widgets/camera/cameraStore.ts'
import { history } from '../../history/history.ts'
import { mapHistoryRecords, type HistorySnapshot } from '../../history/mapHistory.ts'
import { readStoredHistory, writeStoredHistory } from '../../history/mapHistoryStorage.ts'
import type { StorageLike } from '../../persistedRef/storage.ts'
import { getUrlAdapter, writeUrlValue } from '../../persistedRef/url.ts'
import { FLAT_PRESET, MINIMAL_PRESET, type NewLevelPreset } from '../blankLevel.ts'
import { restoreMapHistory, saveMapHistory } from '../edit/editing.ts'
import { paintLevel } from '../edit/levelTextures.ts'
import { levelStore } from '../edit/levelStore.ts'
import type { LevelManifest } from '../../../../generator/manifest.ts'
import type { EditorSettings } from './editorSettings.ts'
import { clearDataDirScan, readDataFile, scanLevelNumbers } from './dataDir.ts'
import { MAP_PARAMETER, mapSlugOf, rememberMapId } from './maps/mapId.ts'
import {
  cameraPoseOf,
  isStoredPose,
  poseForOpenOf,
  poseKeyOf,
  readMapPoses,
  writeMapPoses,
  type StoredPose,
} from './maps/mapPoses.ts'
import { trackPoseOf } from './maps/poseTracking.ts'
import {
  createBlankLevelSource,
  createOriginalLevelSource,
  ZIP_URL_PARAMETER,
  type LevelSource,
} from './levelSource.ts'
import { createZipLevelSource, isZipLevelSource } from './zipSource.ts'

/**
 * The maps the editor can open: the blank presets it brings, the original levels of the data directory, and the zips
 * that were opened in the session.
 *
 * @remarks
 * The header shows them in one list (`Maps to open (N)`), grouped by where they come from. The list is what the old
 * `?fromOriginalArxLevel` parameter was: a level is chosen here, and switching one **replaces the map in the store** —
 * the page does not load again, so the layout and the camera controls survive the change. The choice goes into the url
 * (`?map=`) and into the browser, so a reload starts from the map of the last visit, and the camera from the pose that
 * map was left at (see {@link moveCameraToPoseOfOpen}).
 */

/**
 * The group of a map, in the order the list shows them.
 */
export type MapGroup = 'blank' | 'arx' | 'custom'

/**
 * One map the editor can open.
 */
export interface MapEntry {
  /**
   * The value of the list, like `blank:minimal` or `arx:8`.
   */
  readonly id: string
  /**
   * Where the map comes from.
   */
  readonly group: MapGroup
  /**
   * What the list shows.
   */
  readonly label: string
  /**
   * Whether the map has steps on it (a change that can be taken back).
   *
   * @remarks
   * The select no longer shows it (a native `<option>` can not carry a colour, and the dot it did carry read as a
   * character of the name — TODO 120), but the list keeps the value: a marker of the header can read it.
   */
  readonly edited: boolean
}

/**
 * The name of the group of a map, the way the header writes it before the name of the map (`Blank: Flat Plane`).
 *
 * @remarks
 * The rows of the list do not carry it (the `<optgroup>` of a section says where the map comes from), the **chosen**
 * map does: the header shows `Blank: Flat Plane` with the select, and the list under it only `Minimal`, `Flat Plane`.
 */
export const MAP_GROUP_PREFIXES: Readonly<Record<MapGroup, string>> = {
  blank: 'Blank',
  arx: 'Arx',
  custom: 'Custom',
}

/**
 * Writes a name in Pascal Case: `lalee-s_minigame.zip` → `Lalee S Minigame`.
 *
 * @remarks
 * The maps of the session are named after the zip they came from, and a file name is lowercase with dashes more often
 * than not. The extension goes, and the name is cut into words at the dashes, the underscores, the dots and the spaces;
 * every word keeps its own letters (only the first one is upper), so a name that was written with care survives.
 *
 * @param name The name of the file or the map.
 *
 * @returns The name in Pascal Case, or an empty string when it has no letter or number in it.
 */
export function pascalCaseOf(name: string): string {
  const withoutExtension = name.replace(/\.[^.]*$/u, '')
  const words = withoutExtension.split(/[^\p{Letter}\p{Number}]+/u).filter((word) => {
    return word.length > 0
  })

  return words
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Finds the map of the list by its value.
 *
 * @param id The value of the map, like `blank:flat`.
 * @param groups The groups of the list.
 *
 * @returns The entry, or `undefined` when the list has no such map.
 */
export function mapEntryOf(id: string, groups: readonly MapGroupEntry[]): MapEntry | undefined {
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.id === id) {
        return entry
      }
    }
  }

  return undefined
}

/**
 * One group of the list.
 */
export interface MapGroupEntry {
  /**
   * Where the maps of the group come from.
   */
  readonly group: MapGroup
  /**
   * The name of the group in the list.
   */
  readonly label: string
  /**
   * The maps of the group, in order.
   */
  readonly entries: MapEntry[]
}

/**
 * The blank presets the list brings, by the name of the preset.
 *
 * @remarks
 * The two the generator defines: the `Minimal` one (a single quad under the player) and the `Flat Plane` one (the 11×11
 * floor the editor opens with nothing in the url). The name in the list is only the name, because the row of the list is
 * under the `<optgroup>` of its group and the header puts the `Blank:` before the chosen one (2026-11-06).
 */
const BLANK_PRESETS: ReadonlyArray<{ id: string; label: string; preset: NewLevelPreset }> = [
  { id: 'minimal', label: 'Minimal', preset: MINIMAL_PRESET },
  { id: 'flat', label: 'Flat Plane', preset: FLAT_PRESET },
]

/**
 * The original levels of the data directory, from 0.
 *
 * @remarks
 * Empty without a data directory: the list of the game's levels is what the folder has, and a folder that is not there
 * has none.
 */
export const arxLevels = ref<number[]>([])

/**
 * The zips that were opened in the session.
 *
 * @remarks
 * The bytes are kept, so the list can go back to a level the editor opened an hour ago without asking for the file
 * again. A reload empties it (the persistence of the level is a later round).
 */
export const customMaps = shallowRef<Array<{ readonly label: string; readonly data: ArrayBuffer }>>([])

/**
 * The map the editor opens when nothing else says one.
 *
 * @remarks
 * It is the Flat level: the editor starts with a place to build on instead of a dot, and a map the url names but the
 * list does not have falls back here.
 */
export const DEFAULT_MAP_ID = 'blank:flat'

/**
 * The map the store holds now.
 */
export const currentMapId = ref<string>(DEFAULT_MAP_ID)

/**
 * The source the editor started with.
 *
 * @remarks
 * A data directory that arrives **after** the start (the folder of the header) has to load the level the url named: the
 * url does not keep that name (the list of the maps carries it), so the source of the start is kept here.
 */
let startup: LevelSource | undefined

/**
 * Remembers the source the editor started with.
 *
 * @param source The source of the level of the session.
 */
export function setStartupSource(source: LevelSource): void {
  startup = source
}

/**
 * The source the editor started with, for a level that could not load without a data directory.
 *
 * @returns The source, or `undefined` when the editor has not started one.
 */
export function startupSource(): LevelSource | undefined {
  return startup
}

/**
 * The map the url named at the start of the visit.
 *
 * @remarks
 * The url is a map and a pose **pair**: the pose in it belongs to the map it names beside itself, so the value is read
 * once, at the start, before the editor writes its own map into the address bar. A pose without a map is the pose of the
 * map the editor opens.
 */
let startupMapId: string | undefined

/**
 * Whether no map has opened in this visit yet.
 *
 * @remarks
 * The pose of the url is the view of the visit, and it is about the map that opens first (the link is the state of the
 * screen it was copied from). After that first map the url carries the live pose of the screen, not a pose to apply.
 */
let isFirstOpen = true

/**
 * Remembers the map the url named, so its pose goes to it.
 *
 * @param id The value of the map the url named, or `undefined` when it named none.
 */
export function rememberStartupMapId(id: string | undefined): void {
  startupMapId = id
}

/**
 * The pose the url carried at the start of the visit, when it carried a usable one.
 */
let startupPose: StoredPose | undefined

/**
 * Remembers the pose the url carries, before a map is on the screen.
 *
 * @remarks
 * The pose has to be read while the url is still the only thing that wrote the camera refs: the walkable view reports its
 * own pose as soon as a level lands, and a read after that would take the pose of the view for the pose of the link. That
 * is also why a link of a level that needs the data dir keeps its pose while the notice waits.
 */
export function rememberStartupPose(): void {
  const position = cameraPosition.value
  const rotation = cameraAngle.value

  if (position === undefined || rotation === undefined) {
    startupPose = undefined

    return
  }

  const pose = { position, rotation }

  if (!isStoredPose(pose)) {
    startupPose = undefined

    return
  }

  startupPose = pose
}

/**
 * The state the editor kept in the zip the map on the screen came from.
 *
 * @remarks
 * The editor's state is the pose of its camera (which is not the spawn of the level) and the steps of the level: an
 * archive of an editor carries both, in its `editor/settings.json`.
 */
export const currentMapSettings = shallowRef<EditorSettings | undefined>(undefined)

/**
 * The manifest of the zip the map on the screen came from.
 *
 * @remarks
 * The manifest is the one the zip carried: the export writes it back over the base of the generator, so the name, the
 * version, the description, the author and the url of a mod survive an editor round. A map that did not come from a zip
 * (a level of the game, a blank map) has none.
 */
export const currentMapManifest = shallowRef<LevelManifest | undefined>(undefined)

/**
 * Reads the manifest a source carries, once it is loaded.
 *
 * @param source The source the map was opened from.
 *
 * @returns The manifest of the zip, or `undefined` when the source is not a zip, or its zip has none.
 */
export function zipManifestOf(source: LevelSource): LevelManifest | undefined {
  if (!isZipLevelSource(source)) {
    return undefined
  }

  return source.manifest()
}

/**
 * Reads the state the editor kept in a zip, once it is loaded.
 *
 * @param source The source the map was opened from.
 *
 * @returns The state, or `undefined` when the source is not a zip, or its zip has none.
 */
export function zipSettingsOf(source: LevelSource): EditorSettings | undefined {
  if (!isZipLevelSource(source)) {
    return undefined
  }

  return source.settings()
}

/**
 * Takes the steps a zip carries, so the level it opened has them.
 *
 * @remarks
 * An archive of the editor keeps the steps with the level they were made on, and the caller replays them onto that
 * source (see {@link restorePersistedHistory}): the steps become the steps of the map under its value, which is how the
 * map gets its undo chain back. A zip without them leaves the map as it is, and so does a level that came from anywhere
 * else.
 *
 * @param id The value of the map the source was opened as.
 * @param source The source the map came from.
 */
export function adoptHistoryOf(id: string, source: LevelSource): void {
  if (!isZipLevelSource(source)) {
    return
  }

  const history = source.settings()?.history

  if (history === undefined) {
    return
  }

  writeStoredHistory(id, history)
}

/**
 * Reads the pose the browser stored for a map.
 *
 * @param id The value of the map.
 *
 * @returns The pose, or `undefined` when the browser has none for the map.
 */
export function poseOfMap(id: string): StoredPose | undefined {
  return readMapPoses()[poseKeyOf(id, customMaps.value)]
}

/**
 * Puts the camera where the map that just opened was left, or where the url says.
 *
 * @remarks
 * The rule of the pose is {@link poseForOpenOf}: the url's pose wins at the first open of the visit, and only for the
 * map it names; otherwise the browser's pose of the map decides, and the map opens on its spawn when it has none. The
 * pose goes into the url too, so a link copied from the screen carries the pair, and the view that mounts later finds
 * it there.
 *
 * The pose the map takes is written down as the pose of that map, so the pose of a link survives a visit that has no
 * link, even when no view was there to report it.
 *
 * A map without a pose opens on the spawn: the camera refs are cleared, because the numbers left in them are the pose of
 * the map that went away, and a view that mounts later would take them as this map's own.
 *
 * @param id The value of the map that opened.
 */
export function moveCameraToPoseOfOpen(id: string): void {
  const key = poseKeyOf(id, customMaps.value)
  const pose = poseForOpenOf({
    id,
    key,
    urlPose: startupPose,
    urlMapId: startupMapId,
    storedPoses: readMapPoses(),
    archivePose: currentMapSettings.value?.camera,
    isFirstOpen,
  })

  isFirstOpen = false
  trackPoseOf(key)

  if (pose === undefined) {
    cameraPosition.value = undefined
    cameraAngle.value = undefined
    cameraStore.moveToSpawn()

    return
  }

  writeMapPoses({ [key]: pose })
  cameraPosition.value = pose.position
  cameraAngle.value = pose.rotation
  cameraStore.moveCamera(cameraPoseOf(pose))
}

/**
 * Reads the maps that have changes on them.
 *
 * @remarks
 * A map that was put away keeps its steps in the store; the map on the screen is the live history, and its saved list
 * is from the last time it was put away, so the two are read together: the live one wins for the current map (an undo
 * of every step makes the map clean again).
 *
 * @param saved The steps of every map that was put away.
 * @param currentId The value of the map on the screen.
 * @param currentEdited Whether the map on the screen has a step that can be taken back.
 *
 * @returns The values of the maps that have changes on them.
 */
export function editedMapIdsOf(
  saved: ReadonlyMap<string, HistorySnapshot>,
  currentId: string,
  currentEdited: boolean,
): ReadonlySet<string> {
  const ids = new Set<string>()

  for (const [id, snapshot] of saved) {
    // a map whose every step was taken back is the level of its files again: it has no changes to show
    if (snapshot.position > 0) {
      ids.add(id)
    }
  }

  if (currentEdited) {
    ids.add(currentId)
  } else {
    ids.delete(currentId)
  }

  return ids
}

/**
 * The maps that have changes on them.
 */
export const editedMapIds = computed<ReadonlySet<string>>(() => {
  return editedMapIdsOf(mapHistoryRecords.value, currentMapId.value, history.edited.value)
})

/**
 * The groups of the list, in the order the header shows them.
 */
export const mapGroups = computed<MapGroupEntry[]>(() => {
  const edited = editedMapIds.value
  const blanks: MapEntry[] = BLANK_PRESETS.map((entry) => {
    const id = `blank:${entry.id}`

    return { id, group: 'blank', label: entry.label, edited: edited.has(id) }
  })
  const arx: MapEntry[] = arxLevels.value.map((level) => {
    const id = `arx:${String(level)}`

    return { id, group: 'arx', label: `Level ${String(level)}`, edited: edited.has(id) }
  })
  const custom: MapEntry[] = customMaps.value.map((entry, index) => {
    const id = `custom:${String(index)}`

    return { id, group: 'custom', label: pascalCaseOf(entry.label), edited: edited.has(id) }
  })

  const groups: MapGroupEntry[] = [
    { group: 'blank', label: 'Blank maps', entries: blanks },
    { group: 'arx', label: 'Original Arx levels', entries: arx },
    { group: 'custom', label: 'Custom maps', entries: custom },
  ]

  return groups.filter((group) => {
    return group.entries.length > 0
  })
})

/**
 * The level a map of the data dir names, when the editor has no folder to open it from.
 *
 * @remarks
 * A link may name a level of the game (`arx-fatalis-level-11`), and without the data dir the list has none of them: the
 * editor opens the blank level, so the author has something to work on, and the notice over the view says why the map
 * of the link is not there. A map the folder simply does not have (a stale link, a level the game does not ship) is not
 * this case, and neither is a link to a blank map.
 *
 * @param requested The map the url names, when it names one.
 * @param isAvailable Whether the list of the maps has that map.
 * @param hasFolder Whether the editor has a data dir.
 * @param isRestorable Whether the browser remembers the folder, so one press brings it back (the notice is for a folder
 * that is really gone).
 *
 * @returns The label of the level, like `Level 11`, or `undefined` when nothing is missing.
 */
export function missingDataDirMapOf(
  requested: string | undefined,
  isAvailable: boolean,
  hasFolder: boolean,
  isRestorable = false,
): string | undefined {
  if (requested === undefined || isAvailable || hasFolder || isRestorable || !requested.startsWith('arx:')) {
    return undefined
  }

  return `Level ${requested.slice('arx:'.length)}`
}

/**
 * The map of a link that the editor could not open, because the data dir of the game is not set.
 */
export interface MissingMap {
  /**
   * The label of the level, like `Level 11`.
   */
  readonly label: string
  /**
   * The name of the map with its group, like `Arx: Level 11`, the way the header writes it.
   */
  readonly name: string
  /**
   * Whether the map has steps from a previous visit, which are waiting for the level.
   */
  readonly hasChanges: boolean
}

/**
 * The level a link names that the editor could not open, because the data dir of the game is not set.
 *
 * @remarks
 * The notice over the walkable view reads it, and a map that opens clears it: one level, one reason.
 */
export const mapNeedingDataDir = shallowRef<MissingMap | undefined>(undefined)

/**
 * Whether a map has steps that can be taken back: the changes of a visit before.
 *
 * @remarks
 * The steps of a level are written down (the history survives a reload), so a map that is not on the screen can still
 * have changes, and its steps are read from the storage: the memory holds the maps the session has already put away, and
 * a level that never opened in this session is not one of them.
 *
 * @param id The value of the map.
 * @param storage The storage to read, the `localStorage` of the page by default.
 *
 * @returns True when the map has steps to take back.
 */
export function hasChangesOf(id: string, storage?: StorageLike): boolean {
  const stored = readStoredHistory(id, storage)

  return stored !== undefined && stored.position > 0
}

/**
 * The map a link asked for, when the editor could not open it.
 *
 * @remarks
 * The folder may arrive later than the page (the author picks it, or a reload of the previous visit gets it back), and
 * then the map of the link has to open. This is what the editor was asked for, so the opening does not depend on the
 * address bar: it is read once, at the start, and it is dropped when a map opens.
 */
export const requestedMapId = shallowRef<string | undefined>(undefined)

/**
 * How many maps the list has.
 */
export const mapCount = computed(() => {
  return mapGroups.value.reduce((sum, group) => {
    return sum + group.entries.length
  }, 0)
})

/**
 * Reads the levels the data directory has.
 *
 * @remarks
 * A level is a folder with the three files of it: the scene (`fast.fts`), the dlf and the llf. The number of a level is
 * its folder's, so the list can say `Level 8` and open it by that.
 *
 * @returns The numbers of the levels, in order.
 */
export async function scanArxLevels(): Promise<number[]> {
  const levels = await scanLevelNumbers()

  arxLevels.value = levels

  return levels
}

/**
 * Forgets the levels of the data directory (a folder that was taken away).
 */
export function forgetArxLevels(): void {
  arxLevels.value = []
  clearDataDirScan()
}

/**
 * Remembers a zip the editor opened, so the list can go back to it.
 *
 * @param label The name of the zip.
 * @param data The bytes of the zip.
 *
 * @returns The value of the map in the list.
 */
export function rememberCustomMap(label: string, data: ArrayBuffer): string {
  const index = customMaps.value.length

  customMaps.value = [...customMaps.value, { label, data }]

  return `custom:${String(index)}`
}

/**
 * Builds the source of a map of the list.
 *
 * @param id The value of the map, like `arx:8`.
 *
 * @returns The source, or `undefined` when the list has no such map.
 */
function sourceOf(id: string): LevelSource | undefined {
  const [group, value] = id.split(':', 2)

  if (group === 'blank') {
    const preset = BLANK_PRESETS.find((entry) => {
      return entry.id === value
    })

    if (preset === undefined) {
      return undefined
    }

    return createBlankLevelSource(preset.preset)
  }

  if (group === 'arx') {
    const level = Number(value)

    if (!Number.isSafeInteger(level)) {
      return undefined
    }

    return createOriginalLevelSource(level)
  }

  if (group === 'custom') {
    const entry = customMaps.value[Number(value)]

    if (entry === undefined) {
      return undefined
    }

    return createZipLevelSource(entry.label, entry.data)
  }

  return undefined
}

/**
 * Opens a map of the list, in place.
 *
 * @remarks
 * The map replaces the one in the store, and the steps of the map that goes away are put aside by its value (see
 * {@link saveMapHistory}): the map that comes back is loaded again and its steps are replayed onto it
 * ({@link restoreMapHistory}). The selection is dropped with the map, and the camera goes to the place the map was left
 * at, see {@link moveCameraToPoseOfOpen}.
 *
 * @param id The value of the map, like `arx:8`.
 *
 * @returns A promise that settles when the map is on the screen and painted.
 */
export async function openMap(id: string): Promise<void> {
  const source = sourceOf(id)

  if (source === undefined) {
    return
  }

  // the steps of the map on the screen are its own: they are put aside before the map goes away, and the map that comes
  // back gets them again below. A map that never opened (the notice of a level that needs the folder waits while no level
  // is on the screen) has no steps to put aside, and its empty history would overwrite the steps a visit before wrote
  // down for the map of the link (2026-11-12, the owner lost them like that)
  if (levelStore.map.value !== undefined) {
    saveMapHistory(currentMapId.value)
  }

  let zipData: ArrayBuffer | undefined

  if (isZipLevelSource(source)) {
    zipData = source.data()
  }

  await levelStore.openLevel(source, async (map): Promise<void> => {
    await paintLevel(map, zipData)
  })

  // the map of the link is not missing any more: the notice of the view has nothing to say
  mapNeedingDataDir.value = undefined
  requestedMapId.value = undefined

  if (levelStore.status.value !== 'ready') {
    return
  }

  currentMapId.value = id
  currentMapManifest.value = zipManifestOf(source)
  currentMapSettings.value = zipSettingsOf(source)
  adoptHistoryOf(id, source)

  // the address bar keeps the map of the screen, and a map picked from the list is not the zip of the url any more: the
  // zip of a previous link must not come back on a reload. The map is written here too, not only by the watcher of
  // `startMapPersistence`: a map that is the one the editor started with (a blank level after a link was declined) does
  // not change the value, so the watcher would not fire and the link would come back on the next visit
  const mapUrl = getUrlAdapter(undefined)

  if (mapUrl !== undefined) {
    writeUrlValue(mapUrl, ZIP_URL_PARAMETER, undefined)
    writeUrlValue(mapUrl, MAP_PARAMETER, mapSlugOf(id))
  }

  // the map change clears the live history (its steps are indices of the map that went away): the tick lets that
  // happen before the steps of this map are put back
  await nextTick()

  const map = levelStore.map.value

  if (map !== undefined) {
    restoreMapHistory(id, map)
  }

  // the replay changes the level (the revision is watched, so the paint follows it), and the camera goes after that; the
  // tick also lets the walkable view rebuild itself around the new map first
  await nextTick()

  moveCameraToPoseOfOpen(id)
}

/**
 * Puts the stored steps of the map on the screen back on it, after a reload.
 *
 * @remarks
 * It is the reload half of {@link openMap}: the level is on the screen and painted, and the steps that were written down
 * come back on it. The tick is the one of `openMap`: the map change clears the live history first (the steps of the
 * level that went away are not the steps of this one), and only then can the stored ones be replayed; the second tick
 * lets the views follow the replay before anything else happens.
 */
export async function restorePersistedHistory(): Promise<void> {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  await nextTick()
  restoreMapHistory(currentMapId.value, map)
  await nextTick()
}

/**
 * Reads the map of the url when the list has it.
 *
 * @remarks
 * A blank preset is always there; a level of the game needs its folder to have it (the list of the maps is the levels
 * the data directory was scanned for), and a zip needs the session that opened it. Anything else is not a map the
 * editor can open, so the caller falls back to {@link DEFAULT_MAP_ID}.
 *
 * @param id The map of the url, or `undefined` when it names none.
 * @param levels The levels of the data directory.
 *
 * @returns The value of the map when the list has it, `undefined` when it does not.
 */
export function availableMapIdOf(id: string | undefined, levels: readonly number[]): string | undefined {
  if (id === undefined || sourceOf(id) === undefined) {
    return undefined
  }

  const [group, value] = id.split(':', 2)

  if (group === 'arx' && !levels.includes(Number(value))) {
    return undefined
  }

  return id
}

/**
 * Keeps the map of the screen in the url.
 *
 * @remarks
 * The url is the api of the editor: a link is the whole state, and the map is part of it now. The write goes through
 * `replaceState`, so the back button still leaves the page — the same rule as the other persisted values.
 */
export function startMapPersistence(): void {
  watch(currentMapId, (id) => {
    const url = getUrlAdapter(undefined)

    if (url !== undefined) {
      writeUrlValue(url, MAP_PARAMETER, mapSlugOf(id))
    }

    // the next visit starts from this map, even without a link: the address bar is not the only memory
    rememberMapId(id)
  })
}

/**
 * Reads the data directory again, after the user picked a folder.
 *
 * @returns The numbers of the levels the folder has.
 */
export async function refreshDataDir(): Promise<number[]> {
  return await scanArxLevels()
}

/**
 * Whether the data directory has a file the editor needs, for the messages of the header.
 *
 * @param path The path inside the data directory.
 *
 * @returns True when the folder has it.
 */
export async function hasDataFile(path: string): Promise<boolean> {
  return (await readDataFile(path)) !== undefined
}
