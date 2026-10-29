import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Vector3 } from 'three'
import type { CameraBounds } from '../../../../../src/editor/components/widgets/cameraBounds.ts'
import {
  gridAxes,
  gridOf,
  gridOrigin,
  largestSide,
  niceStep,
} from '../../../../../src/editor/components/widgets/FixedViewWidget/grid.ts'

/**
 * The box of a level: about a kilometre wide and half of that deep.
 */
const bounds: CameraBounds = {
  min: { x: -6000, y: -1200, z: -2000 },
  max: { x: 6000, y: 800, z: 2000 },
}

void describe('niceStep', () => {
  void it('gives the same number when it is already nice', () => {
    assert.equal(niceStep(1), 1)
    assert.equal(niceStep(2), 2)
    assert.equal(niceStep(5), 5)
    assert.equal(niceStep(500), 500)
  })

  void it('rounds up to the next nice number', () => {
    assert.equal(niceStep(0.7), 1)
    assert.equal(niceStep(1.5), 2)
    assert.equal(niceStep(3), 5)
    assert.equal(niceStep(7), 10)
    assert.equal(niceStep(1234), 2000)
  })

  void it('keeps a positive value for a zero or a negative one', () => {
    assert.equal(niceStep(0), 1)
    assert.equal(niceStep(-5), 1)
  })
})

void describe('gridOf', () => {
  void it('gives a cell that is a nice number of the level', () => {
    const layout = gridOf(10_000)

    assert.equal(layout.cell, 1000)
    assert.equal(layout.divisions, 10)
  })

  void it('steps the cell down as the span of the view shrinks', () => {
    // this is the subdivision of the zoom: the same view, a smaller part of the level
    const spans = [10_000, 5000, 2000, 500, 100]
    const cells = spans.map((span) => {
      return gridOf(span).cell
    })

    assert.deepEqual(cells, [1000, 500, 200, 50, 10])
  })

  void it('keeps the number of the cells readable', () => {
    const spans = [10_000, 4321, 987, 45, 3]
    const layouts = spans.map((span) => {
      return { span, ...gridOf(span) }
    })

    assert.deepEqual(
      layouts.filter((layout) => {
        return layout.divisions > 12
      }),
      [],
    )
    assert.deepEqual(
      layouts.filter((layout) => {
        return layout.cell * layout.divisions < layout.span
      }),
      [],
    )
  })
})

void describe('gridAxes', () => {
  void it('puts the grid on the plane of every direction', () => {
    assert.deepEqual(gridAxes('top'), { first: 'x', second: 'z' })
    assert.deepEqual(gridAxes('bottom'), { first: 'x', second: 'z' })
    assert.deepEqual(gridAxes('front'), { first: 'x', second: 'y' })
    assert.deepEqual(gridAxes('back'), { first: 'x', second: 'y' })
    assert.deepEqual(gridAxes('left'), { first: 'z', second: 'y' })
    assert.deepEqual(gridAxes('right'), { first: 'z', second: 'y' })
  })
})

void describe('gridOrigin', () => {
  void it('snaps the two axes of the view to the cell', () => {
    const origin = gridOrigin(new Vector3(2317, 120, 498), 'top', 500)

    assert.deepEqual(origin, new Vector3(2000, 120, 0))
  })

  void it('keeps the depth of the point the view looks at', () => {
    // the front view looks along Z, so the z of the target is the depth of the grid
    const origin = gridOrigin(new Vector3(2317, 120, 498), 'front', 500)

    assert.deepEqual(origin, new Vector3(2000, 0, 498))
  })

  void it('snaps towards the smaller value, so a line always means the same place', () => {
    const first = gridOrigin(new Vector3(10, 0, 10), 'top', 1000)
    const second = gridOrigin(new Vector3(900, 0, 900), 'top', 1000)

    assert.equal(first.x, 0)
    assert.equal(second.x, 0)
  })
})

void describe('largestSide', () => {
  void it('gives the longest of the three sizes', () => {
    assert.equal(largestSide(bounds), 12_000)
  })
})
