import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  BorderDragTarget,
  BorderDragWatcher,
  DragBoard,
  DragRect,
  HeldSplit,
} from '../../../../src/editor/modules/layout/borderDrag.ts'
import type { LayoutNode } from '../../../../src/editor/modules/layout/layoutNode.ts'
import type { WidgetDefinition } from '../../../../src/editor/modules/layout/widgetDefinition.ts'
import { installDom } from '../../../support/dom.ts'

installDom()

const { Widget } = await import('@lumino/widgets')
const { editorLayout } = await import('../../../../src/editor/modules/layout/layoutPresets.ts')
const { lockWidgetTo, lockedBoxOf } = await import('../../../../src/editor/modules/layout/layoutNode.ts')
const { createWidget } = await import('../../../../src/editor/modules/layout/widgetDefinition.ts')
const {
  applyDragEdges,
  boardOf,
  borderAxisOf,
  dragTargetsOf,
  gapBetween,
  heldSizes,
  heldSplitsOf,
  holdSplit,
  nodeBoxes,
  visibleHandles,
  watchBorderDrag,
} = await import('../../../../src/editor/modules/layout/borderDrag.ts')

/**
 * The gaps between two children of a split take this much room in the dock.
 */
const SPACING = 4

/**
 * The geometry of the `Editor` preset in a 1280x850 window, as the owner measured it (2026-11-01).
 *
 * @remarks
 * The dock starts at y = 31 (the header is above it), the columns are 254 / 763 / 254 wide with a 4px gap, and the
 * thin row of the middle column is 50 high. The boxes are the boxes of the widget nodes, which is what the browser
 * gives at the press of a border.
 */
const BOXES: Record<string, DragRect> = {
  'top-view': { left: 0, top: 31, width: 254, height: 270 },
  'left-view': { left: 0, top: 305, width: 254, height: 270 },
  'front-view': { left: 0, top: 580, width: 254, height: 270 },
  'camera-controls': { left: 258, top: 31, width: 455, height: 50 },
  'jump-to-location': { left: 718, top: 31, width: 304, height: 50 },
  '3d-view': { left: 258, top: 85, width: 763, height: 765 },
  'map-statistics': { left: 1026, top: 31, width: 254, height: 212 },
  'polygon-inspector': { left: 1026, top: 247, width: 254, height: 201 },
  'keyboard-shortcuts': { left: 1026, top: 452, width: 254, height: 398 },
}

/**
 * The box of the dock the boxes above belong to.
 */
const DOCK: DragRect = { left: 0, top: 31, width: 1280, height: 819 }

/**
 * The borders of the `Editor` preset, as the handles of the dock stand on them.
 *
 * @remarks
 * The four the owner walked through with a locked jump, and a border of the two side columns to show that they are not
 * taken for the border of the row.
 */
const HANDLES = {
  leftColumnTop: { left: 0, top: 301, width: 254, height: 4 },
  leftColumnMiddle: { left: 0, top: 576, width: 254, height: 4 },
  leftMiddle: { left: 254, top: 31, width: 4, height: 819 },
  cameraJump: { left: 714, top: 31, width: 4, height: 50 },
  rowView: { left: 258, top: 81, width: 763, height: 4 },
  middleRight: { left: 1022, top: 31, width: 4, height: 819 },
  rightColumnTop: { left: 1026, top: 243, width: 254, height: 4 },
  rightColumnMiddle: { left: 1026, top: 448, width: 254, height: 4 },
} satisfies Record<string, DragRect>

/**
 * A kind of widget for the test: an empty widget, which is enough for the boxes and the locks.
 *
 * @param kind The identifier the widget is created with.
 *
 * @returns What the dock needs to build a widget of that kind.
 */
function widgetDefinitionOf(kind: string): WidgetDefinition {
  return {
    kind,
    label: kind,
    group: 'rendering',
    create: (): InstanceType<typeof Widget> => {
      return new Widget()
    },
  }
}

/**
 * The box a stub reports: the drag rect and the edges the browser adds to it.
 */
