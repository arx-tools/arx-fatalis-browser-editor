import { storedHistoryJsonOf, storedHistoryOfValue, type StoredHistory } from '../../history/mapHistoryStorage.ts'
import { isStoredPose, type StoredPose } from './maps/mapPoses.ts'

/**
 * The folder of the zip the editor keeps its own state in.
 *
 * @remarks
 * The archive is the level and the state of the editor that wrote it: the level files are at the root, the way the game
 * reads them, and everything the editor needs to open the level again the way it was left is under this folder. A reader
 * of a level skips the folder: nothing in it is a level file.
 */
export const EDITOR_FOLDER = 'editor/'

/**
 * The folder of the zip the level the steps of the history were made on is kept in.
 */
export const SOURCE_FOLDER = `${EDITOR_FOLDER}source/`

/**
 * The path of the file the state of the editor is kept in.
 */
export const SETTINGS_PATH = `${EDITOR_FOLDER}settings.json`

/**
 * What the editor knows of a level, beside the level itself.
 */
export interface EditorSettings {
  /**
   * The pose of the camera when the archive was written.
   *
   * @remarks
   * It is the view of the editor, not the spawn of the player: the spawn is the level's own (the `player` of the DLF),
   * and a round of its own may let it be set on the map.
   */
  readonly camera?: StoredPose
  /**
   * The steps of the level, when it has some.
   *
   * @remarks
   * The steps are indices of the level the editor loaded, and that level is in {@link SOURCE_FOLDER}: the two are read
   * together, or neither is used.
   */
  readonly history?: StoredHistory
}

/**
 * The state of the editor as the settings file holds it.
 */
export interface EditorSettingsJson {
  /**
   * The pose of the camera, in the shape the storage of the browser keeps it.
   */
  readonly camera?: StoredPose
  /**
   * The steps of the level, in the shape the storage of the browser keeps them.
   */
  readonly history?: {
    readonly version: number
    readonly fingerprint: string
    readonly records: readonly unknown[]
    readonly position: number
  }
}

/**
 * Builds the value the settings file holds.
 *
 * @remarks
 * Both halves are written the way the browser stores them, so an archive and a reload read the same code of the editor:
 * the pose and the steps have one shape and one reader.
 *
 * @param settings What the editor knows of the level.
 *
 * @returns The value to write as JSON; a half that is not there is not written at all.
 */
export function editorSettingsJsonOf(settings: EditorSettings): EditorSettingsJson {
  if (settings.history === undefined) {
    return { camera: settings.camera }
  }

  return { camera: settings.camera, history: storedHistoryJsonOf(settings.history) }
}

/**
 * Reads a parsed settings file.
 *
 * @remarks
 * A file of another build, or a broken one, is dropped instead of being guessed at: the level opens as the archive's own
 * files say, without a pose and without steps. A half that does not read is dropped alone, so a camera the camera can
 * not take does not take the steps of the level with it.
 *
 * @param value The value the file held, parsed as JSON.
 *
 * @returns The state, or `undefined` when the value is not a settings file.
 */
export function editorSettingsOfValue(value: unknown): EditorSettings | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const { camera, history } = value as Record<string, unknown>
  let pose: StoredPose | undefined

  if (isStoredPose(camera)) {
    pose = camera
  }

  return { camera: pose, history: storedHistoryOfValue(history) }
}
