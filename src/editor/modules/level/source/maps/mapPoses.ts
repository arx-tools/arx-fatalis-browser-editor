import type { TripleOf } from 'arx-convert/utils'
import { isGameAngleInRange, type CameraPose } from '../../../../components/widgets/camera/cameraPose.ts'
import { reportProblem } from '../../../persistedRef/persistenceProblems.ts'
import { getLocalStorage, type StorageLike } from '../../../persistedRef/storage.ts'
import { storedMapId } from './mapId.ts'

/**
 * The key every map's camera pose lives under in the browser.
 *
 * @remarks
 * The value is one JSON object, the pose of each map by its pose key ({@link poseKeyOf}): a pose is a place in a map, so
 * the same numbers mean another place in another map, and a map switch may not carry the pose of the map that went away.
 * The pose is **not** part of the history: undo and redo do not move the camera.
 */
const MAP_POSES_KEY = 'mapPoses'

/**
 * The key the camera position was stored under before the pose became per map.
 *
 * @remarks
 * The old keys are read once, by the migration, and removed: the build after it does not read them again.
 */
const LEGACY_POSITION_KEY = 'position'

/**
 * The key the camera rotation was stored under before the pose became per map.
 */
const LEGACY_ROTATION_KEY = 'rotation'

/**
 * Tells whether a value is three finite numbers.
 *
 * @param value The value to check.
 *
 * @returns True for a triplet of finite numbers.
 */
function isTripletOfFiniteNumbers(value: unknown): value is TripleOf<number> {
  if (!Array.isArray(value) || value.length !== 3) {
    return false
  }

  return value.every((part: unknown) => {
    return typeof part === 'number' && Number.isFinite(part)
  })
}

/**
 * Reads a value, without letting a blocked storage throw.
 *
 * @param storage The storage to read.
 * @param key The key to read.
 *
 * @returns The value, or `undefined` when it is missing or the storage refuses.
 */
function readValue(storage: StorageLike, key: string): string | undefined {
  try {
    return storage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Parses a stored value.
 *
 * @param raw The value the storage held.
 *
 * @returns The parsed value, or `undefined` when it is not JSON.
 */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/**
 * Takes a key out of the storage, without letting a blocked storage throw.
 *
 * @param storage The storage to write.
 * @param key The key to remove.
 */
function removeValue(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // a storage that can not remove a value can not keep one either: the migration has nothing else to do
  }
}

/**
 * Parses the value of an old pose key.
 *
 * @param raw The value the storage held, a JSON triplet.
 *
 * @returns The triplet, or `undefined` when the text is not one.
 */
function parseTriplet(raw: string | undefined): TripleOf<number> | undefined {
  if (raw === undefined) {
    return undefined
  }

  const parsed = parseJson(raw)

  if (!isTripletOfFiniteNumbers(parsed)) {
    return undefined
  }

  return parsed
}

/**
 * Where the camera stands and looks on a map, in the shape the url and the storage carry it.
 */
export interface StoredPose {
  /**
   * The eye of the camera, in the game's coordinates.
   */
  readonly position: TripleOf<number>
  /**
   * The facing of the camera: pitch and yaw in the game's degrees, and a roll that is always `0`.
   */
  readonly rotation: TripleOf<number>
}

/**
 * The stored poses, by the pose key of the map.
 */
export type StoredPoses = Readonly<Record<string, StoredPose>>

/**
 * What the pose key of a custom map needs from the zip it came from.
 */
export interface CustomMapIdentity {
  /**
   * The name of the zip, with its extension.
   */
  readonly label: string
  /**
   * The bytes of the zip: its size tells two zips of the same name apart.
   */
  readonly data: ArrayBuffer
}

/**
 * The key a map's pose is stored under.
 *
 * @remarks
 * A blank map and a level of the game have a value of their own (`blank:flat`, `arx:8`), so the value is the key. A zip
 * is a value of the session (`custom:0`), and the same zip is another value on the next visit, which is why the key of a
 * custom map carries the name of the zip with its size: the pose of a zip survives a reload and a second import.
 *
 * @param id The value of the map, like `arx:8`.
 * @param customMaps The zips the session has opened, in the order of their values.
 *
 * @returns The key of the map's pose.
 */
export function poseKeyOf(id: string, customMaps: readonly CustomMapIdentity[]): string {
  if (!id.startsWith('custom:')) {
    return id
  }

  const entry = customMaps[Number.parseInt(id.slice('custom:'.length), 10)]

  if (entry === undefined) {
    return id
  }

  return `${id}:${entry.label}:${entry.data.byteLength.toString()}`
}

/**
 * Tells whether a stored value is a pose the camera can take.
 *
 * @remarks
 * The storage and the url are texts a user can edit, so a broken value must not move the camera: the position has to be
 * three finite numbers and the angle has to be one the camera can apply.
 *
 * @param value The value to check.
 *
 * @returns True when the value is a pose of this build.
 */
export function isStoredPose(value: unknown): value is StoredPose {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as { position?: unknown; rotation?: unknown }

  if (!isTripletOfFiniteNumbers(candidate.position) || !isTripletOfFiniteNumbers(candidate.rotation)) {
    return false
  }

  const [pitch, yaw] = candidate.rotation

  return isGameAngleInRange({ pitch, yaw })
}

/**
 * Turns a stored pose into the pose the camera store and the camera controls speak.
 *
 * @param pose The stored pose.
 *
 * @returns The pose, with the two halves named.
 */
export function cameraPoseOf(pose: StoredPose): CameraPose {
  const [x, y, z] = pose.position
  const [pitch, yaw] = pose.rotation

  return { position: { x, y, z }, angle: { pitch, yaw } }
}

/**
 * Reads the stored poses.
 *
 * @remarks
 * A value of another build (or a broken one) says nothing about a level, so an entry that is not a pose of this build is
 * dropped instead of being guessed at. The other entries of the same object are kept: one broken pose is not a reason to
 * forget the rest.
 *
 * @param storage The storage to read, the localStorage of the page by default.
 *
 * @returns The poses of the maps, by their pose key; empty when there is none.
 */
export function readMapPoses(storage?: StorageLike): Record<string, StoredPose> {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return {}
  }

  const raw = readValue(target, MAP_POSES_KEY)

  if (raw === undefined) {
    return {}
  }

  const parsed = parseJson(raw)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }

  const poses: Record<string, StoredPose> = {}

  for (const [key, value] of Object.entries(parsed)) {
    if (isStoredPose(value)) {
      poses[key] = value
    }
  }

  return poses
}