interface StubRect extends DragRect {
  /**
   * The distance of the right edge from the left edge of the viewport.
   */
  readonly right: number
  /**
   * The distance of the bottom edge from the top edge of the viewport.
   */
  readonly bottom: number
}

/**
 * Puts a box on the node of an element, in place of the one a layout engine would give it.
 *
 * @param element The element to measure.
 * @param box The box the browser would report.
 */
function stubBox(element: HTMLElement, box: DragRect): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: (): StubRect => {
      return { ...box, right: box.left + box.width, bottom: box.top + box.height }
    },
    configurable: true,
  })
}

/**
 * Creates a widget of every kind of the editor layout.
 *
 * @returns The widgets, by kind.
 */
function makeWidgets(): Map<string, ReturnType<typeof createWidget>> {
  const widgets = new Map<string, ReturnType<typeof createWidget>>()

  for (const kind of Object.keys(BOXES)) {
    widgets.set(kind, createWidget(widgetDefinitionOf(kind)))
  }

  return widgets
}

/**
 * Reads one child of a split of the editor layout.
 *
 * @param tree The tree to read.
 * @param index Which child to take.
 *
 * @returns The node at that place.
 *
 * @throws When the node is not a split or it has no child there, which means the test built a broken tree.
 */
function childAt(tree: LayoutNode, index: number): LayoutNode {
  if (tree.type !== 'split') {
    throw new Error('the test expects a split')
  }

  const child = tree.children[index]

  if (child === undefined) {
    throw new Error(`the test expects at least ${String(index + 1)} children`)
  }

  return child
}

/**
 * Reads a widget of the test, or throws when it is not on the dock.
 *
 * @param widgets The widgets of the dock, by kind.
 * @param kind The kind to read.
 *
 * @returns The widget of that kind.
 *
 * @throws When the kind is not on the dock, which means the test built a broken dock.
 */
function mustWidget(
  widgets: Map<string, ReturnType<typeof createWidget>>,
  kind: string,
): ReturnType<typeof createWidget> {
  const widget = widgets.get(kind)

  if (widget === undefined) {
    throw new Error(`the test expects a widget of the kind ${kind}`)
  }

  return widget
}

/**
 * Reads a handle of the test, or throws when the dock has none of that name.
 *
 * @param handles Where the dock keeps its handles, by name.
 * @param name Which handle to read.
 *
 * @returns The element the user presses.
 *
 * @throws When the dock has no handle of that name, which means the test built a broken dock.
 */
function mustHandle(handles: Record<string, HTMLElement>, name: string): HTMLElement {
  const handle = handles[name]

  if (handle === undefined) {
    throw new Error(`the test expects a handle called ${name}`)
  }

  return handle
}

/**
 * Builds the board of a press on the dock of the `Editor` preset.
 *
 * @param locked The kinds that are locked when the border is pressed.
 *
 * @returns The board, with the measured boxes of the layout.
 */
function makeBoard(locked: readonly string[] = []): DragBoard {
  const widgets = makeWidgets()

  for (const [kind, widget] of widgets) {
    const box = BOXES[kind]

    if (box === undefined) {
      continue
    }

    stubBox(widget.node, box)

    if (locked.includes(kind)) {
      lockWidgetTo(widget, { width: box.width, height: box.height })
    }
  }

  const handles: HTMLElement[] = []

  for (const box of Object.values(HANDLES)) {
    const handle = document.createElement('div')

    stubBox(handle, box)
    handles.push(handle)
  }

  return boardOf(editorLayout, widgets, handles, SPACING)
}

/**
 * One border of the layout and what it does to the locked jump.
 */
interface BorderCase {
  /**
   * What the owner numbered the border.
   */
  readonly line: string
  /**
   * The box of the handle.
   */
  readonly handle: DragRect
  /**
   * The axis of the jump the border resizes, or `undefined` when it resizes nothing.
   */
  readonly expected: BorderDragTarget | undefined
}

