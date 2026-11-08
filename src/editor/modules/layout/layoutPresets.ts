import { emptyLayout, type ChildSize, type LayoutNode } from './layoutNode.ts'
import { WIDGET_KINDS } from './widgetKinds.ts'

/**
 * The identifier of a preset of the dock layout.
 */
export type PresetId = 'custom' | 'editor' | 'painter' | 'rooms' | 'viewer'

/**
 * One factory preset of the layout.
 */
export interface FactoryPreset {
  /**
   * The identifier the header selects it by.
   */
  readonly id: PresetId
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
 * The height of the thin row of {@link editorLayout}, in pixels.
 *
 * @remarks
 * The row holds the camera form and the jump: 44px of content (a 10px caption, the 24px fields and 4px of
 * padding on both sides). 50px leaves a little air around it, and the row is **locked** to it through the lock of
 * the jump (the height of a widget in a row is the height of the row).
 */
const THIN_ROW_HEIGHT = 50

/**
 * The height of the row of the undo and redo buttons in the `Painter`, in pixels.
 *
 * @remarks
 * The buttons are 22 px high with 8 px of padding around them, and the owner asked for a **locked** 60 px row under the
 * uv mapper (2026-11-06): the two steps of the history are a click away from the texture work, and the texture list
 * below them takes what is left.
 */
const UNDO_ROW_HEIGHT = 60

/**
 * A child of a split that follows the layout, as a share of the space the locks leave.
 *
 * @remarks
 * The ratio is the share of the space the locks leave, and the free children of a split share it between themselves:
 * the tree the dock is read back from normalizes them to **one**, so a preset writes them that way too, or the header
 * would take the preset for a modified layout (`layoutEquals`).
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
 * @remarks
 * The size is the **lock** of the widget, and it is not one number but the axis of the split it sits in: a child of a
 * horizontal split is locked to a width, a child of a vertical one to a height. A widget locked to a box therefore has
 * a `fixed` size on **two** levels of the tree — the width on the horizontal split and the height on the vertical one —
 * and the pass reads the two sides back as one box (`applyLocks`). The presets below are spelled out with both, so a
 * widget comes back locked where the owner measured it (the sizes on the badge of the plate, 2026-11-01).
 *
 * @param px The size along the axis of the split.
 *
 * @returns The size spec of a locked child.
 */
function fixed(px: number): ChildSize {
  return { kind: 'fixed', px }
}

/**
 * The layout for the level work: the small views on the left, the walkable view in the middle with the
 * camera above it, and the numbers on the right.
 *
 * @remarks
 * The left column is locked to 350 wide, and its first view (the plan) to 350 high: the two elevations under it share
 * the rest. The middle column holds the thin row above the walkable view, with the jump of the row locked to 200 wide
 * and the row to 50 high, so the camera form takes the rest of the row. The right column is locked to 350 wide, the
 * statistics to 210 and the inspector to 190 high, and the keyboard shortcuts take what is left.
 *
 * The locks are the sizes the owner read off the badge of the plate in the edit mode (2026-11-01): they are the
 * widgets he wants where he put them, and the rest of the layout stays flexible around them. The jump was 290 wide in
 * the first round and the owner took it down to 200 the same day.
 */
export const editorLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(350), auto(0.5), auto(0.5)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.leftView },
        { type: 'widget', kind: WIDGET_KINDS.frontView },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(THIN_ROW_HEIGHT), auto(1)],
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
      sizes: [fixed(210), fixed(190), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.polygonInspector },
        { type: 'widget', kind: WIDGET_KINDS.keyboardShortcuts },
      ],
    },
  ],
}

/**
 * The layout for looking at a level: the walkable view with a plan and the keys beside it.
 *
 * @remarks
 * - the left 70% is the walkable view, the whole height of the dock: this layout is not for editing, it is
 * for walking around and reading the number under the crosshair
 * - the right column is locked to 350 wide (the plan and the jump), the plan to 285 high, the jump to 80 and the render
 * performance readout to 210 (2026-11-08, the owner asked for it here): the plan sits above, under it the jump, then
 * the numbers of the renderer, and the keyboard shortcuts take the rest of the column
 *
 * The locks are the sizes the owner read off the badge of the plate (2026-11-01).
 */
