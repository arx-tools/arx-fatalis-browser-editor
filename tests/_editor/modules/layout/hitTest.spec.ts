import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

const { Widget } = await import('@lumino/widgets')
const { DROP_DISTANCE, EDGE_ZONE, ROOT_ZONE_SHARE, edgeZoneAt, hitTestDrop, modeAt, previewBox } =
  await import('../../../../src/_editor/modules/layout/hitTest.ts')

/**
 * The position and the size a test rectangle is built from.
 */
interface Box {
  /**
   * The left edge.
   */
  readonly left: number
  /**
   * The top edge.
   */
  readonly top: number
  /**
   * The width.
   */
  readonly width: number
  /**
   * The height.
   */
  readonly height: number
}

/**
 * A rectangle with the given position and size.
 *
 * @param box The position and the size of the rectangle.
 *
 * @returns The rectangle, with all the edges of a `getBoundingClientRect` result.
 */
function rect(box: Box): {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
} {
  return {
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
  }
}

void describe('modeAt', () => {
  const centre = rect({ left: 100, top: 100, width: 200, height: 200 })

  void it('gives the left and the right half', () => {
    assert.equal(modeAt(centre, 120, 200), 'split-left')
    assert.equal(modeAt(centre, 280, 200), 'split-right')
  })

  void it('gives the top and the bottom half', () => {
    assert.equal(modeAt(centre, 200, 120), 'split-top')
    assert.equal(modeAt(centre, 200, 280), 'split-bottom')
  })

  void it('prefers the horizontal axis in the diagonal middle', () => {
    assert.equal(modeAt(centre, 200, 200), 'split-right')
  })
})

void describe('edgeZoneAt', () => {
  const dock = rect({ left: 0, top: 0, width: 1000, height: 600 })

  void it('finds every edge inside the band', () => {
    assert.equal(edgeZoneAt(dock, 10, 300, EDGE_ZONE), 'split-left')
    assert.equal(edgeZoneAt(dock, 990, 300, EDGE_ZONE), 'split-right')
    assert.equal(edgeZoneAt(dock, 500, 10, EDGE_ZONE), 'split-top')
    assert.equal(edgeZoneAt(dock, 500, 590, EDGE_ZONE), 'split-bottom')
  })

  void it('gives null in the middle of the dock', () => {
    assert.equal(edgeZoneAt(dock, 500, 300, EDGE_ZONE), null)
  })

  void it('keeps lumino order on a tie', () => {
    assert.equal(edgeZoneAt(dock, 0, 0, EDGE_ZONE), 'split-top')
    assert.equal(edgeZoneAt(dock, 1000, 600, EDGE_ZONE), 'split-right')
  })
})

void describe('hitTestDrop', () => {
  const dock = rect({ left: 0, top: 0, width: 1000, height: 600 })
  const first = new Widget()
  const second = new Widget()
  const widgets = [
    { widget: first, rect: rect({ left: 400, top: 200, width: 200, height: 200 }) },
    { widget: second, rect: rect({ left: 700, top: 200, width: 200, height: 200 }) },
  ]

  void it('gives no target outside the dock', () => {
    assert.equal(hitTestDrop({ dockRect: dock, widgets, clientX: 1100, clientY: 300 }), null)
  })

  void it('gives the root for an empty dock', () => {
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: [], clientX: 500, clientY: 300 }), {
      mode: 'tab-after',
      ref: null,
    })
  })

  void it('gives the root edge inside the band', () => {
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets, clientX: 20, clientY: 300 }), {
      mode: 'split-left',
      ref: null,
    })
  })

  void it('gives the half of the widget under the pointer', () => {
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets, clientX: 420, clientY: 300 }), {
      mode: 'split-left',
      ref: first,
    })
  })

  void it('gives no target farther than the drop distance from every widget', () => {
    const far = 400 - DROP_DISTANCE - 10
    assert.equal(hitTestDrop({ dockRect: dock, widgets, clientX: far, clientY: 300 }), null)
  })
})

void describe('previewBox', () => {
  const dock = rect({ left: 0, top: 0, width: 1000, height: 600 })
  const widget = new Widget()
  const widgets = [{ widget, rect: rect({ left: 400, top: 100, width: 600, height: 400 }) }]

  void it('takes a share of the dock for a root edge', () => {
    const box = previewBox({ mode: 'split-left', ref: null }, dock, widgets)

    assert.equal(box.left, 3)
    assert.ok(box.width < 1000 * ROOT_ZONE_SHARE)
    assert.ok(box.width > 1000 * (ROOT_ZONE_SHARE - 0.02))
  })

  void it('takes the half of the reference widget', () => {
    const box = previewBox({ mode: 'split-right', ref: widget }, dock, widgets)

    assert.ok(box.left > 400)
    assert.ok(box.width < 300)
  })

  void it('falls back to the whole dock for an unknown widget', () => {
    const box = previewBox({ mode: 'split-left', ref: new Widget() }, dock, widgets)

    assert.equal(box.left, 3)
    assert.equal(box.width, 1000 - 6)
  })
})
