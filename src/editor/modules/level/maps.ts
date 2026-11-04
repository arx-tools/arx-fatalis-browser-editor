import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { cameraStore } from '../../components/widgets/cameraStore.ts'
import { history } from '../history/history.ts'
import { mapHistoryRecords } from '../history/mapHistory.ts'
import type { HistoryRecord } from '../history/records.ts'
import { persistedRef } from '../persistedRef/persistedRef.ts'
import { getLocalStorage, type StorageLike } from '../persistedRef/storage.ts'
import { getUrlAdapter, readUrlValue, writeUrlValue, type UrlAdapter } from '../persistedRef/url.ts'
import { FLAT_PRESET, MINIMAL_PRESET, type NewLevelPreset } from './blankLevel.ts'
import { clearDataDirScan, readDataFile, scanLevelNumbers } from './dataDir.ts'
import { restoreMapHistory, saveMapHistory } from './editing.ts'
import { paintLevel } from './levelTextures.ts'
import { levelStore } from './levelStore.ts'
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
 * the page does not load again, so the layout and the camera controls survive the change. The choice is not in the url
 * yet (that is the persistence round): a reload starts from the blank level, or from what the url names.
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
 * The two the generator defines: the `Minimal` one (a single quad) and the `Flat` one (the 11×11 floor the editor opens
 * with nothing in the url).
 */