export const viewerLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [auto(1), fixed(350)],
  children: [
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(285), fixed(80), fixed(210), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.jumpToLocation },
        { type: 'widget', kind: WIDGET_KINDS.renderPerformance },
        { type: 'widget', kind: WIDGET_KINDS.keyboardShortcuts },
      ],
    },
  ],
}

/**
 * The layout of the texture work: the two inspectors on the left, the walkable view in the middle, and the uv mapper,
 * the steps of the history and the texture list on the right.
 *
 * @remarks
 * The owner arranged this one in the editor (2026-11-04): the column of the work is the **right** one — the texture list
 * with the uv mapper above it — and the left column has the two inspectors and the keys. The numbers are the sizes he
 * read off the plates of the edit mode: the polygon inspector 360 x 185, the keys 360 x 430 (which is the width of the
 * left column too) and the uv mapper 400 x 430 (the width of the right column). The **undo and redo** row under the uv
 * mapper is his later request (2026-11-06): a locked 60 px strip, so the two steps of the history are a click away from
 * the texture work. The painters do not need the six fixed
 * views, and the middle column is the **walkable view alone**: the camera form is not in this layout (the pose of the
 * view is on its HUD), so no widget of the middle is locked and it takes what the two columns leave.
 */
export const painterLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(360), auto(1), fixed(400)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(185), auto(1), fixed(430)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.polygonInspector },
        { type: 'widget', kind: WIDGET_KINDS.selectionInspector },
        { type: 'widget', kind: WIDGET_KINDS.keyboardShortcuts },
      ],
    },
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(430), fixed(UNDO_ROW_HEIGHT), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.uvMapper },
        { type: 'widget', kind: WIDGET_KINDS.undoRedo },
        { type: 'widget', kind: WIDGET_KINDS.textures },
      ],
    },
  ],
}

/**
 * The layout of the room work: the plan views, the walkable view and the areas beside them.
 *
 * @remarks
 * It is the `Editor` preset with the **Areas** panel where the inspector and the keys are: the level work is reading
 * the rooms of a level (the list, the room under the crosshair, the problems), and the split of the level is decided
 * here. The `Rooms` name is what the header shows (2026-11-07, the owner).
 */
export const roomsLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(350), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.frontView },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(THIN_ROW_HEIGHT), auto(1)],
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
      sizes: [fixed(210), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.areas },
      ],
    },
  ],
}

/**
 * The layout the editor starts with.
 *
 * @remarks
 * It is the **`Viewer`** (2026-10-31, the owner's decision): the editor opens on the walkable view, with the
 * plan and the keys beside it. The `Editor` preset — the three small views, the camera row and the numbers —
 * is one click away in the dropdown of the header.
 */
export const defaultLayout: LayoutNode = viewerLayout

/**
 * The layout of an empty dock: the `Blank` preset.
 *
 * @remarks
 * The owner's request (2026-11-06): a layout with **no widget at all**, so the dock starts as a bare canvas and every
 * widget of it is dragged in from the picker. The dock shows the invitation of `Dock.vue` in the middle while it is
 * empty, locked and unlocked alike.
 */
export const customLayout: LayoutNode = emptyLayout

/**
 * The presets the header offers, in the order of the dropdown.
 *
 * @remarks
 * The `Viewer` is first because it is the one the editor starts with ({@link defaultLayout}): the row of the active
 * layout is the top of the list, so the dropdown opens on the entry the header shows. The `Editor` (the layout of the
 * level work) follows it, the `Painter` (the texture work, 2026-11-04) closes the factory ones, and the `Blank`
 * ({@link customLayout}, 2026-11-06; `Custom` until the owner renamed it) is the last row: the empty dock the user
 * builds on his own. The identifier of that row stays `custom`, because it is the key the browser stores the active
 * layout and its history under.
 */
export const factoryPresets: readonly FactoryPreset[] = [
  { id: 'viewer', label: 'Viewer', layout: viewerLayout },
  { id: 'editor', label: 'Editor', layout: editorLayout },
  { id: 'painter', label: 'Painter', layout: painterLayout },
  { id: 'rooms', label: 'Rooms', layout: roomsLayout },
  { id: 'custom', label: 'Blank', layout: customLayout },
]

/**
 * Finds a factory preset by its identifier.
 *
 * @param id The identifier to look up.
 *
 * @returns The preset, or `undefined` when the identifier is unknown.
 */
export function factoryPreset(id: string): FactoryPreset | undefined {
  return factoryPresets.find((preset) => {
    return preset.id === id
  })
}
