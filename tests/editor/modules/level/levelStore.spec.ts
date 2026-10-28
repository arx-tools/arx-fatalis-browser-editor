import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { watch } from 'vue'
import type { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { createLevelStore } from '../../../../src/editor/modules/level/levelStore.ts'

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
