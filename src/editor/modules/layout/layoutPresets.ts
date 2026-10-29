import type { LayoutNode } from './layoutNode.ts'
import { WIDGET_KINDS } from './widgetKinds.ts'

/**
 * The identifier of a preset of the dock layout.
 *
 * @remarks
 * `custom` is not a constant: it is the slot the editor stores the last layout that is not a factory one
 * in, so the header can offer it back next to the factory presets.
 */
export type PresetId = 'advanced' | 'custom' | 'default'

/**
 * One factory preset of the layout.
 */
export interface FactoryPreset {
  /**
   * The identifier the header selects it by.
   */
  readonly id: Exclude<PresetId, 'custom'>
  /**
   * The name shown in the dropdown of the header.
   */
  readonly label: string
  /**
   * The tree the preset puts on the dock.
   */
  readonly layout: LayoutNode
}

/**
 * The layout the editor starts with.
 *
 * @remarks
 * - the 3D view takes 70% of the width: it is the working surface, and it wants the room
 * - the statistics sit above the help on the right 30%
 * - the camera is **not** part of it: it is the free kind of the picker, and a kind that is not in the
 * tree is simply not on the dock
 */
export const defaultLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [0.7, 0.3],
  children: [
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.controls },
      ],
    },
  ],
}

/**
 * The height the thin row of {@link advancedLayout} needs, in pixels.
 *
 * @remarks
 * The row holds the camera form and the jump: 44px of content (a 10px caption, the 24px fields and 4px of
 * padding on both sides). 50px leaves a little air around it, the rest of the column goes to the 3D view.
 */
const THIN_ROW_HEIGHT = 50

/**
 * The share of the middle column that gives {@link THIN_ROW_HEIGHT} in the dock of the window the layout
 * was tuned on (850px tall: the dock is 814px, and the splitter is not part of the shares).
 *
 * @remarks
 * A lumino split is proportional: it stores shares, not pixels, so the row scales with the window (47px
 * on a 800px tall window, 53px on 900). It can not be a fixed pixel height: the layout would then stop
 * matching the preset on every window size, and the header would offer it as a `Custom` one.
 */
const THIN_ROW_SHARE = THIN_ROW_HEIGHT / 814

/**
 * The layout for the level work: the small views on the left, the walkable view in the middle with the
 * camera under it, and the numbers on the right.
 *
 * @remarks
 * - the left 20% is a column of three small views: the plan and the two elevations
 * - the middle 60% is the walkable view, with a thin row above it: the camera form and the jump of the
 * location widget (the two one row widgets, so the row stays thin — {@link THIN_ROW_HEIGHT})
 * - the right 20% holds the statistics above the keyboard shortcuts
 */
export const advancedLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [0.2, 0.6, 0.2],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [1 / 3, 1 / 3, 1 / 3],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.leftView },
        { type: 'widget', kind: WIDGET_KINDS.frontView },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [THIN_ROW_SHARE, 1 - THIN_ROW_SHARE],
      children: [
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [0.6, 0.4],
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
      sizes: [0.5, 0.5],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.controls },
      ],
    },
  ],
}

/**
 * The presets the header offers, in the order of the dropdown.
 */
export const factoryPresets: readonly FactoryPreset[] = [
  { id: 'default', label: 'Default', layout: defaultLayout },
  { id: 'advanced', label: 'Advanced', layout: advancedLayout },
]

/**
 * The name of the slot the editor stores the last modified layout in.
 */
export const CUSTOM_PRESET_LABEL = 'Custom'

/**
 * Finds a factory preset by its identifier.
 *
 * @param id The identifier to look up.
 *
 * @returns The preset, or `undefined` when the identifier is the custom slot or unknown.
 */
export function factoryPreset(id: string): FactoryPreset | undefined {
  return factoryPresets.find((preset) => {
    return preset.id === id
  })
}
