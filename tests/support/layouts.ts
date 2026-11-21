import type { ChildSize, LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'

/**
 * A child of a split that follows the layout.
 *
 * @param ratio The share of the free space.
 *
 * @returns The size spec of a free child.
 */
function auto(ratio: number): ChildSize {
  return { kind: 'auto', ratio }
}

/**
 * A child of a split that keeps a pixel size along the axis of the split.
 *
 * @param px The size along the axis of the split.
 *
 * @returns The size spec of a locked child.
 */
function fixed(px: number): ChildSize {
  return { kind: 'fixed', px }
}

/**
 * The layout the tests of the editor seed on the dock.
 *
 * @remarks
 * It is the **old `Editor` preset** (the one before 2026-11-21): the plan and the group inspector on the left, the
 * camera row and the walkable view in the middle, and the numbers, the polygon inspector, the history and the selection
 * inspector on the right. The factory `Editor` preset changed to the owner's plate (the three small views, the walkable
 * view alone, the settings and the groups), and most tests read the numbers and the selection from the dock: they seed
 * this tree instead, so they do not depend on the arrangement the owner arranges for himself.
 *
 * The tree is written out here, not imported: a factory preset may change with a plate, and a test that needs the
 * statistics must not follow it.
 */
export const testLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(360), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(260), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.groupInspector },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(50), auto(1)],
      children: [
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [auto(1), fixed(200)],
          children: [
            { type: 'widget', kind: WIDGET_KINDS.cameraControls },
            { type: 'widget', kind: WIDGET_KINDS.jumpToLocation },
          ],
        },
        { type: 'widget', kind: WIDGET_KINDS.view3d },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(200), fixed(180), fixed(60), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.polygonInspector },
        { type: 'widget', kind: WIDGET_KINDS.undoRedo },
        { type: 'widget', kind: WIDGET_KINDS.selectionInspector },
      ],
    },
  ],
}
