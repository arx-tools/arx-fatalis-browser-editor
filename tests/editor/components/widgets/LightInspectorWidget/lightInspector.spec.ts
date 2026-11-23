import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import type { CameraPose } from '../../../../../src/editor/components/widgets/camera/cameraPose.ts'
import {
  filteredLightRows,
  lightIndexLabelOf,
  lightJumpPoseOf,
  lightPositionLabelOf,
  lightRowsOf,
  lightSelectionLabelOf,
  lightShapeLabelOf,
  lightWindowOf,
  type LightRow,
} from '../../../../../src/editor/components/widgets/LightInspectorWidget/lightInspector.ts'

/**
 * The scene the level is read from: the rows add it to the local position of a light.
 */
const SCENE: ArxVector3 = { x: 8150, y: 1730.71, z: 850 }

/**
 * Fills every field of an LLF light, so a test changes only what it needs.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The LLF light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 10, y: 20, z: 30 },
    color: { r: 255, g: 128, b: 0, a: 1 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 1,
    exSize: 0.1,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
    ...overrides,
  }
}

void describe('lightWindowOf', () => {
  void it('draws the rows the box shows, with the overscan', () => {
    assert.deepEqual(lightWindowOf(376, 0, 190, 25), { start: 0, end: 14, top: 0, bottom: 9050 })
  })

  void it('moves the window with the scroll, and keeps the height of the whole list', () => {
    assert.deepEqual(lightWindowOf(376, 1000, 190, 25), { start: 34, end: 54, top: 850, bottom: 8050 })
  })

  void it('stops at the last row', () => {
    assert.deepEqual(lightWindowOf(376, 9210, 190, 25), { start: 362, end: 376, top: 9050, bottom: 0 })
  })

  void it('gives an empty window for an empty list and for a row of no height', () => {
    assert.deepEqual(lightWindowOf(0, 0, 190, 25), { start: 0, end: 0, top: 0, bottom: 0 })
    assert.deepEqual(lightWindowOf(10, 0, 190, 0), { start: 0, end: 0, top: 0, bottom: 0 })
  })

  void it('keeps a stale scroll inside the list', () => {
    assert.deepEqual(lightWindowOf(5, 9000, 190, 25), { start: 4, end: 5, top: 100, bottom: 0 })
  })

  void it('draws the overscan of a box that has no size yet', () => {
    assert.deepEqual(lightWindowOf(376, 0, 0, 25), { start: 0, end: 6, top: 0, bottom: 9250 })
  })
})

void describe('lightRowsOf', () => {
  void it('names the lights by their index, with the shape and the color of the light', () => {
    const rows = lightRowsOf(
      [light(), light({ flags: ArxLightFlags.SemiDynamic, color: { r: 0, g: 0, b: 255, a: 1 } })],
      SCENE,
    )

    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0], {
      index: 0,
      shape: 'star',
      position: { x: 8160, y: 1750.71, z: 880 },
      color: '#ff8000',
    })
    assert.equal(rows[1]?.index, 1)
    assert.equal(rows[1]?.shape, 'bulb')
    assert.equal(rows[1]?.color, '#0000ff')
  })

  void it('puts the scene position to the local position of the light', () => {
    const [row] = lightRowsOf([light({ position: { x: 0, y: 0, z: 0 } })], SCENE)

    assert.deepEqual(row?.position, SCENE)
  })
})

void describe('lightShapeLabelOf', () => {
  void it('names every shape of a marker', () => {
    assert.equal(lightShapeLabelOf('star'), 'Static')
    assert.equal(lightShapeLabelOf('bulb'), 'Semi-dynamic')
    assert.equal(lightShapeLabelOf('flame'), 'Fire')
    assert.equal(lightShapeLabelOf('flameCrossed'), 'Off')
  })
})

void describe('lightIndexLabelOf', () => {
  void it('names a light with its index', () => {
    assert.equal(lightIndexLabelOf(0), 'light 0')
    assert.equal(lightIndexLabelOf(1), 'light 1')
    assert.equal(lightIndexLabelOf(10), 'light 10')
    assert.equal(lightIndexLabelOf(100), 'light 100')
  })
})

void describe('lightJumpPoseOf', () => {
  /**
   * A row of the list, at a place of the test.
   *
   * @param position The place in the game's coordinates.
   *
   * @returns A row of the list, with the place of the argument.
   */
  function rowAt(position: ArxVector3): LightRow {
    return { index: 0, shape: 'star', position, color: '#ffffff' }
  }

  void it('keeps the orientation of the camera, and puts the light 300 units ahead', () => {
    const pose: CameraPose = { position: { x: 0, y: 0, z: 0 }, angle: { pitch: 0, yaw: 0 } }
    const light = rowAt({ x: 100, y: 200, z: 300 })
    const jumped = lightJumpPoseOf(pose, light)

    assert.deepEqual(jumped.angle, pose.angle)
    assert.deepEqual(jumped.position, { x: 100, y: 200, z: 0 })
  })

  void it('stands 300 units from the light, on the line of the view', () => {
    const pose: CameraPose = { position: { x: 0, y: 0, z: 0 }, angle: { pitch: 10, yaw: 30 } }
    const light = rowAt({ x: 500, y: -100, z: 900 })
    const jumped = lightJumpPoseOf(pose, light)
    const dx = light.position.x - jumped.position.x
    const dy = light.position.y - jumped.position.y
    const dz = light.position.z - jumped.position.z

    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - 300) < 1e-9)
    assert.deepEqual(jumped.angle, pose.angle)
  })

  void it('takes the yaw into the line of the view', () => {
    const pose: CameraPose = { position: { x: 0, y: 0, z: 0 }, angle: { pitch: 0, yaw: 90 } }
    const jumped = lightJumpPoseOf(pose, rowAt({ x: -300, y: 0, z: 0 }))

    assert.ok(Math.abs(jumped.position.x) < 1e-9)
    assert.ok(Math.abs(jumped.position.y) < 1e-9)
    assert.ok(Math.abs(jumped.position.z) < 1e-9)
  })
})