/**
 * Writes the poses of the given maps, keeping the ones it does not name.
 *
 * @param poses The poses to write, by their pose key.
 * @param storage The storage to write, the localStorage of the page by default.
 */
export function writeMapPoses(poses: StoredPoses, storage?: StorageLike): void {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return
  }

  const next = { ...readMapPoses(target), ...poses }

  try {
    target.setItem(MAP_POSES_KEY, JSON.stringify(next))
  } catch {
    reportProblem('mapPoses', 'localStorage', 'The camera poses could not be saved: the storage is full.')
  }
}

/**
 * What the pose of a map that is opening depends on.
 */
export interface PoseForOpenQuery {
  /**
   * The value of the map that is opening.
   */
  readonly id: string
  /**
   * The key of the map's pose, see {@link poseKeyOf}.
   */
  readonly key: string
  /**
   * The pose the url carries, when it carries one.
   */
  readonly urlPose: StoredPose | undefined
  /**
   * The map the url names beside its pose, when it names one.
   */
  readonly urlMapId: string | undefined
  /**
   * The poses the browser has.
   */
  readonly storedPoses: StoredPoses
  /**
   * Whether this is the first map of the visit.
   */
  readonly isFirstOpen: boolean
}

/**
 * The pose the camera takes when a map opens.
 *
 * @remarks
 * The url is a `map` and a pose **pair**: the pose belongs to the map named beside it, so it is stronger than the
 * storage **for that one map**, and it never overwrites the stored pose of another map. The order is:
 *
 * 1. the first map of the visit, when the url carries a pose of it (or a pose without a map), takes that pose;
 * 2. the pose the browser stored for the map;
 * 3. the spawn of the map, which is what `undefined` means.
 *
 * @param query What the map, the url and the browser say.
 *
 * @returns The pose to take, or `undefined` when the map opens on its spawn.
 */
export function poseForOpenOf(query: PoseForOpenQuery): StoredPose | undefined {
  const { id, key, urlPose, urlMapId, storedPoses, isFirstOpen } = query

  if (isFirstOpen && urlPose !== undefined && (urlMapId === undefined || urlMapId === id)) {
    return urlPose
  }

  return storedPoses[key]
}

/**
 * Moves the pose the editor stored before the pose became per map under the map of the last visit.
 *
 * @remarks
 * The first visit after the update reads the old global pose and writes it as the pose of the last visited map, then
 * removes the two old keys: the build after it reads the poses of {@link readMapPoses} only. A broken or half written
 * pose is dropped, and the map opens on its spawn, which is the same rule the stored history follows.
 *
 * @param storage The storage to read and write, the localStorage of the page by default.
 */
export function migrateLegacyPose(storage?: StorageLike): void {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return
  }

  const position = parseTriplet(readValue(target, LEGACY_POSITION_KEY))
  const rotation = parseTriplet(readValue(target, LEGACY_ROTATION_KEY))

  // the old keys go in every case: this build does not read or write them any more
  removeValue(target, LEGACY_POSITION_KEY)
  removeValue(target, LEGACY_ROTATION_KEY)

  if (position === undefined || rotation === undefined) {
    return
  }

  // a browser that has poses already was migrated (or has written its own): the old pose is older than those
  if (readValue(target, MAP_POSES_KEY) !== undefined) {
    return
  }

  const last = storedMapId(target)
  const pose = { position, rotation }

  if (last === undefined || !isStoredPose(pose)) {
    return
  }

  writeMapPoses({ [last]: pose }, target)
}