void describe('borderAxisOf', () => {
  void it('reads a tall border as a border of widths', () => {
    assert.equal(borderAxisOf({ left: 0, top: 0, width: 4, height: 819 }), 'width')
  })

  void it('reads a wide border as a border of heights', () => {
    assert.equal(borderAxisOf({ left: 0, top: 0, width: 763, height: 4 }), 'height')
  })
})

void describe('gapBetween', () => {
  void it('reads the gap of two children side by side', () => {
    const first = { left: 258, top: 31, width: 455, height: 50 }
    const second = { left: 718, top: 31, width: 304, height: 50 }

    assert.deepEqual(gapBetween(first, second, 'width', SPACING), { left: 713, top: 31, width: 5, height: 50 })
  })

  void it('reads the gap of two children one above the other', () => {
    const first = { left: 258, top: 31, width: 763, height: 50 }
    const second = { left: 258, top: 85, width: 763, height: 765 }

    assert.deepEqual(gapBetween(first, second, 'height', SPACING), { left: 258, top: 81, width: 763, height: 4 })
  })

  void it('gives nothing when the two are not neighbours', () => {
    const first = { left: 258, top: 31, width: 455, height: 50 }
    const second = { left: 1026, top: 31, width: 254, height: 212 }

    assert.equal(gapBetween(first, second, 'width', SPACING), undefined)
  })

  void it('gives nothing when the two do not share their other extent', () => {
    const first = { left: 258, top: 31, width: 455, height: 50 }
    const second = { left: 718, top: 40, width: 304, height: 50 }

    assert.equal(gapBetween(first, second, 'width', SPACING), undefined)
  })

  void it('gives nothing along the other axis', () => {
    const first = { left: 258, top: 31, width: 455, height: 50 }
    const second = { left: 718, top: 31, width: 304, height: 50 }

    assert.equal(gapBetween(first, second, 'height', SPACING), undefined)
  })
})

void describe('nodeBoxes', () => {
  void it('takes the box of a split from the boxes below it', () => {
    const boxes = nodeBoxes(editorLayout, (kind) => {
      return BOXES[kind]
    })
    const middle = childAt(editorLayout, 1)

    // the camera is 455 wide in whole pixels and the jump starts at 718, so the union is a pixel wider than the
    // planned 763: the boxes of the browser are the ones the drag reads
    assert.deepEqual(boxes.get(middle), { left: 258, top: 31, width: 764, height: 819 })
    assert.deepEqual(boxes.get(editorLayout), DOCK)
  })

  void it('leaves out a widget that is not on the dock', () => {
    const boxes = nodeBoxes(editorLayout, (kind) => {
      if (kind === 'top-view') {
        return BOXES[kind]
      }

      return undefined
    })

    assert.deepEqual(boxes.get(editorLayout), BOXES['top-view'])
  })

  void it('gives no box when nothing is on the dock', () => {
    const boxes = nodeBoxes(editorLayout, () => {
      return undefined
    })

    assert.equal(boxes.size, 0)
  })
})

