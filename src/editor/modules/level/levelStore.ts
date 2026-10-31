import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import type { LoadingStatus } from '../../types.ts'
import { loadOriginalArxLevel } from './levelSource.ts'

/**
 * The configuration of {@link createLevelStore}.
 */
export interface LevelStoreOptions {
  /**
   * The step that produces the map.
   *
   * @remarks
   * The download and the parsing of the three files are the editor's own, so the store does not touch
   * them: it drives the state and the tests hand in a fake step. A step may be synchronous; the store
   * awaits it either way.
   *
   * @returns The map, when it is built.
   */
  readonly loadMap?: () => ArxMap | Promise<ArxMap>
}

/**
 * The state of the level of the editor.
 *
 * @remarks
 * - the level is **not** owned by the 3D widget: a widget can be thrown away and rebuilt (a layout
 * reset does exactly that), and the map stays loaded, so the view comes back at once
 * - the map is a `shallowRef` of the `ArxMap` class: its own fields are not reactive, the editors of
 * the view read them directly
 */
export interface LevelStore {
  /**
   * Where the loading is.
   */
  readonly status: Ref<LoadingStatus>
  /**
   * The map of the level, once it is built.
   */
  readonly map: ShallowRef<ArxMap | undefined>
  /**
   * The message of a failed load.
   */
  readonly error: Ref<string | undefined>
  /**
   * Starts the load.
   *
   * @remarks
   * It is idempotent: the second call does nothing while the first one is still running, and it does
   * nothing after a successful load. The failures are not thrown, they land in {@link LevelStore.status}
   * and {@link LevelStore.error}.
   */
  startLoading: () => void
}

/**
 * Reads the message of a failure.
 *
 * @param error The thrown value.
 *
 * @returns The message of an `Error`, or `undefined` when the value has none.
 */
function messageOf(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message
  }

  return undefined
}

/**
 * Builds the store of the level.
 *
 * @param options The step that produces the map, the real one by default.
 *
 * @returns The state the app and the widgets read.
 */
export function createLevelStore(options: LevelStoreOptions = {}): LevelStore {
  const loadMap =
    options.loadMap ??
    (async (): Promise<ArxMap> => {
      return await loadOriginalArxLevel()
    })
  const status = ref<LoadingStatus>('idle')
  const map = shallowRef<ArxMap>()
  const error = ref<string>()

  let pending: Promise<void> | undefined

  /**
   * Runs the load once and writes the outcome into the state.
   */
  async function load(): Promise<void> {
    status.value = 'loading'

    try {
      map.value = await loadMap()
      error.value = undefined
      status.value = 'ready'
    } catch (error_) {
      error.value = messageOf(error_) ?? 'Failed to load the level.'
      status.value = 'error'
    }
  }

  return {
    status,
    map,
    error,
    startLoading: (): void => {
      if (pending !== undefined || status.value === 'ready') {
        return
      }

      pending = load()
    },
  }
}

/**
 * The store of the editor.
 *
 * @remarks
 * A module level singleton: the widgets are mounted as their own Vue apps (a dock widget is not a child
 * of the app's component tree), so they can not reach a provided value, but they all see this store.
 * The tests build their own with {@link createLevelStore}.
 */
export const levelStore: LevelStore = createLevelStore()
