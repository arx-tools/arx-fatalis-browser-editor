import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Scene } from 'three'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { createVertexSnap } from '../../../../../src/editor/components/widgets/View3DWidget/vertexSnap.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

void describe('createVertexSnap', () => {
  void it('reads a frame of a drag and frees the marker', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 10_000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()

    camera.position.set(0, 200, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const snap = createVertexSnap(map, [0], { camera, canvas, scene })
    const result = snap.snap({ x: 0, y: 0, z: 0 }, 'X')

    // the grid of the blank level has a vertex a tile away: the axis of the drag may find it, and the correction stays
    // on that axis
    assert.ok(Number.isFinite(result.correction.x))
    assert.equal(result.correction.y, 0)
    assert.equal(result.correction.z, 0)

    snap.hide()
    snap.dispose()

    assert.equal(scene.children.length, 0)
  })

  void it('has no axes on the screen-space handle', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const camera = new PerspectiveCamera(60, 1, 0.1, 10_000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()
    const snap = createVertexSnap(map, [0], { camera, canvas, scene })
    const result = snap.snap({ x: 10, y: 10, z: 10 }, 'XYZ')

    assert.deepEqual(result.correction, { x: 0, y: 0, z: 0 })

    snap.dispose()
  })
})