void describe('dragTargetsOf', () => {
  const borders: readonly BorderCase[] = [
    {
      line: '1 and 2 (the left column widens, the camera takes it)',
      handle: HANDLES.leftMiddle,
      expected: undefined,
    },
    {
      line: '3 and 5 (the row gets taller, the 3D view gives it)',
      handle: HANDLES.rowView,
      expected: { edge: 'cross', axis: 'height' },
    },
    { line: '4 (the camera | jump border)', handle: HANDLES.cameraJump, expected: { edge: 'own', axis: 'width' } },
    {
      line: '6 and 7 (the right column widens, the camera takes it)',
      handle: HANDLES.middleRight,
      expected: undefined,
    },
    { line: 'the top of the left column (another split)', handle: HANDLES.leftColumnTop, expected: undefined },
    { line: 'the middle of the right column (another split)', handle: HANDLES.rightColumnMiddle, expected: undefined },
  ]

  for (const border of borders) {
    void it(`classifies line ${border.line} with a locked jump`, () => {
      const board = makeBoard(['jump-to-location'])

      assert.deepEqual(dragTargetsOf(board, border.handle).get('jump-to-location'), border.expected)
    })
  }

  void it('gives nothing when no widget is locked', () => {
    const board = makeBoard()

    assert.equal(dragTargetsOf(board, HANDLES.cameraJump).size, 0)
  })

  void it('writes the cross axis of a locked column widget on a column border', () => {
    const board = makeBoard(['map-statistics'])

    assert.deepEqual(dragTargetsOf(board, HANDLES.middleRight).get('map-statistics'), {
      edge: 'cross',
      axis: 'width',
    })
  })

  void it('writes the own axis of the widget of the split the border is in', () => {
    const board = makeBoard(['3d-view'])

    assert.deepEqual(dragTargetsOf(board, HANDLES.rowView).get('3d-view'), { edge: 'own', axis: 'height' })
  })

  void it('leaves a widget alone when the border is not next to it', () => {
    const board = makeBoard(['front-view'])

    assert.equal(dragTargetsOf(board, HANDLES.rowView).size, 0)
  })
})

void describe('heldSplitsOf', () => {
  void it('reads the split of the locked widget', () => {
    const holds = heldSplitsOf(makeBoard(['jump-to-location']))

    assert.equal(holds.length, 1)
    assert.equal(holds[0]?.axis, 'width')
    assert.deepEqual(holds[0]?.box, { left: 258, top: 31, width: 764, height: 50 })
    assert.deepEqual(
      holds[0]?.children.map((child) => {
        return { size: child.size, locked: child.locked }
      }),
      [
        { size: 455, locked: false },
        { size: 304, locked: true },
      ],
    )
  })

  void it('gives nothing when no widget of the split is locked', () => {
    assert.equal(heldSplitsOf(makeBoard()).length, 0)
  })
})

void describe('heldSizes', () => {
  void it('keeps the held size and gives the rest to the free one', () => {
    assert.deepEqual(heldSizes([455, 304], [false, true], 819), [515, 304])
  })

  void it('gives the free ones the space in the proportion they had', () => {
    assert.deepEqual(heldSizes([300, 100, 400], [false, false, true], 800), [300, 100, 400])
  })

  void it('shrinks the free ones when the space goes away', () => {
    assert.deepEqual(heldSizes([150, 50, 400], [false, false, true], 800), [300, 100, 400])
    assert.deepEqual(heldSizes([455, 304], [false, true], 380), [76, 304])
  })

  void it('shrinks everything when there is no room for the held sizes', () => {
    const sizes = heldSizes([455, 304], [false, true], 300)

    assert.equal(Math.round(sizes[0] ?? 0), 180)
    assert.equal(Math.round(sizes[1] ?? 0), 120)
  })

  void it('keeps the sizes when there is no space at all', () => {
    assert.deepEqual(heldSizes([455, 304], [false, true], 0), [455, 304])
    assert.deepEqual(heldSizes([], [], 100), [])
  })
})