void describe('lightPositionLabelOf', () => {
  void it('writes the three numbers with one decimal each', () => {
    assert.equal(lightPositionLabelOf({ x: 8160, y: 1750.71, z: 880 }), '8160.0, 1750.7, 880.0')
  })
})

void describe('filteredLightRows', () => {
  void it('shows every row for an empty search and the all filter', () => {
    const rows = lightRowsOf([light(), light({ flags: ArxLightFlags.SpawnFire })], SCENE)

    assert.equal(filteredLightRows(rows, '', 'all').length, 2)
    assert.equal(filteredLightRows(rows, '  ', 'all').length, 2)
  })

  void it('finds the row by its index', () => {
    const rows = lightRowsOf([light(), light({ position: { x: 1, y: 2, z: 3 } })], SCENE)

    assert.deepEqual(
      filteredLightRows(rows, '#1', 'all').map((row) => {
        return row.index
      }),
      [1],
    )
  })

  void it('finds the row by its shape and its place', () => {
    const rows = lightRowsOf(
      [light(), light({ flags: ArxLightFlags.SpawnFire, position: { x: 500, y: 0, z: 8605 } })],
      SCENE,
    )

    assert.deepEqual(
      filteredLightRows(rows, 'fire', 'all').map((row) => {
        return row.index
      }),
      [1],
    )
    assert.deepEqual(
      filteredLightRows(rows, '8650.0', 'all').map((row) => {
        return row.index
      }),
      [1],
    )
  })

  void it('keeps the rows of one shape only', () => {
    const rows = lightRowsOf(
      [
        light(),
        light({ flags: ArxLightFlags.SemiDynamic }),
        light({ flags: ArxLightFlags.SpawnFire }),
        light({ flags: ArxLightFlags.StartExtinguished }),
      ],
      SCENE,
    )

    assert.deepEqual(
      filteredLightRows(rows, '', 'flame').map((row) => {
        return row.index
      }),
      [2],
    )
    assert.deepEqual(
      filteredLightRows(rows, '', 'flameCrossed').map((row) => {
        return row.index
      }),
      [3],
    )
  })
})

void describe('lightSelectionLabelOf', () => {
  void it('counts the lights, and says how many are selected', () => {
    assert.equal(lightSelectionLabelOf(0, 0), '0 lights')
    assert.equal(lightSelectionLabelOf(1, 0), '1 light')
    assert.equal(lightSelectionLabelOf(376, 0), '376 lights')
    assert.equal(lightSelectionLabelOf(376, 1), '376 lights · 1 selected')
  })
})
