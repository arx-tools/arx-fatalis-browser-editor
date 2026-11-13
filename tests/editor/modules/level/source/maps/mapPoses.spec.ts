import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { StorageLike } from '../../../../../../src/editor/modules/persistedRef/storage.ts'
import {
  cameraPoseOf,
  isStoredPose,
  migrateLegacyPose,
  poseForOpenOf,
  poseKeyOf,
  readMapPoses,
  writeMapPoses,
  type StoredPose,
} from '../../../../../../src/editor/modules/level/source/maps/mapPoses.ts'

/**
 * A storage of the test: a map of the values in memory.
 *
 * @returns The storage, and the values it keeps.
 */
function storageOfTest(): { storage: StorageLike; values: Map<string, string> } {
  const values = new Map<string, string>()
  const storage: StorageLike = {
    getItem: (key) => {
      return values.get(key) ?? null
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }

  return { storage, values }
}

/**
 * The pose the tests store: the spawn of a level of the game.
 */
const pose: StoredPose = { position: [5320.35, 307.39, 10_713.8], rotation: [0, 180, 0] }

void describe('poseKeyOf', () => {
  void it('uses the value of a map that has one', () => {
    assert.equal(poseKeyOf('blank:flat', []), 'blank:flat')
    assert.equal(poseKeyOf('arx:8', []), 'arx:8')
  })

  void it('names the zip of a custom map, because the value of the session changes', () => {
    const customMaps = [{ label: 'lalee-s_minigame.zip', data: new ArrayBuffer(8) }]

    assert.equal(poseKeyOf('custom:0', customMaps), 'custom:0:lalee-s_minigame.zip:8')
  })

  void it('keeps the value of a custom map the session does not have', () => {
    assert.equal(poseKeyOf('custom:3', []), 'custom:3')
    assert.equal(poseKeyOf('custom:x', []), 'custom:x')
  })
})

void describe('isStoredPose', () => {
  void it('takes a pose of the game', () => {
    assert.equal(isStoredPose(pose), true)
  })

  void it('refuses a value that is not an object', () => {
    assert.equal(isStoredPose(undefined), false)
    assert.equal(isStoredPose(null), false)
    assert.equal(isStoredPose('[1,2,3]'), false)
  })

  void it('refuses a triplet that is not three finite numbers', () => {
    assert.equal(isStoredPose({ position: [1, 2], rotation: [0, 0, 0] }), false)
    assert.equal(isStoredPose({ position: [1, 2, 'three'], rotation: [0, 0, 0] }), false)
    assert.equal(isStoredPose({ position: [1, 2, Number.POSITIVE_INFINITY], rotation: [0, 0, 0] }), false)
  })

  void it('refuses an angle the camera can not apply', () => {
    assert.equal(isStoredPose({ position: [0, 0, 0], rotation: [0, 360, 0] }), false)
    assert.equal(isStoredPose({ position: [0, 0, 0], rotation: [91, 0, 0] }), false)
  })
})

void describe('cameraPoseOf', () => {
  void it('names the two halves of the stored pose', () => {
    assert.deepEqual(cameraPoseOf(pose), {
      position: { x: 5320.35, y: 307.39, z: 10_713.8 },
      angle: { pitch: 0, yaw: 180 },
    })
  })
})

void describe('readMapPoses', () => {
  void it('reads nothing from a browser that has none', () => {
    assert.deepEqual(readMapPoses(storageOfTest().storage), {})
  })

  void it('reads nothing from a value that is not a pose', () => {
    const { storage, values } = storageOfTest()

    values.set('mapPoses', 'not json')
    assert.deepEqual(readMapPoses(storage), {})

    values.set('mapPoses', '[1,2,3]')
    assert.deepEqual(readMapPoses(storage), {})
  })

  void it('reads nothing from a page without a storage, or one that refuses to read', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('the storage is blocked')
      },
      setItem: () => {
        // nothing writes here
      },
      removeItem: () => {
        // nothing removes here
      },
    }

    // the tests run without a localStorage, so the default is the same as a blocked one
    assert.deepEqual(readMapPoses(), {})
    assert.deepEqual(readMapPoses(storage), {})
  })

  void it('keeps the poses and drops the broken entries', () => {
    const { storage, values } = storageOfTest()

    values.set('mapPoses', JSON.stringify({ 'arx:8': pose, 'arx:11': { position: [0, 0, 0] } }))

    assert.deepEqual(readMapPoses(storage), { 'arx:8': pose })
  })
})