void describe('holdSplit', () => {
  void it('keeps the locked child at its size and gives the rest to the free one', () => {
    const widgets = makeWidgets()
    const camera = mustWidget(widgets, 'camera-controls')
    const jump = mustWidget(widgets, 'jump-to-location')

    const handle = document.createElement('div')

    const hold: HeldSplit = {
      axis: 'width',
      box: { left: 258, top: 31, width: 763, height: 50 },
      children: [
        { widget: camera, size: 455, locked: false },
        { widget: jump, size: 304, locked: true },
      ],
      handles: [handle],
    }

    // lumino laid the row out 60 wider: the jump kept its slot, the camera grew with the row
    stubBox(camera.node, { left: 258, top: 31, width: 515, height: 50 })
    stubBox(jump.node, { left: 777, top: 31, width: 304, height: 50 })

    holdSplit(hold, SPACING, DOCK)

    assert.equal(camera.node.style.left, '258px')
    assert.equal(camera.node.style.width, '515px')
    assert.equal(camera.node.style.height, '50px')
    assert.equal(jump.node.style.left, '777px')
    assert.equal(jump.node.style.width, '304px')
    assert.equal(handle.style.left, '773px')
    assert.equal(handle.style.width, '4px')
  })

  void it('does nothing when the box of the split did not change', () => {
    const widgets = makeWidgets()
    const camera = mustWidget(widgets, 'camera-controls')
    const jump = mustWidget(widgets, 'jump-to-location')

    const hold: HeldSplit = {
      axis: 'width',
      box: { left: 258, top: 31, width: 763, height: 50 },
      children: [
        { widget: camera, size: 455, locked: false },
        { widget: jump, size: 304, locked: true },
      ],
      handles: [document.createElement('div')],
    }

    stubBox(camera.node, { left: 258, top: 31, width: 455, height: 50 })
    stubBox(jump.node, { left: 718, top: 31, width: 304, height: 50 })

    holdSplit(hold, SPACING, DOCK)

    assert.equal(camera.node.style.width, '')
    assert.equal(jump.node.style.width, '')
  })

  void it('lays a held split out along the height too', () => {
    const widgets = makeWidgets()
    const statistics = mustWidget(widgets, 'map-statistics')
    const inspector = mustWidget(widgets, 'polygon-inspector')

    const hold: HeldSplit = {
      axis: 'height',
      box: { left: 1026, top: 31, width: 254, height: 417 },
      children: [
        { widget: statistics, size: 212, locked: true },
        { widget: inspector, size: 201, locked: false },
      ],
      handles: [document.createElement('div')],
    }

    // the column grew by 100: the two widgets grew with it
    stubBox(statistics.node, { left: 1026, top: 31, width: 254, height: 262 })
    stubBox(inspector.node, { left: 1026, top: 297, width: 254, height: 251 })

    holdSplit(hold, SPACING, DOCK)

    assert.equal(statistics.node.style.top, '0px')
    assert.equal(statistics.node.style.height, '212px')
    assert.equal(inspector.node.style.top, '216px')
    assert.equal(inspector.node.style.height, '301px')
  })
})

void describe('applyDragEdges', () => {
  /**
   * Reads a widget of the test, locked to a box.
   *
   * @param kind The kind the widget carries.
   * @param width How wide the lock is.
   * @param height How tall the lock is.
   *
   * @returns The widget, with the lock on it.
   */
  function lockedWidget(kind: string, width: number, height: number): ReturnType<typeof createWidget> {
    const widget = createWidget(widgetDefinitionOf(kind))

    lockWidgetTo(widget, { width, height })

    return widget
  }

  /**
   * Reads the live widget of a kind for the write, as the shell does.
   *
   * @param live The widget the reader hands over.
   *
   * @returns The reader the dock calls for a kind.
   */
  function readerOf(live: ReturnType<typeof createWidget>): (kind: string) => ReturnType<typeof createWidget> {
    return () => {
      return live
    }
  }

  void it('writes the new width of an own border', () => {
    const widget = lockedWidget('jump-to-location', 304, 50)

    stubBox(widget.node, { left: 798, top: 31, width: 224, height: 50 })

    const targets = new Map<string, BorderDragTarget>([['jump-to-location', { edge: 'own', axis: 'width' }]])

    assert.equal(applyDragEdges(targets, readerOf(widget)), true)
    assert.deepEqual(lockedBoxOf(widget), { width: 224, height: 50 })
  })

  void it('writes the new height of a cross border and keeps the width', () => {
    const widget = lockedWidget('jump-to-location', 304, 50)

    stubBox(widget.node, { left: 718, top: 31, width: 304, height: 90 })

    const targets = new Map<string, BorderDragTarget>([['jump-to-location', { edge: 'cross', axis: 'height' }]])

    assert.equal(applyDragEdges(targets, readerOf(widget)), true)
    assert.deepEqual(lockedBoxOf(widget), { width: 304, height: 90 })
  })

  void it('writes nothing on a container drag', () => {
    const widget = lockedWidget('jump-to-location', 304, 50)

    stubBox(widget.node, { left: 718, top: 31, width: 364, height: 50 })

    assert.equal(applyDragEdges(new Map(), readerOf(widget)), false)
    assert.deepEqual(lockedBoxOf(widget), { width: 304, height: 50 })
  })

  void it('writes nothing when the size did not change', () => {
    const widget = lockedWidget('jump-to-location', 304, 50)

    stubBox(widget.node, { left: 718, top: 31, width: 304, height: 50 })

    const targets = new Map<string, BorderDragTarget>([['jump-to-location', { edge: 'own', axis: 'width' }]])

    assert.equal(applyDragEdges(targets, readerOf(widget)), false)
  })

  void it('writes nothing for a widget that is not on the dock', () => {
    const targets = new Map<string, BorderDragTarget>([['jump-to-location', { edge: 'own', axis: 'width' }]])

    assert.equal(
      applyDragEdges(targets, () => {
        return undefined
      }),
      false,
    )
  })

  void it('writes nothing when the widget lost its lock', () => {
    const widget = createWidget(widgetDefinitionOf('jump-to-location'))

    stubBox(widget.node, { left: 718, top: 31, width: 224, height: 50 })

    const targets = new Map<string, BorderDragTarget>([['jump-to-location', { edge: 'own', axis: 'width' }]])

    assert.equal(applyDragEdges(targets, readerOf(widget)), false)
  })
})

