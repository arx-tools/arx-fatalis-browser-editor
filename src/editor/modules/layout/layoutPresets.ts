import { emptyLayout, type ChildSize, type LayoutNode } from './layoutNode.ts'
import { WIDGET_KINDS } from './widgetKinds.ts'

/**
 * The identifier of a preset of the dock layout.
 */
export type PresetId = 'custom' | 'editor' | 'entities' | 'lighter' | 'painter' | 'rooms' | 'viewer'

/**
 * One factory preset of the layout.
 */
export type FactoryPreset = {
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
 * The height of the row of the undo and redo buttons, in pixels.
 *
 * @remarks
 * The buttons are 22 px high with 8 px of padding around them, and the owner asked for a **locked** 60 px row: under
 * the uv mapper in the `Painter` (2026-11-06), and under the polygon inspector in the `Editor` (2026-11-09), so the two
 * steps of the history are a click away from the work.
 */
const UNDO_ROW_HEIGHT = 60

/**
 * The height of the undo and redo row of the `Editor` preset, in pixels.
 *
 * @remarks
 * The owner's plate (2026-11-21): the row under the group inspector, 350 wide and 50 high, with the two steps of the
 * history a click away from the settings.
 */
const EDITOR_UNDO_ROW_HEIGHT = 50

/**
 * The height of the Translate Snapping Settings widget of the `Editor` preset, in pixels.
 *
 * @remarks
 * The owner's plate (2026-11-21): the settings row is 350 by 170, the master switch and the three snap types with
 * enough air for the power buttons and the threshold (the widget's old name was Edit Settings).
 */
const EDIT_SETTINGS_HEIGHT = 170

/**
 * The height of the plan view of the `Editor` preset, in pixels.
 *
 * @remarks
 * The owner's plate (2026-11-21): the plan is 350 by 300, and the two elevations take the rest of the column under it.
 */
const EDITOR_TOP_VIEW_HEIGHT = 300

/**
 * The height of the lighting controls of the `Lighter` preset, in pixels.
 *
 * @remarks
 * The widget has three rows: the profile, the luminosity (the flat and the rainbow profiles have one of their own) and
 * the switch of the dynamic layer; the static one is only there for the profiles that read the lights. The rows are one
 * line each (a 10px caption and the control beside it), with four pixels between them. The owner measured the box of the
 * preset at 130 (2026-11-22): the rows sit in the middle of it with air around them, and the widget does not scroll
 * under its lock.
 */
const LIGHTING_CONTROLS_HEIGHT = 130

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
 * The layout for the level work: the three small views on the left, the walkable view in the middle and the settings
 * and the groups on the right.
 *
 * @remarks
 * The owner arranged this one in the editor (2026-11-21, the plate of the layout): the left column is locked to 350
 * wide, and the plan to 300 high, with the left and front elevations sharing the rest under it. The middle column is
 * the **walkable view alone**: the camera form is not in this layout (the pose of the view is on its HUD), so no
 * widget of the middle is locked and it takes what the two columns leave. The right column is locked to 350 wide:
 * the undo and redo row to 50 and the **Edit Settings** to 120, and the group inspector takes what the two locks
 * leave.
 *
 * The locks are the sizes the owner read off the badge of the plate in the edit mode (2026-11-01, and the plate of
 * 2026-11-21 for this arrangement).
 */
export const editorLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(EDITOR_TOP_VIEW_HEIGHT), auto(0.5), auto(0.5)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.leftView },
        { type: 'widget', kind: WIDGET_KINDS.frontView },
      ],
    },
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(EDITOR_UNDO_ROW_HEIGHT), fixed(EDIT_SETTINGS_HEIGHT), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.undoRedo },
        { type: 'widget', kind: WIDGET_KINDS.editSettings },
        { type: 'widget', kind: WIDGET_KINDS.groupInspector },
      ],
    },
  ],
}

/**
 * The layout of the light work: the editor's, with the lighting controls in the place of the polygon inspector.
 *
 * @remarks
 * The walkable view is the surface the light is judged on, so the layout keeps the editor's frame (the three fixed views
 * on the left, the camera row and the view in the middle) and the right column is the light work, top down: the undo
 * and redo row, the **Global Lighting Controls**, and the **Light Inspector** below them (2026-11-17, the owner). The two rows
 * are 350 by 60, and the light inspector takes what is left. The statistics left the column with the round: the light
 * work reads the lights, not the counts of the level.
 */
