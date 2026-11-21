import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { OrthographicCamera, PerspectiveCamera, Scene } from 'three'
import { setCameraPose } from '../../../../../src/editor/components/widgets/camera/cameraPose.ts'
import { createEdgeSnap } from '../../../../../src/editor/components/widgets/View3DWidget/edgeSnap.ts'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

void describe('createEdgeSnap', () => {
  void it('reads a frame of a drag and frees the line', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 10_000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()

    camera.position.set(0, 200, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const snap = createEdgeSnap(map, [0], { camera, canvas, scene })
    const result = snap.snap({ x: 0, y: 0, z: 0 }, 'X')

    // the blank level may put a target edge under the selection: the correction is still a finite offset
    assert.ok(Number.isFinite(result.correction.x))
    assert.ok(Number.isFinite(result.correction.y))
    assert.ok(Number.isFinite(result.correction.z))

    snap.hide()
    snap.dispose()

    assert.equal(scene.children.length, 0)
  })

  void it('rails on the X and the Z edges alike', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const selected = structuredClone(map.polygons[0])
    const left = structuredClone(map.polygons[0])
    const below = structuredClone(map.polygons[0])

    selected.vertices = [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 100, y: 0, z: 0, u: 0, v: 0 },
      { x: 100, y: 0, z: 100, u: 0, v: 0 },
      { x: 0, y: 0, z: 100, u: 0, v: 0 },
    ]
    left.vertices = [
      { x: -200, y: 0, z: 0, u: 0, v: 0 },
      { x: -100, y: 0, z: 0, u: 0, v: 0 },
      { x: -100, y: 0, z: 100, u: 0, v: 0 },
      { x: -200, y: 0, z: 100, u: 0, v: 0 },
    ]
    below.vertices = [
      { x: 0, y: 0, z: -200, u: 0, v: 0 },
      { x: 100, y: 0, z: -200, u: 0, v: 0 },
      { x: 100, y: 0, z: -100, u: 0, v: 0 },
      { x: 0, y: 0, z: -100, u: 0, v: 0 },
    ]

    ;(map as unknown as { polygons: ArxPolygon[] }).polygons = [selected, left, below]

    const camera = new OrthographicCamera(-250, 250, 250, -250, 0.1, 1000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()

    camera.position.set(0, 300, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const snap = createEdgeSnap(map, [0], { camera, canvas, scene })
    const onX = snap.snap({ x: -99, y: 0, z: 0 }, 'X')
    const onZ = snap.snap({ x: 0, y: 0, z: -99 }, 'Z')

    assert.ok(Math.abs(onX.correction.x + 1) < 0.01, `the X correction was ${String(onX.correction.x)}`)
    assert.ok(Math.abs(onZ.correction.z + 1) < 0.01, `the Z correction was ${String(onZ.correction.z)}`)

    snap.dispose()
  })

  void it('rails on the side edge of a real quad, not on its diagonals', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const selected = structuredClone(map.polygons[0])
    const target = structuredClone(map.polygons[0])

    // the corners come in the order the FTS stores them: the outline is 0-1-3-2, so the side edge of the quad is
    // 2-0 on the left and 1-3 on the right. Walking 0-1-2-3 would leave both out (the bug of 2026-11-21: an X drag
    // on a floor found no target at all, while a Z drag worked)
    selected.vertices = [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 100, y: 0, z: 0, u: 0, v: 0 },
      { x: 0, y: 0, z: 100, u: 0, v: 0 },
      { x: 100, y: 0, z: 100, u: 0, v: 0 },
    ]
    // the target is offset in Z: only its side edge (x = -100) comes near the side edge of the selection, so the
    // correction can not come from the collinear X edges of the two faces
    target.vertices = [
      { x: -200, y: 0, z: 40, u: 0, v: 0 },
      { x: -100, y: 0, z: 40, u: 0, v: 0 },
      { x: -200, y: 0, z: 140, u: 0, v: 0 },
      { x: -100, y: 0, z: 140, u: 0, v: 0 },
    ]

    ;(map as unknown as { polygons: ArxPolygon[] }).polygons = [selected, target]

    const camera = new OrthographicCamera(-250, 250, 250, -250, 0.1, 1000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()

    camera.position.set(0, 300, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const snap = createEdgeSnap(map, [0], { camera, canvas, scene })
    // the left side of the selection (x = -95) is five units from the side edge of the target (x = -100)
    const result = snap.snap({ x: -95, y: 0, z: 0 }, 'X')

    assert.notStrictEqual(result.target, undefined, 'the side edge of the target was not found')
    assert.ok(Math.abs(result.correction.x + 5) < 0.01, `the X correction was ${String(result.correction.x)}`)
    assert.ok(Math.abs(result.correction.y) < 0.01, `the Y correction was ${String(result.correction.y)}`)
    assert.ok(Math.abs(result.correction.z) < 0.01, `the Z correction was ${String(result.correction.z)}`)

    snap.dispose()
  })

  void it('does not rail a lift onto a far edge of the floor', () => {
    // the map of the owner (2026-11-21): the face in the hole, and the floor around it. The camera is the one the map
    // was exported with, so the lift of the face brings its front edge onto the far edge of the hole on the canvas.
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const selected = structuredClone(map.polygons[0])
    const floor = structuredClone(map.polygons[0])

    selected.vertices = [
      { x: 588, y: 0, z: 356, u: 0, v: 0 },
      { x: 688, y: 0, z: 356, u: 1, v: 0 },
      { x: 588, y: 0, z: 456, u: 0, v: 1 },
      { x: 688, y: 0, z: 456, u: 1, v: 1 },
    ]
    // the floor over the hole, with its far edge at z = 300
    floor.vertices = [
      { x: 500, y: 0, z: 200, u: 0, v: 0 },
      { x: 700, y: 0, z: 200, u: 1, v: 0 },
      { x: 500, y: 0, z: 300, u: 0, v: 1 },
      { x: 700, y: 0, z: 300, u: 1, v: 1 },
    ]

    ;(map as unknown as { polygons: ArxPolygon[] }).polygons = [selected, floor]

    const camera = new PerspectiveCamera(75, 913 / 765, 0.1, 10_000)

    setCameraPose(
      camera,
      { x: 550, y: 0, z: 550 },
      {
        position: { x: 715.68, y: -389.28, z: 628.5 },
        angle: { pitch: 54.3, yaw: 166.24 },
      },
    )
    camera.updateMatrixWorld()

    const canvas = { clientWidth: 913, clientHeight: 765 } as unknown as HTMLCanvasElement
    const scene = new Scene()
    const snap = createEdgeSnap(map, [0], { camera, canvas, scene })

    // the face lifted 55 units: its front edge is on the far edge of the hole on the canvas, but the rail would move it
    // 55 units back down and 56 units across the level, so it is not a snap (the drag of the owner found exactly this)
    const lifted = snap.snap({ x: 0, y: -55, z: 0 }, 'Y')

    assert.equal(lifted.target, undefined)
    assert.deepEqual(lifted.correction, { x: 0, y: 0, z: 0 })

    snap.dispose()
  })

  void it('has no edge on the screen-space handle', () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
    const camera = new PerspectiveCamera(60, 1, 0.1, 10_000)
    const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement
    const scene = new Scene()
    const snap = createEdgeSnap(map, [0], { camera, canvas, scene })
    const result = snap.snap({ x: 10, y: 10, z: 10 }, 'XYZ')

    assert.deepEqual(result.correction, { x: 0, y: 0, z: 0 })

    snap.dispose()
  })
})
