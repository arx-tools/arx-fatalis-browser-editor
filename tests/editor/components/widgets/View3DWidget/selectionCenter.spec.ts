import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { selectionCenterOf } from '../../../../../src/editor/components/widgets/View3DWidget/selectionCenter.ts'

/**
 * Builds a face of the test, in the coordinates of the level.
 *
 * @param corners The corners, in the order of the polygon.
 * @param quad Whether the face is a quad (the fourth corner is used) or a triangle.
 *
 * @returns The face with those corners and that shape.
 */
function faceOf(corners: ReadonlyArray<readonly [number, number, number]>, quad: boolean): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (quad) {
    flags = ArxPolygonFlags.Quad
  }

  return {
    vertices: corners.map(([x, y, z]) => {
      return { x, y, z, u: 0, v: 0 }
    }),
    flags,
  } as unknown as ArxPolygon
}

/**
 * Builds a level of the test from its faces.
 *
 * @param faces The faces it has.
 *
 * @returns The level, ready to be read.
 */
function levelOf(faces: readonly ArxPolygon[]): ArxMap {
  return { polygons: faces } as unknown as ArxMap
}

void describe('selectionCenterOf', () => {
  void it('reads the middle of the box of the corners of one face', () => {
    // the fourth corner of a triangle is not used: a wild one must not pull the middle
    const triangle = faceOf(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 4],
        [100, 100, 100],
      ],
      false,
    )

    assert.deepEqual(selectionCenterOf(levelOf([triangle]), [0]), { x: 1, y: 0, z: 2 })
  })

  void it('reads the middle of the box of a quad', () => {
    const quad = faceOf(
      [
        [10, 0, 0],
        [20, 0, 0],
        [20, 0, 10],
        [10, 0, 10],
      ],
      true,
    )

    assert.deepEqual(selectionCenterOf(levelOf([quad]), [0]), { x: 15, y: 0, z: 5 })
  })

  void it('takes every corner of the selection into the box', () => {
    const triangle = faceOf(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 4],
        [0, 0, 4],
      ],
      false,
    )
    const quad = faceOf(
      [
        [10, 0, 0],
        [20, 0, 0],
        [20, 0, 10],
        [10, 0, 10],
      ],
      true,
    )

    assert.deepEqual(selectionCenterOf(levelOf([triangle, quad]), [0, 1]), { x: 10, y: 0, z: 5 })
  })

  void it('gives nothing for an empty selection or for a face the level does not have', () => {
    const triangle = faceOf(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 4],
        [0, 0, 4],
      ],
      false,
    )
    const level = levelOf([triangle])

    assert.equal(selectionCenterOf(level, []), undefined)
    assert.equal(selectionCenterOf(level, [9]), undefined)
    assert.deepEqual(selectionCenterOf(level, [0, 9]), { x: 1, y: 0, z: 2 })
  })
})
