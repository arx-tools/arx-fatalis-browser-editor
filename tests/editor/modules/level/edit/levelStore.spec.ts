import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { watch } from 'vue'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { MINIMAL_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { createLevelStore } from '../../../../../src/editor/modules/level/edit/levelStore.ts'
import { progressOfStep } from '../../../../../src/editor/modules/level/loadProgress.ts'
import { createBlankLevelSource } from '../../../../../src/editor/modules/level/source/levelSource.ts'

/**
 * A map of the test: the store only passes it through.
 *
 * @returns The stand-in the store hands to the widget.
 */
function fakeMap(): ArxMap {
  return { meshes: [] } as unknown as ArxMap
}

/**
 * Waits until the load of the store settled.
 *
 * @remarks
 * The store runs on promises, so the test can not read the outcome right after `startLoading()`; the
 * `watch` fires when the status leaves `loading`, which is deterministic and needs no timer.
 *
 * @param store The store to wait for.
 */
async function waitForSettled(store: ReturnType<typeof createLevelStore>): Promise<void> {
  if (store.status.value !== 'loading') {
    return
  }

  await new Promise<void>((resolve) => {
    const stop = watch(store.status, (status) => {
      if (status !== 'loading') {
        stop()
        resolve()
      }
    })
  })
}

void describe('createLevelStore', () => {
  void it('starts idle and loads nothing on its own', () => {
    let loads = 0
    const store = createLevelStore({
      loadMap: (): ArxMap => {
        loads = loads + 1

        return fakeMap()
      },
    })

    assert.equal(store.status.value, 'idle')
    assert.equal(store.map.value, undefined)
    assert.equal(loads, 0)
  })

  void it('goes through loading to ready with the map', async () => {
    const map = fakeMap()
    const store = createLevelStore({
      loadMap: (): ArxMap => {
        return map
      },
    })

    store.startLoading()
    assert.equal(store.status.value, 'loading')

    await waitForSettled(store)

    assert.equal(store.status.value, 'ready')
    assert.equal(store.map.value, map)
    assert.equal(store.error.value, undefined)
  })

  void it('keeps the message of a failure', async () => {
    const store = createLevelStore({
      loadMap: (): ArxMap => {
        throw new Error('the server is on fire')
      },
    })

    store.startLoading()
    await waitForSettled(store)

    assert.equal(store.status.value, 'error')
    assert.equal(store.error.value, 'the server is on fire')
    assert.equal(store.map.value, undefined)
  })

  void it('loads only once, however often it is asked to', async () => {
    let loads = 0
    const store = createLevelStore({
      loadMap: (): ArxMap => {
        loads = loads + 1

        return fakeMap()
      },
    })

    store.startLoading()
    store.startLoading()
    await waitForSettled(store)
    store.startLoading()

    assert.equal(loads, 1)
    assert.equal(store.status.value, 'ready')
  })
})

void describe('the progress of createLevelStore', () => {
  void it('starts with the first step and follows the one the load reports', async () => {
    const store = createLevelStore({
      loadMap: (onProgress) => {
        onProgress(progressOfStep('source'))
        onProgress(progressOfStep('bake'))

        return fakeMap()
      },
    })

    assert.deepEqual(store.progress.value, { percent: 0, label: 'Preparing the level…' })

    store.startLoading()
    await waitForSettled(store)

    assert.deepEqual(store.progress.value, { percent: 56, label: 'Baking the lights…' })
  })

  void it('keeps the furthest percent when a step reports a smaller one', async () => {
    const store = createLevelStore({
      loadMap: (onProgress) => {
        onProgress(progressOfStep('bake'))
        onProgress(progressOfStep('textures'))

        return fakeMap()
      },
    })

    store.startLoading()
    await waitForSettled(store)

    // the bar stays where the bake took it, and the words say what the load does now
    assert.deepEqual(store.progress.value, { percent: 56, label: 'Reading the textures…' })
  })

  void it('starts the progress over with every load', async () => {
    const store = createLevelStore()
    const source = createBlankLevelSource(MINIMAL_PRESET)
    const percents: number[] = []

    watch(
      () => {
        return store.progress.value.percent
      },
      (percent) => {
        percents.push(percent)
      },
    )

    await store.openLevel(source)
    // a blank level is not compressed: its unpack takes no time, and the steps are the ones of the load itself
    assert.deepEqual(percents, [1, 3, 6, 26, 30])

    await store.openLevel(source)
    // the second load walks the same steps from the first one, whatever the one before it got to (the reset itself is
    // not a frame of the cover: the first step of the load reports in the same turn, so the bar goes from 30 to 1)
    assert.deepEqual(percents.slice(5), [1, 3, 6, 26, 30])
  })
})
