import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { splitSizes, type ChildFit } from '../../../../../src/editor/modules/layout/contentFit/split.ts'

/**
 * A child of a split with a hint and a range.
 *
 * @param hint The size it asks for.
 * @param min The size its content wants.
 * @param floor The smallest size it may ever take.
 * @param max The biggest size it may take.
 *
 * @returns The child fit.
 */
function child(hint: number, min = 0, floor = 0, max = Number.POSITIVE_INFINITY): ChildFit {
  return { hint, min, floor, max }
}

/**
 * Adds up the sizes of a list.
 *
 * @param values The sizes to add.
 *
 * @returns Their sum.
 */
function sum(values: readonly number[]): number {
  let total = 0

  for (const value of values) {
    total = total + value
  }

  return total
}

void describe('splitSizes', () => {
  void it('gives every child its hint when the hints fit', () => {
    assert.deepEqual(splitSizes(1000, [child(200), child(600), child(200)]), [200, 600, 200])
  })

  void it('hands the space a lock does not use to the others', () => {
    // the middle child is locked to 300: what it does not take goes to the free ones, no hole is left
    assert.deepEqual(splitSizes(1000, [child(200), child(600, 0, 40, 300), child(200)]), [350, 300, 350])
  })

  void it('keeps the minimum of every child when the hints are too small', () => {
    assert.deepEqual(splitSizes(1000, [child(100, 200, 40), child(900, 0, 40, 300)]), [700, 300])
  })

  void it('shrinks everything when the space is smaller than the minimums', () => {
    const sizes = splitSizes(300, [child(200, 200, 200), child(200, 200, 200)])

    assert.equal(sum(sizes), 300)
    assert.deepEqual(sizes, [150, 150])
  })

  void it('shrinks a lock that is bigger than the space', () => {
    const sizes = splitSizes(200, [child(800, 0, 40, 800)])

    assert.deepEqual(sizes, [200])
  })

  void it('takes the space a lock needs from the children that are not locked', () => {
    // the locked child keeps its 400 and the two free ones give the 100 the lock needs
    const sizes = splitSizes(500, [child(400, 0, 40, 400), child(100, 40, 40), child(100, 40, 40)])

    assert.equal(sum(sizes), 500)
    assert.deepEqual(sizes, [400, 50, 50])
  })
})
