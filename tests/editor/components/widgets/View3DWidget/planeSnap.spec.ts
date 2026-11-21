import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { PerspectiveCamera, Scene } from 'three'
import { createPlaneSnap } from '../../../../../src/editor/components/widgets/View3DWidget/planeSnap.ts'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * A corner of a face, at the place given.
 */
type Corner = {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Builds a face of the test level.
 *
 * @param vertices The corners of the quad, in the order the FTS stores them.
 *
 * @returns The polygon, with the values the level gives its faces.
 *
 * @throws When the blank level has no face to copy the values from.
 */
function faceOf(vertices: readonly [Corner, Corner, Corner, Corner]): ArxPolygon {
  const files = createBlankLevelFiles(FLAT_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const base = map.polygons[0]

  if (base === undefined) {
    throw new Error('the blank level has no face to copy')
  }

  const polygon = structuredClone(base)
  const [one, two, three, four] = vertices

  polygon.vertices = [
    { ...one, u: 0, v: 0 },
    { ...two, u: 0, v: 0 },
    { ...three, u: 0, v: 0 },
    { ...four, u: 0, v: 0 },
  ]

  return polygon
}

/**
 * Builds the level of a test: its faces, and the scene position the view of the test reads.
 *
 * @param polygons The faces.
 *
 * @returns The level.
 */
function mapOf(polygons: readonly ArxPolygon[]): ArxMap {
  return {
    polygons,
    scenePosition: { x: 0, y: 0, z: 0 },
    isHidden: (): boolean => {
      return false
    },
  } as unknown as ArxMap
}

/**
 * The camera of a test: a view from above and from the side, so the game's Y has a place on the canvas.
 *
 * @remarks
 * A view straight down would not see the height of a corner: the drag along Y would have no length on the canvas, and
 * every jump would be zero pixels. The camera stands at an angle, like the walkable view of the editor.
 *
 * @returns The camera, the canvas and the scene a snap is built with.
 */
function viewOf(): { camera: PerspectiveCamera; canvas: HTMLCanvasElement; scene: Scene } {
  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 10_000)

  camera.position.set(200, 300, 200)
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  return {
    camera,
    canvas: { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement,
    scene: new Scene(),
  }
}

/**
 * A face of the floor of a test, at the height given.
 *
 * @param y The game's Y of the face: the game looks down the Y, so a smaller one is higher.
 *
 * @returns The face.
 */
function floorOf(y: number): ArxPolygon {
  return faceOf([
    { x: -200, y, z: -200 },
    { x: 200, y, z: -200 },
    { x: -200, y, z: 200 },
    { x: 200, y, z: 200 },
  ])
}

/**
 * The face of the selection of a test: one tile of a floor, at the height given.
 *
 * @param y The game's Y of the face.
 *
 * @returns The face.
 */
function selectedFloorOf(y: number): ArxPolygon {
  return faceOf([
    { x: 0, y, z: 0 },
    { x: 100, y, z: 0 },
    { x: 0, y, z: 100 },
    { x: 100, y, z: 100 },
  ])
}

/**
 * A face of a wall of a test, on the plane x = 200.
 *
 * @returns The face.
 */
function wallOf(): ArxPolygon {
  return faceOf([
    { x: 200, y: -200, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: -200, z: 200 },
    { x: 200, y: 0, z: 200 },
  ])
}

void describe('createPlaneSnap', () => {
  void it('lands a corner on the floor above it, along the drag', () => {
    // the selection floats five units above the floor: the game's Y looks down, so it stands at -5
    const map = mapOf([selectedFloorOf(-5), floorOf(0)])
    const { camera, canvas, scene } = viewOf()
    const snap = createPlaneSnap(map, [0], { camera, canvas, scene })

    // the floor plane is five units below the corners, and the drag is along Y
    const result = snap.snap({ x: 0, y: 0, z: 0 }, 'Y')

    assert.notStrictEqual(result.target, undefined, 'the floor was not found')
    assert.ok(Math.abs(result.correction.y - 5) < 0.01, `the Y correction was ${String(result.correction.y)}`)
    assert.equal(result.correction.x, 0)
    assert.equal(result.correction.z, 0)

    // the outline of the floor is the marker of the frame
    assert.equal(scene.children.length, 1)

    snap.dispose()

    assert.equal(scene.children.length, 0)
  })

  void it('does not take a face that would move the selection far', () => {
    const map = mapOf([selectedFloorOf(-50), floorOf(0)])
    const { camera, canvas, scene } = viewOf()
    const snap = createPlaneSnap(map, [0], { camera, canvas, scene })

    // the floor is fifty units below the corner: the jump is far on the canvas, so the snap lets it be
    const result = snap.snap({ x: 0, y: 0, z: 0 }, 'Y')

    assert.deepEqual(result.correction, { x: 0, y: 0, z: 0 })
    assert.equal(result.target, undefined)

    snap.dispose()
  })

  void it('lands a corner on a wall, along the drag of the wall', () => {
    const map = mapOf([selectedFloorOf(-100), wallOf()])
    const { camera, canvas, scene } = viewOf()
    const snap = createPlaneSnap(map, [0], { camera, canvas, scene })

    // the corner is five units from the wall: the drag along X lands it on the plane of the wall
    const result = snap.snap({ x: 195, y: 0, z: 0 }, 'X')

    assert.notStrictEqual(result.target, undefined, 'the wall was not found')
    assert.ok(Math.abs(result.correction.x - 5) < 0.01, `the X correction was ${String(result.correction.x)}`)
    assert.equal(result.correction.y, 0)
    assert.equal(result.correction.z, 0)

    snap.dispose()
  })

  void it('has no plane on a drag that runs in the plane of the face', () => {
    const map = mapOf([selectedFloorOf(-5), floorOf(0)])
    const { camera, canvas, scene } = viewOf()
    const snap = createPlaneSnap(map, [0], { camera, canvas, scene })

    // the corner is over the floor, but a drag along X never meets the plane of the floor
    const result = snap.snap({ x: 10, y: 0, z: 0 }, 'X')

    assert.deepEqual(result.correction, { x: 0, y: 0, z: 0 })
    assert.equal(result.target, undefined)

    snap.dispose()
  })

  void it('has no plane on the handle that allows more than one axis', () => {
    const map = mapOf([selectedFloorOf(-5), floorOf(0)])
    const { camera, canvas, scene } = viewOf()
    const snap = createPlaneSnap(map, [0], { camera, canvas, scene })
    const result = snap.snap({ x: 10, y: 10, z: 10 }, 'XYZ')

    assert.deepEqual(result.correction, { x: 0, y: 0, z: 0 })

    snap.dispose()
  })
})
