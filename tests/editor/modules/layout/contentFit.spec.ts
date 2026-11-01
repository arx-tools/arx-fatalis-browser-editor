import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contentMins, MIN_WIDGET_HEIGHT, planMins } from '../../../../src/editor/modules/layout/contentFit.ts'
import type { LayoutNode } from '../../../../src/editor/modules/layout/layoutNode.ts'

void describe('contentMins', () => {
  void it('gives every list the height its content wants, when it fits', () => {
    // two lists and a view: the lists get their rows, the view gets the floor (it fills the leftover)
    assert.deepEqual(contentMins([180, 420, undefined], 900), [180, 420, MIN_WIDGET_HEIGHT])
  })

  void it('keeps the floor for a view, whatever the space is', () => {
    assert.deepEqual(contentMins([undefined, undefined], 900), [MIN_WIDGET_HEIGHT, MIN_WIDGET_HEIGHT])
  })

  void it('drops every minimum to the floor when the content does not fit', () => {
    // 180 + 420 + 300 = 900 wanted against 700 of space: everything shrinks and scrolls inside itself
    assert.deepEqual(contentMins([180, 420, 300], 700), [MIN_WIDGET_HEIGHT, MIN_WIDGET_HEIGHT, MIN_WIDGET_HEIGHT])
  })

  void it('fits exactly when the content takes the whole column', () => {
    const space = 900

    assert.deepEqual(contentMins([300, 600], space), [300, 600])
  })

  void it('rounds the measured heights, the browser gives fractions', () => {
    assert.deepEqual(contentMins([180.4, 319.6], 900), [180, 320])
  })

  void it('never goes below the floor, even for a tiny content', () => {
    assert.deepEqual(contentMins([12], 900), [MIN_WIDGET_HEIGHT])
  })

  void it('gives nothing for an empty column', () => {
    assert.deepEqual(contentMins([], 0), [])
  })
})

/**
 * Builds the tree the tests walk: two columns, the first with three widgets one under the other.
 *
 * @returns The tree of the two columns.
 */
function tree(): LayoutNode {
  return {
    type: 'split',
    orientation: 'horizontal',
    sizes: [0.5, 0.5],
    children: [
      {
        type: 'split',
        orientation: 'vertical',
        sizes: [0.2, 0.4, 0.4],
        children: [
          { type: 'widget', kind: 'map-statistics' },
          { type: 'widget', kind: 'polygon-inspector' },
          { type: 'widget', kind: 'keyboard-shortcuts' },
        ],
      },
      { type: 'widget', kind: '3d-view' },
    ],
  }
}

void describe('planMins', () => {
  void it('gives the lists of a column the height their content wants', () => {
    function measure(kind: string): number | undefined {
      return { 'map-statistics': 180, 'polygon-inspector': 300, 'keyboard-shortcuts': 420 }[kind]
    }

    assert.deepEqual(planMins(tree(), measure, 900), [
      { kind: 'map-statistics', min: 180 },
      { kind: 'polygon-inspector', min: 300 },
      { kind: 'keyboard-shortcuts', min: 420 },
    ])
  })

  void it('drops the minimums of the column when its content does not fit', () => {
    function measure(kind: string): number | undefined {
      return { 'map-statistics': 180, 'polygon-inspector': 300, 'keyboard-shortcuts': 420 }[kind]
    }

    // the three lists want 900, the column has 520: every one of them goes to the floor and scrolls
    assert.deepEqual(planMins(tree(), measure, 520), [
      { kind: 'map-statistics', min: MIN_WIDGET_HEIGHT },
      { kind: 'polygon-inspector', min: MIN_WIDGET_HEIGHT },
      { kind: 'keyboard-shortcuts', min: MIN_WIDGET_HEIGHT },
    ])
  })

  void it('gives a row of widgets the height of its tallest member', () => {
    function measure(kind: string): number | undefined {
      return { 'camera-controls': 50, 'jump-to-location': 50 }[kind]
    }

    const row: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: [0.1, 0.9],
      children: [
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'widget', kind: 'camera-controls' },
            { type: 'widget', kind: 'jump-to-location' },
          ],
        },
        { type: 'widget', kind: '3d-view' },
      ],
    }

    // the row gets 50, and the 3D view under it the floor (it is a view: it fills whatever is left)
    assert.deepEqual(planMins(row, measure, 900), [
      { kind: 'camera-controls', min: 50 },
      { kind: 'jump-to-location', min: 50 },
      { kind: '3d-view', min: MIN_WIDGET_HEIGHT },
    ])
  })

  void it('has nothing to say about a tree of views only', () => {
    const view: LayoutNode = { type: 'widget', kind: '3d-view' }

    function noMeasure(): number | undefined {
      return undefined
    }

    assert.deepEqual(planMins(view, noMeasure, 900), [])
  })
})