const BLANK_PRESETS: ReadonlyArray<{ id: string; label: string; preset: NewLevelPreset }> = [
  { id: 'minimal', label: 'Minimal — one quad', preset: MINIMAL_PRESET },
  { id: 'flat', label: 'Flat — 11×11 tiles', preset: FLAT_PRESET },
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
 * The url parameter that carries the map on the screen, like `?map=arx:8`.
 *
 * @remarks
 * It is the value of the list ({@link MapEntry.id}), so a link says which map it is about. The map of the url is read
 * at start and written when the map changes; a value the list does not have (a map of a data directory the browser no
 * longer has, or a zip of a previous session) falls back to {@link DEFAULT_MAP_ID} — the message about it is the todo
 * of a later round.
 */
export const MAP_PARAMETER = 'map'

/**
 * The map the store holds now.
 */
export const currentMapId = ref<string>(DEFAULT_MAP_ID)

/**
 * The map that was opened last, in the browser.
 *
 * @remarks
 * A `persistedRef` in the `localStorage`: the editor opens the Flat level at start (the level in the url is a later
 * round), so the map of the last visit says whether the camera that was left is the camera of **this** level. When the
 * level that loads is another one, the camera goes to its spawn and the persisted pose of the other level is dropped —
 * a pose is a place in a level, and the same numbers mean another place in another level.
 */
export const lastMapId = persistedRef<string | undefined>({
  key: 'lastMap',
  persistInLocalStorage: true,
})

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
  saved: ReadonlyMap<string, readonly HistoryRecord[]>,
  currentId: string,
  currentEdited: boolean,
): ReadonlySet<string> {
  const ids = new Set<string>()

  for (const [id, records] of saved) {
    if (records.length > 0) {
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

    return { id, group: 'arx', label: `arx level ${String(level)}`, edited: edited.has(id) }
  })
  const custom: MapEntry[] = customMaps.value.map((entry, index) => {
    const id = `custom:${String(index)}`

    return { id, group: 'custom', label: entry.label, edited: edited.has(id) }
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
 * its folder's, so the list can say `arx level 8` and open it by that.
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
 * What opening a map does with the camera.
 */
export interface OpenMapOptions {
  /**
   * Whether the camera goes to the spawn of the new level.
   *
   * @remarks
   * A switch the user makes lands somewhere instead of the place the old level left the camera at. The map of the url
   * at start keeps the pose the url (or the last visit) carries: the camera goes to the spawn there only when the
   * level is not the one of the last visit (`App.vue` watches that).
   */
  readonly camera?: 'spawn' | 'keep'
}

/**
 * Opens a map of the list, in place.
 *
 * @remarks
 * The map replaces the one in the store, and the steps of the map that goes away are put aside by its value (see
 * {@link saveMapHistory}): the map that comes back is loaded again and its steps are replayed onto it
 * ({@link restoreMapHistory}). The selection is dropped with the map.
 *
 * @param id The value of the map, like `arx:8`.
 * @param options What the camera does; it goes to the spawn of the level by default.
 *
 * @returns A promise that settles when the map is on the screen and painted.
 */
export async function openMap(id: string, options: OpenMapOptions = {}): Promise<void> {
  const source = sourceOf(id)

  if (source === undefined) {
    return
  }

  // the steps of the map on the screen are its own: they are put aside before the map goes away, and the map that
  // comes back gets them again below
  saveMapHistory(currentMapId.value)

  let zipData: ArrayBuffer | undefined

  if (isZipLevelSource(source)) {
    zipData = source.data()
  }

  await levelStore.openLevel(source, async (map): Promise<void> => {
    await paintLevel(map, zipData)
  })

  if (levelStore.status.value !== 'ready') {
    return
  }

  currentMapId.value = id
  lastMapId.value = id

  // a map picked from the list is not the zip of the url any more: the address bar keeps the map (the watcher of
  // `startMapPersistence` writes it), and the zip of a previous link must not come back on a reload
  const mapUrl = getUrlAdapter(undefined)

  if (mapUrl !== undefined) {
    writeUrlValue(mapUrl, ZIP_URL_PARAMETER, undefined)
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

  if (options.camera !== 'keep') {
    cameraStore.moveToSpawn()
  }
}

/**
 * Reads the map the url names.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The value of the map, or `undefined` when the url says nothing usable.
 */
/**
 * The key the map of the last visit is kept under in the browser.
 */
const MAP_STORAGE_KEY = 'map'

/**
 * The name a map carries in the url, with hyphens instead of the colon of its value.
 *
 * @remarks
 * The value of a map is an id of the editor (`arx:8`, `blank:flat`, `custom:0`), and the colon of it is escaped in a
 * url (`arx%3A8`), which reads badly in a bar a link is copied from. The name is the same map without the escape:
 * `arx-fatalis-level-8`, `blank-flat`, `custom-0`.
 *
 * @param id The value of the map.
 *
 * @returns The name the url and the storage carry.
 */
export function mapSlugOf(id: string): string {
  if (id.startsWith('arx:')) {
    return `arx-fatalis-level-${id.slice(4)}`
  }

  return id.replace(':', '-')
}

/**
 * The value of a map, from the name a url or the storage carries.
 *
 * @remarks
 * The old form of the value (`arx:8`) is read too, so a link of before the names keeps working.
 *
 * @param slug The name the url or the storage carries.
 *
 * @returns The value of the map, or `undefined` when the name is not one.
 */
export function mapIdOfSlug(slug: string): string | undefined {
  const value = slug.trim()

  if (value.startsWith('arx-fatalis-level-')) {
    return `arx:${value.slice('arx-fatalis-level-'.length)}`
  }

  if (value.startsWith('arx-')) {
    return `arx:${value.slice(4)}`
  }

  if (value.includes(':')) {
    return value
  }

  if (value.startsWith('blank-')) {
    return `blank:${value.slice(6)}`
  }

  if (value.startsWith('custom-')) {
    return `custom:${value.slice(7)}`
  }

  return undefined
}

/**
 * The map of the last visit, from the storage of the browser.
 *
 * @param storage The storage to read, the local storage of the page by default.
 *
 * @returns The value of the map, or `undefined` when the browser has none.
 */
export function storedMapId(storage: StorageLike | undefined = getLocalStorage(undefined)): string | undefined {
  if (storage === undefined) {
    return undefined
  }

  try {
    const stored = storage.getItem(MAP_STORAGE_KEY)

    if (stored === null || stored.trim() === '') {
      return undefined
    }

    return mapIdOfSlug(stored)
  } catch {
    return undefined
  }
}

/**
 * Remembers the map of the session for the next visit.
 *
 * @param id The value of the map.
 * @param storage The storage to write, the local storage of the page by default.
 */
export function rememberMapId(id: string, storage: StorageLike | undefined = getLocalStorage(undefined)): void {
  if (storage === undefined) {
    return
  }

  try {
    storage.setItem(MAP_STORAGE_KEY, mapSlugOf(id))
  } catch {
    // a browser that refuses to write keeps the url only: the next visit starts from the default
  }
}

export function mapIdFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, MAP_PARAMETER)

  // an empty parameter (`?map=`) says nothing, the same as no parameter at all
  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  return mapIdOfSlug(raw) ?? raw.trim()
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