export const lighterLayout: LayoutNode = {
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
      sizes: [fixed(UNDO_ROW_HEIGHT), fixed(LIGHTING_CONTROLS_HEIGHT), auto(1), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.undoRedo },
        { type: 'widget', kind: WIDGET_KINDS.lightingControls },
        { type: 'widget', kind: WIDGET_KINDS.lightEditor },
        { type: 'widget', kind: WIDGET_KINDS.lightInspector },
      ],
    },
  ],
}

/**
 * The layout for looking at a level: the keys on the left, the walkable view in the middle and the plan, the jump and
 * the numbers of the renderer in the right column.
 *
 * @remarks
 * - the keys take the **left** column, locked to 350 wide and the whole height of the dock (2026-11-15, the owner): they
 * are the reference of the reader, so they sit beside the view at every row, not under a column of widgets
 * - the middle column is the walkable view, the whole height of the dock: this layout is not for editing, it is for
 * walking around and reading the number under the crosshair
 * - the right column is locked to 350 wide, the same as the left one (2026-11-22, the owner): the plan to 403 high, the
 * jump to 70, and the numbers of the renderer take what the two locks leave
 *
 * The locks are the sizes the owner read off the badge of the plate (2026-11-01).
 */
export const viewerLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    { type: 'widget', kind: WIDGET_KINDS.keyboardShortcuts },
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(403), fixed(70), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.jumpToLocation },
        { type: 'widget', kind: WIDGET_KINDS.renderPerformance },
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
 * with the uv mapper above it — and the left column has the two inspectors. The numbers are the sizes he read off the
 * plates of the edit mode: the polygon inspector 185 high and the uv mapper 430; both columns are 350 wide
 * (2026-11-22, the owner).
 * The **keys left the preset** (2026-11-16, the owner): the selection inspector takes the full height under the polygon
 * inspector, which is the list the painter works from. The **undo and redo** row under the uv mapper is his later request
 * (2026-11-06): a locked 60 px strip, so the two steps of the history are a click away from the texture work. The
 * painters do not need the six fixed views, and the middle column is the **walkable view alone**: the camera form is not
 * in this layout (the pose of the view is on its HUD), so no widget of the middle is locked and it takes what the two
 * columns leave.
 */
export const painterLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(185), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.polygonInspector },
        { type: 'widget', kind: WIDGET_KINDS.selectionInspector },
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
 * The layout of the room work: the statistics, the walkable view and the rooms.
 *
 * @remarks
 * The owner measured the layout of the round (2026-11-13): the statistics at **200** high and the selection inspector
 * under it on the left, the walkable view in the middle, and the top view at **260** on the right; both columns are
 * **350** wide (2026-11-22, the owner). The undo and
 * redo row takes its **60** there (2026-11-17, the owner: the steps of the work under the plan), and the room inspector
 * takes what the two locks leave. The walkable view's own readout carries the camera (the camera controls widget is not
 * on this layout), and the room map is the surface the round works on.
 *
 * The `Rooms` name is what the header shows (2026-11-07, the owner). The **Selection Inspector** stays under the
 * numbers (2026-11-10): the fill of the selection paints the faces turned towards the camera only, so a fill that takes
 * a whole room also takes the faces behind the camera, and the count of the widget is what says how much came along.
 */
export const roomsLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [fixed(350), auto(1), fixed(350)],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(200), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.selectionInspector },
      ],
    },
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [fixed(260), fixed(UNDO_ROW_HEIGHT), auto(1)],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.topView },
        { type: 'widget', kind: WIDGET_KINDS.undoRedo },
        { type: 'widget', kind: WIDGET_KINDS.roomInspector },
      ],
    },
  ],
}

/**
 * The layout of the entity work: the rooms preset, copied.
 *
 * @remarks
 * The owner asked for a copy (2026-11-22): the entity work starts from the frame of the room work (the statistics and
 * the selection inspector on the left, the walkable view in the middle, the plan and the room inspector on the right),
 * and the two may part ways later. The function keys follow the rows, so this one is `F6` and the blank layout has none.
 */
export const entitiesLayout: LayoutNode = structuredClone(roomsLayout)

/**
 * The layout the editor starts with.
 *
 * @remarks
 * It is the **`Viewer`** (2026-10-31, the owner's decision): the editor opens on the walkable view, with the keys on
 * the left and the plan beside it. The `Editor` preset — the three small views, the camera row and the numbers —
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
  { id: 'lighter', label: 'Lighter', layout: lighterLayout },
  { id: 'entities', label: 'Entities', layout: entitiesLayout },
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