void describe('watchBorderDrag', () => {
  /**
   * The dock of the watcher: plain elements, so no layout engine is needed.
   */
  interface TestDock {
    /**
     * The element the dock is attached to.
     */
    readonly host: HTMLElement
    /**
     * The widgets, by kind.
     */
    readonly widgets: Map<string, ReturnType<typeof createWidget>>
    /**
     * The handles, by name.
     */
    readonly handles: Record<string, HTMLElement>
    /**
     * The calls of the end of a drag.
     */
    readonly ended: number[]
  }

  /**
   * Builds a dock out of plain elements, so the watcher can be driven without lumino.
   *
   * @returns The dock of the test.
   */
  function buildDock(): TestDock {
    const host = document.createElement('div')
    const panel = document.createElement('div')
    const widgets = new Map<string, ReturnType<typeof createWidget>>()
    const handles: Record<string, HTMLElement> = {}

    panel.className = 'lm-DockPanel'
    host.append(panel)
    document.body.append(host)
    stubBox(panel, DOCK)

    for (const [kind, box] of Object.entries(BOXES)) {
      const widget = createWidget(widgetDefinitionOf(kind))

      stubBox(widget.node, box)
      panel.append(widget.node)
      widgets.set(kind, widget)
    }

    for (const [name, box] of Object.entries(HANDLES)) {
      const handle = document.createElement('div')

      handle.className = 'lm-DockPanel-handle'
      stubBox(handle, box)
      panel.append(handle)
      handles[name] = handle
    }

    return { host, widgets, handles, ended: [] }
  }

  /**
   * Starts the watcher on the dock of the test.
   *
   * @param dock The dock to watch.
   *
   * @returns The watcher, to stop it at the end of the test.
   */
  function watch(dock: TestDock): BorderDragWatcher {
    return watchBorderDrag(dock.host, {
      tree: () => {
        return editorLayout
      },
      widgets: () => {
        return dock.widgets.values().toArray()
      },
      spacing: SPACING,
      onEnded: () => {
        dock.ended.push(dock.ended.length)
      },
    })
  }

  /**
   * Sends a pointer event to an element.
   *
   * @param type The type of the event.
   * @param target The element to send it to.
   * @param x The horizontal position of the pointer.
   * @param y The vertical position of the pointer.
   */
  function send(type: string, target: EventTarget, x: number, y: number): void {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))
  }

  /**
   * Waits for the frame the correction of the drag runs on.
   */
  async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60)
    })
  }

  void it('holds the locked widget while a container border is dragged, and leaves its lock alone', async () => {
    const dock = buildDock()
    const jump = mustWidget(dock.widgets, 'jump-to-location')
    const camera = mustWidget(dock.widgets, 'camera-controls')

    lockWidgetTo(jump, { width: 304, height: 50 })

    const watcher = watch(dock)
    const handle = mustHandle(dock.handles, 'leftMiddle')
    assert.equal(visibleHandles(dock.host).length, Object.keys(HANDLES).length)

    send('pointerdown', handle, 256, 400)
    send('pointermove', document, 316, 400)

    // lumino laid the row out 60 wider before the correction runs; the jump would stretch with it
    stubBox(camera.node, { left: 258, top: 31, width: 515, height: 50 })
    stubBox(jump.node, { left: 777, top: 31, width: 304, height: 50 })

    await nextFrame()

    assert.equal(camera.node.style.width, '515px')
    assert.equal(jump.node.style.left, '777px')

    send('pointerup', document, 316, 400)

    assert.equal(dock.ended.length, 1)
    assert.deepEqual(lockedBoxOf(jump), { width: 304, height: 50 })

    watcher.dispose()
  })

  void it('writes the new lock of the own border of the widget', async () => {
    const dock = buildDock()
    const jump = mustWidget(dock.widgets, 'jump-to-location')

    lockWidgetTo(jump, { width: 304, height: 50 })

    const watcher = watch(dock)
    const handle = mustHandle(dock.handles, 'cameraJump')

    send('pointerdown', handle, 716, 56)
    send('pointermove', document, 796, 56)

    stubBox(jump.node, { left: 798, top: 31, width: 224, height: 50 })

    await nextFrame()
    send('pointerup', document, 796, 56)

    assert.equal(dock.ended.length, 1)
    assert.deepEqual(lockedBoxOf(jump), { width: 224, height: 50 })

    watcher.dispose()
  })

  void it('writes nothing when the pointer did not move', () => {
    const dock = buildDock()
    const jump = mustWidget(dock.widgets, 'jump-to-location')

    lockWidgetTo(jump, { width: 304, height: 50 })

    const watcher = watch(dock)
    const handle = mustHandle(dock.handles, 'cameraJump')

    send('pointerdown', handle, 716, 56)
    send('pointerup', document, 716, 56)

    assert.equal(dock.ended.length, 0)
    assert.deepEqual(lockedBoxOf(jump), { width: 304, height: 50 })

    watcher.dispose()
  })

  void it('goes back to the managed sizes when the escape key cancels the drag', () => {
    const dock = buildDock()
    const jump = mustWidget(dock.widgets, 'jump-to-location')

    lockWidgetTo(jump, { width: 304, height: 50 })

    const watcher = watch(dock)
    const handle = mustHandle(dock.handles, 'cameraJump')

    send('pointerdown', handle, 716, 56)
    send('pointermove', document, 796, 56)

    stubBox(jump.node, { left: 798, top: 31, width: 224, height: 50 })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    assert.equal(dock.ended.length, 1)
    assert.equal(watcher.isActive(), false)
    assert.deepEqual(lockedBoxOf(jump), { width: 304, height: 50 })

    watcher.dispose()
  })

  void it('ignores a press that is not on a handle', () => {
    const dock = buildDock()
    const jump = mustWidget(dock.widgets, 'jump-to-location')

    const watcher = watch(dock)

    send('pointerdown', jump.node, 700, 56)

    assert.equal(watcher.isActive(), false)

    watcher.dispose()
  })

  void it('ignores a press on a hidden handle', () => {
    const dock = buildDock()
    const handle = mustHandle(dock.handles, 'cameraJump')

    handle.classList.add('lm-mod-hidden')

    const watcher = watch(dock)

    send('pointerdown', handle, 716, 56)

    assert.equal(watcher.isActive(), false)

    handle.classList.remove('lm-mod-hidden')
    watcher.dispose()
  })
})
