import { computed, nextTick, ref, shallowRef } from 'vue'
import { cameraStore } from '../../components/widgets/cameraStore.ts'
import { FLAT_PRESET, MINIMAL_PRESET, type NewLevelPreset } from './blankLevel.ts'
import { clearDataDirScan, readDataFile, scanLevelNumbers } from './dataDir.ts'
import { paintLevel } from './levelTextures.ts'
import { levelStore } from './levelStore.ts'
import { createBlankLevelSource, createOriginalLevelSource, type LevelSource } from './levelSource.ts'
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
 * The map the store holds now.
 */
export const currentMapId = ref<string>('blank:flat')

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
 * The groups of the list, in the order the header shows them.
 */
export const mapGroups = computed<MapGroupEntry[]>(() => {
  const blanks: MapEntry[] = BLANK_PRESETS.map((entry) => {
    return { id: `blank:${entry.id}`, group: 'blank', label: entry.label }
  })
  const arx: MapEntry[] = arxLevels.value.map((level) => {
    return { id: `arx:${String(level)}`, group: 'arx', label: `arx level ${String(level)}` }
  })
  const custom: MapEntry[] = customMaps.value.map((entry, index) => {
    return { id: `custom:${String(index)}`, group: 'custom', label: entry.label }
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
 * Opens a map of the list, in place.
 *
 * @remarks
 * The map replaces the one in the store (the history and the selection go with it), and the camera moves to the spawn
 * of the new level, so a jump between two maps lands somewhere instead of the place the old one left the camera at.
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

  // the new level has its own player: the camera goes there, so the view opens on it (the tick lets the walkable view
  // rebuild itself around the new map first)
  await nextTick()
  cameraStore.moveToSpawn()
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