void describe('writeMapPoses', () => {
  void it('adds the poses of the maps it is given and keeps the others', () => {
    const { storage, values } = storageOfTest()

    values.set('mapPoses', JSON.stringify({ 'arx:11': pose }))
    writeMapPoses({ 'arx:8': pose }, storage)

    assert.deepEqual(readMapPoses(storage), { 'arx:11': pose, 'arx:8': pose })
  })

  void it('writes nothing on a page without a storage', () => {
    writeMapPoses({ 'arx:8': pose })

    assert.deepEqual(readMapPoses(), {})
  })

  void it('does not throw when the storage refuses the value', () => {
    const storage: StorageLike = {
      getItem: () => {
        return null
      },
      setItem: () => {
        throw new Error('the storage is full')
      },
      removeItem: () => {
        // nothing to remove
      },
    }

    writeMapPoses({ 'arx:8': pose }, storage)

    assert.deepEqual(readMapPoses(storage), {})
  })
})

void describe('poseForOpenOf', () => {
  void it('takes the pose of the url for the map it names, on the first open', () => {
    const taken = poseForOpenOf({
      id: 'arx:11',
      key: 'arx:11',
      urlPose: pose,
      urlMapId: 'arx:11',
      storedPoses: { 'arx:11': { position: [1, 2, 3], rotation: [0, 90, 0] } },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })

  void it('takes the pose of the url that names no map, for the map that opens', () => {
    const taken = poseForOpenOf({
      id: 'arx:11',
      key: 'arx:11',
      urlPose: pose,
      urlMapId: undefined,
      storedPoses: {},
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })

  void it('takes the stored pose of the map the url names without a pose', () => {
    const taken = poseForOpenOf({
      id: 'arx:11',
      key: 'arx:11',
      urlPose: undefined,
      urlMapId: 'arx:11',
      storedPoses: { 'arx:11': pose },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })

  void it('takes the stored pose of the last map of a visit without a link', () => {
    const taken = poseForOpenOf({
      id: 'arx:11',
      key: 'arx:11',
      urlPose: undefined,
      urlMapId: undefined,
      storedPoses: { 'arx:11': pose },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })

  void it('opens a map without a pose on its spawn', () => {
    const taken = poseForOpenOf({
      id: 'blank:flat',
      key: 'blank:flat',
      urlPose: undefined,
      urlMapId: undefined,
      storedPoses: { 'arx:11': pose },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.equal(taken, undefined)
  })

  void it('never takes the pose of the url after the first open', () => {
    const taken = poseForOpenOf({
      id: 'arx:11',
      key: 'arx:11',
      urlPose: pose,
      urlMapId: 'arx:11',
      storedPoses: {},
      archivePose: undefined,
      isFirstOpen: false,
    })

    assert.equal(taken, undefined)
  })

  void it('does not put the pose of the url on another map', () => {
    // the link of a level that needs the folder: the blank map that is started instead has a pose of its own
    const taken = poseForOpenOf({
      id: 'blank:flat',
      key: 'blank:flat',
      urlPose: pose,
      urlMapId: 'arx:11',
      storedPoses: { 'blank:flat': { position: [550, -180, 550], rotation: [0, 180, 0] } },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, { position: [550, -180, 550], rotation: [0, 180, 0] })
  })

  void it('takes the pose of the zip when the browser has none', () => {
    const taken = poseForOpenOf({
      id: 'custom:0',
      key: 'custom:0:lalee-s_minigame.zip:8',
      urlPose: undefined,
      urlMapId: undefined,
      storedPoses: {},
      archivePose: pose,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })

  void it('keeps the pose of the browser over the one of the zip', () => {
    const stored: StoredPose = { position: [1, 2, 3], rotation: [0, 90, 0] }

    const taken = poseForOpenOf({
      id: 'custom:0',
      key: 'custom:0:lalee-s_minigame.zip:8',
      urlPose: undefined,
      urlMapId: undefined,
      storedPoses: { 'custom:0:lalee-s_minigame.zip:8': stored },
      archivePose: pose,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, stored)
  })

  void it('takes the pose of the url over the one of the zip', () => {
    const taken = poseForOpenOf({
      id: 'custom:0',
      key: 'custom:0:lalee-s_minigame.zip:8',
      urlPose: { position: [4, 5, 6], rotation: [0, 45, 0] },
      urlMapId: undefined,
      storedPoses: {},
      archivePose: pose,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, { position: [4, 5, 6], rotation: [0, 45, 0] })
  })

  void it('looks a custom map up by the key of its zip', () => {
    const taken = poseForOpenOf({
      id: 'custom:0',
      key: 'custom:0:lalee-s_minigame.zip:8',
      urlPose: undefined,
      urlMapId: undefined,
      storedPoses: { 'custom:0:lalee-s_minigame.zip:8': pose },
      archivePose: undefined,
      isFirstOpen: true,
    })

    assert.deepEqual(taken, pose)
  })
})

void describe('migrateLegacyPose', () => {
  void it('moves the pose of the old build under the map of the last visit', () => {
    const { storage, values } = storageOfTest()

    values.set('position', JSON.stringify(pose.position))
    values.set('rotation', JSON.stringify(pose.rotation))
    values.set('map', 'arx-fatalis-level-8')

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), { 'arx:8': pose })
    assert.equal(values.has('position'), false)
    assert.equal(values.has('rotation'), false)
  })

  void it('keeps the poses a visit already wrote down', () => {
    const { storage, values } = storageOfTest()

    values.set('mapPoses', JSON.stringify({ 'arx:11': pose }))
    values.set('position', JSON.stringify([1, 2, 3]))
    values.set('rotation', JSON.stringify([0, 90, 0]))
    values.set('map', 'arx-fatalis-level-8')

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), { 'arx:11': pose })
  })

  void it('drops the old keys without a map to give the pose to', () => {
    const { storage, values } = storageOfTest()

    values.set('position', JSON.stringify(pose.position))
    values.set('rotation', JSON.stringify(pose.rotation))

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), {})
    assert.equal(values.has('position'), false)
    assert.equal(values.has('rotation'), false)
  })

  void it('drops a broken old pose', () => {
    const { storage, values } = storageOfTest()

    values.set('map', 'arx-fatalis-level-8')
    values.set('position', 'a place by the river')
    values.set('rotation', JSON.stringify(pose.rotation))

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), {})
  })

  void it('drops an old pose that is only half there', () => {
    const { storage, values } = storageOfTest()

    values.set('map', 'arx-fatalis-level-8')
    values.set('position', JSON.stringify(pose.position))

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), {})
  })

  void it('does nothing on a page without a storage, or one that refuses to remove', () => {
    const storage: StorageLike = {
      getItem: () => {
        return null
      },
      setItem: () => {
        // nothing writes here
      },
      removeItem: () => {
        throw new Error('the storage is blocked')
      },
    }

    migrateLegacyPose()
    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), {})
  })

  void it('drops an old pose the camera can not take', () => {
    const { storage, values } = storageOfTest()

    values.set('map', 'arx-fatalis-level-8')
    values.set('position', JSON.stringify(pose.position))
    values.set('rotation', JSON.stringify([0, 720, 0]))

    migrateLegacyPose(storage)

    assert.deepEqual(readMapPoses(storage), {})
  })
})
