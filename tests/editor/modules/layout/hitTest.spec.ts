import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

const { Widget } = await import('@lumino/widgets')
const { DROP_DISTANCE, EDGE_HOTSPOT_LENGTH, ROOT_ZONE_SHARE, edgeHotspotAt, hitTestDrop, modeAt, previewBox } =
  await import('../../../../src/editor/modules/layout/hitTest.ts')

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

void describe('edgeHotspotAt', () => {
  const dock = rect({ left: 0, top: 0, width: 1000, height: 600 })

  void it('finds the middle of every edge', () => {
    assert.equal(edgeHotspotAt(dock, 10, 300), 'split-left')
    assert.equal(edgeHotspotAt(dock, 990, 300), 'split-right')
    assert.equal(edgeHotspotAt(dock, 500, 10), 'split-top')
    assert.equal(edgeHotspotAt(dock, 500, 590), 'split-bottom')
  })

  void it('gives null in the middle of the dock', () => {
    assert.equal(edgeHotspotAt(dock, 500, 300), null)
  })

  void it('is twice as long along the edge as it is deep', () => {
    assert.equal(EDGE_HOTSPOT_LENGTH, 200)

    // the top hotspot of a 1000 px wide dock runs from 400 to 600, 100 px deep
    assert.equal(edgeHotspotAt(dock, 410, 10), 'split-top')
    assert.equal(edgeHotspotAt(dock, 590, 90), 'split-top')
    assert.equal(edgeHotspotAt(dock, 390, 10), null)
    assert.equal(edgeHotspotAt(dock, 610, 10), null)
    assert.equal(edgeHotspotAt(dock, 500, 110), null)

    // the left one runs from 200 to 400 down the edge
    assert.equal(edgeHotspotAt(dock, 10, 210), 'split-left')
    assert.equal(edgeHotspotAt(dock, 10, 390), 'split-left')
    assert.equal(edgeHotspotAt(dock, 10, 190), null)
    assert.equal(edgeHotspotAt(dock, 110, 300), null)
  })

  void it('keeps lumino order on a tie', () => {
    assert.equal(edgeHotspotAt(dock, 500, 0), 'split-top')
    assert.equal(edgeHotspotAt(dock, 500, 600), 'split-bottom')
  })

  void it('gives null outside the dock', () => {
    assert.equal(edgeHotspotAt(dock, 500, -10), null)
    assert.equal(edgeHotspotAt(dock, -10, 300), null)
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

  void it('gives the root edge inside the hotspot of an edge', () => {
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets, clientX: 8, clientY: 300 }), {
      mode: 'split-left',
      ref: null,
    })
  })

  void it('gives the nearest widget in the band away from the hotspot', () => {
    // 10 px from the top edge, but away from its middle: the widget under the pointer wins
    const strip = new Widget()
    const thin = [{ widget: strip, rect: rect({ left: 0, top: 0, width: 1000, height: 52 }) }]

    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: thin, clientX: 250, clientY: 10 }), {
      mode: 'split-top',
      ref: strip,
    })
  })

  void it('gives the half of a thin widget outside the hotspot', () => {
    // a 52 px strip at the top of the dock: only its outer 16 px is the band of the dock
    const strip = new Widget()
    const thin = [{ widget: strip, rect: rect({ left: 0, top: 0, width: 1000, height: 52 }) }]

    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: thin, clientX: 250, clientY: 26 }), {
      mode: 'split-left',
      ref: strip,
    })
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: thin, clientX: 750, clientY: 26 }), {
      mode: 'split-right',
      ref: strip,
    })
  })

  void it('gives the half of a narrow column outside the hotspot', () => {
    const column = new Widget()
    const narrow = [{ widget: column, rect: rect({ left: 0, top: 0, width: 150, height: 600 }) }]

    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: narrow, clientX: 20, clientY: 450 }), {
      mode: 'split-left',
      ref: column,
    })
    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: narrow, clientX: 40, clientY: 420 }), {
      mode: 'split-left',
      ref: column,
    })
  })

  void it('keeps the root edge over a widget when the pointer is in the hotspot', () => {
    const big = new Widget()
    const large = [{ widget: big, rect: rect({ left: 0, top: 0, width: 1000, height: 300 }) }]

    assert.deepEqual(hitTestDrop({ dockRect: dock, widgets: large, clientX: 500, clientY: 8 }), {
      mode: 'split-top',
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
