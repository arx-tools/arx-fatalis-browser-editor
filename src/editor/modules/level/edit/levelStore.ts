import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import type { LoadingStatus } from '../../../types.ts'
import { laterOf, progressOfStep, type LoadProgress, type LoadProgressHandler } from '../loadProgress.ts'
import { loadLevel, loadStarterLevel, type LevelSource } from '../source/levelSource.ts'

/**
 * The configuration of {@link createLevelStore}.
 */
export type LevelStoreOptions = {
  /**
   * The step that produces the map.
   *
   * @remarks
   * The download and the parsing of the three files are the editor's own, so the store does not touch
   * them: it drives the state and the tests hand in a fake step. A step may be synchronous; the store
   * awaits it either way.
   *
   * @param onProgress The reader of the progress the store keeps for the cover: a step that knows its own steps
   * reports them, and one that does not leaves the cover on the first step.
   *
   * @returns The map, when it is built.
   */
  readonly loadMap?: (onProgress: LoadProgressHandler) => ArxMap | Promise<ArxMap>
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
export type LevelStore = {
  /**
   * Where the loading is.
   */
  readonly status: Ref<LoadingStatus>
  /**
   * How far the load is, and what it is doing.
   *
   * @remarks
   * The cover over the editor reads this (`LoadingOverlay`): the percent of the bar and the words under it. The store
   * keeps the value of the last step that reported, and the percent never walks back.
   */
  readonly progress: Ref<LoadProgress>
  /**
   * The map of the level, once it is built.
   */
  readonly map: ShallowRef<ArxMap | undefined>
  /**
   * The message of a failed load.
   */
  readonly error: Ref<string | undefined>
  /**
   * Starts the load of the level the editor opens with.
   *
   * @remarks
   * It is idempotent: the second call does nothing while the first one is still running, and it does
   * nothing after a successful load. The failures are not thrown, they land in {@link LevelStore.status}
   * and {@link LevelStore.error}.
   */
  startLoading: () => void
  /**
   * Loads another level, over the one on the screen.
   *
   * @remarks
   * The store holds **one** map and the widgets follow it, so a new level replaces the old one: the history and the
   * selection belong to the level that is going away, and they are dropped by the editing module when the map
   * changes. A failure keeps the error of the source, so an unusable zip says why.
   *
   * The preparation of the map (its textures and its light) runs in the prepare step of the caller, and it is the half
   * of the load that takes the longest on a level of the game: the step gets the same reader of the progress the store
   * keeps, so the cover says how far the textures and the bake are.
   *
   * @param source Where the files of the new level come from.
   * @param prepare A step that runs on the map before the views get it.
   */
  openLevel: (
    source: LevelSource,
    prepare?: (map: ArxMap, onProgress: LoadProgressHandler) => Promise<void>,
  ) => Promise<void>
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
    (async (onProgress: LoadProgressHandler): Promise<ArxMap> => {
      return await loadStarterLevel(fetch, undefined, onProgress)
    })
  const status = ref<LoadingStatus>('idle')
  const map = shallowRef<ArxMap>()
  const error = ref<string>()
  const progress = ref<LoadProgress>(progressOfStep('start'))

  let pending: Promise<void> | undefined

  /**
   * Runs a load and writes the outcome into the state.
   *
   * @remarks
   * The progress starts over with every load, and a step only moves it forward: a step that reports a smaller percent
   * than the last one (a counted work that ends early, a level that falls back to a blank one) keeps the percent of
   * the cover and takes the new words.
   *
   * @param build The step that produces the map.
   */
  async function load(build: (onProgress: LoadProgressHandler) => ArxMap | Promise<ArxMap>): Promise<void> {
    status.value = 'loading'
    progress.value = progressOfStep('start')

    function onProgress(next: LoadProgress): void {
      progress.value = laterOf(progress.value, next)
    }

    try {
      map.value = await build(onProgress)
      error.value = undefined
      status.value = 'ready'
    } catch (error_) {
      error.value = messageOf(error_) ?? 'Failed to load the level.'
      status.value = 'error'
    }
  }

  return {
    status,
    progress,
    map,
    error,
    startLoading: (): void => {
      if (pending !== undefined || status.value === 'ready') {
        return
      }

      pending = load((onProgress: LoadProgressHandler): ArxMap | Promise<ArxMap> => {
        return loadMap(onProgress)
      })
    },
    openLevel: async (
      source: LevelSource,
      prepare?: (map: ArxMap, onProgress: LoadProgressHandler) => Promise<void>,
    ): Promise<void> => {
      // one level at a time: a load that is already running finishes first, so the two do not race for the map
      await pending
      pending = load(async (onProgress: LoadProgressHandler): Promise<ArxMap> => {
        const map = await loadLevel(source, undefined, onProgress)

        // the views wrap the meshes of the map as soon as it is published, and a wrapper keeps the material it found
        // then: what the level is painted with has to be on the map before that
        await prepare?.(map, onProgress)

        return map
      })
      await pending
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
