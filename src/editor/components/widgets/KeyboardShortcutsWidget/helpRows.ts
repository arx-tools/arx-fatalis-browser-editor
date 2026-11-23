import { isMacKeyboard } from '../../../modules/keyboard/keyboard.ts'
import type { KeyboardActionId } from '../../../modules/keyboard/actions.ts'
import { history } from '../../../modules/history/history.ts'
import { resetHistorySteps } from '../../../modules/level/edit/editing.ts'
import { isViewAtDefault, resetViewSwitches, type ViewSwitch } from '../shared/levelDisplay.ts'
import type { EditModeSwitch } from '../shared/editModes.ts'

/**
 * One cell of the key column: a key cap with a text, or one with an icon of the library.
 */
export type HelpKey =
  { readonly kind: 'icon'; readonly icon: 'command' | 'mouse-left' } | { readonly kind: 'text'; readonly text: string }

/**
 * A switch the help can flip from its row.
 */
export type HelpToggle = ViewSwitch | EditModeSwitch

/**
 * One row of the key help: the keys of an action, what they do, and the switch behind it.
 *
 * @remarks
 * A row that stands for an action of the keyboard table names it in `actionId`, and its keys are read from the
 * **bindings** (so a rebound key shows up here, and the list can not drift from the keys the editor answers): the
 * hand-written `keys` are for the gestures that no action covers (the mouse, the Shift of the snapping).
 */
export type HelpRow = {
  /**
   * The keys of a gesture, in the order of the press: the cells are joined with a plus sign.
   */
  readonly keys?: readonly HelpKey[]
  /**
   * The action whose keys the row shows: its parts come from the bindings, one cap each.
   */
  readonly actionId?: KeyboardActionId
  /**
   * What the keys do.
   */
  readonly action: string
  /**
   * How the gesture is repeated, if it is: the double click shows it as `× 2` after the key.
   */
  readonly suffix?: string
  /**
   * The switch the row carries: the eye of the row flips it.
   */
  readonly toggle?: HelpToggle
  /**
   * The switch the row sits under: a row under a switch that is off is grayed out, and its eye is disabled.
   */
  readonly parent?: HelpToggle
  /**
   * The history command the row runs, if it has one: the row then shows an undo or a redo button.
   *
   * @remarks
   * The button is disabled when the step it would take is not there (the beginning or the end of the history), so
   * the widget shows what can be done, the same way the eye of the view rows shows what is on.
   */
  readonly button?: 'redo' | 'undo'
}

/**
 * The reset button of a section: what it is called, when it can be pressed, and what it does.
 */
export type HelpReset = {
  /**
   * The tooltip and the screen reader name of the button.
   */
  readonly title: string
  /**
   * Whether the button is disabled: there is nothing to reset.
   */
  readonly disabled: () => boolean
  /**
   * The reset itself.
   */
  readonly run: () => void
}

/**
 * One section of the key help.
 */
export type HelpSection = {
  /**
   * The name of the section, shown above its rows.
   */
  readonly title: string
  /**
   * The rows of the section.
   */
  readonly rows: readonly HelpRow[]
  /**
   * The reset of the section, when its header carries a button for it.
   */
  readonly reset?: HelpReset
}

/**
 * The words the buttons use for the switches of the rows.
 */
export const switchNames: Record<HelpToggle, string> = {
  mesh: 'the mesh',
  wireframe: 'the wireframe',
  roomColors: 'the rooms',
  portals: 'the portals',
  lights: 'the lights',
  entities: 'the entities',
  transform: 'the transform gizmo',
  rotate: 'the rotate gizmo',
  scale: 'the scale gizmo',
}

/**
 * The left button of the mouse, as the icon the library draws.
 */
const leftButton: HelpKey = { kind: 'icon', icon: 'mouse-left' }

/**
 * The key that takes a face out of the selection: `Ctrl` everywhere, and the `Cmd` of the mac.
 *
 * @remarks
 * The editor answers to both on every platform (`selectionModeOf` reads `ctrlKey` and `metaKey`), the help
 * only shows the one the platform puts under the fingers.
 */
let deselectKey: HelpKey = { kind: 'text', text: 'Ctrl' }

if (isMacKeyboard()) {
  deselectKey = { kind: 'icon', icon: 'command' }
}

/**
 * Whether the history has nothing to take back, so its reset button is disabled.
 */
function isHistoryAtStart(): boolean {
  return !history.canUndo.value
}

/**
 * The sections of the key help, in the order they are read.
 *
 * @remarks
 * The rows of the keys the editor answers are the **actions of the keyboard table** (`actionId`), so their caps come
 * from the bindings and a new key of an action lands here without a second list (2026-11-22, the 68). The gestures the
 * table does not cover (the mouse of the selection, the `Shift` of the snapping) keep their own caps. A section title is
 * a group of the table in its own words.
 */
export const helpSections: readonly HelpSection[] = [
  {
    title: 'View context',
    reset: {
      title: 'Reset view context',
      disabled: (): boolean => {
        return isViewAtDefault.value
      },
      run: resetViewSwitches,
    },
    // the action is the name of the switch with a capital (2026-11-12, the owner): Wireframe, Mesh, Rooms, Portals
    rows: [
      { actionId: 'toggleWireframe', action: 'Wireframe', toggle: 'wireframe' },
      { actionId: 'toggleMesh', action: 'Mesh', toggle: 'mesh' },
      { actionId: 'toggleRooms', action: 'Rooms', toggle: 'roomColors', parent: 'mesh' },
      { actionId: 'togglePortals', action: 'Portals', toggle: 'portals', parent: 'mesh' },
      { actionId: 'toggleLights', action: 'Lights', toggle: 'lights' },
      // the entities of the level: the door of level 0 is the first one the editor draws (TODO 239)
      { actionId: 'toggleEntities', action: 'Entities', toggle: 'entities' },
    ],
  },
  {
    title: 'Edit modes',
    // the eye of a row is the switch of the mode, as in the view context, and the two modes are exclusive (the
    // store keeps them apart, so the eyes can not show both on)
    rows: [
      { actionId: 'toggleTransform', action: 'Transform', toggle: 'transform' },
      { actionId: 'toggleRotate', action: 'Rotate', toggle: 'rotate' },
      { actionId: 'toggleScale', action: 'Scale', toggle: 'scale' },
      // the temporary switch of the snapping: Shift turns it on for the length of a drag, the magnet is the same
      // switch (2026-11-21, the owner)
      { keys: [{ kind: 'text', text: 'Shift' }], action: 'Snapping' },
    ],
  },
  {
    title: 'Movement',
    // the walk of the scene: the same keys the game has, held down while the pointer is locked
    rows: [
      { actionId: 'moveForward', action: 'Move forward' },
      { actionId: 'moveBackward', action: 'Move backward' },
      { actionId: 'moveLeft', action: 'Move left' },
      { actionId: 'moveRight', action: 'Move right' },
      { actionId: 'moveSlower', action: 'Move slower' },
    ],
  },
  {
    title: 'Camera',
    // the two ways out: the pointer lock (the scene) and a dialog
    rows: [
      { actionId: 'unlockPointer', action: 'Leave the scene' },
      { actionId: 'closeDialog', action: 'Close the dialog' },
    ],
  },
  {
    title: 'History',
    reset: { title: 'Take every step back', disabled: isHistoryAtStart, run: resetHistorySteps },
    rows: [
      { actionId: 'undo', action: 'Undo', button: 'undo' },
      { actionId: 'redo', action: 'Redo', button: 'redo' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: [leftButton], action: 'Select face(s)' },
      { keys: [leftButton], suffix: '× 2', action: 'Fill select by view context' },
      { keys: [{ kind: 'text', text: 'Shift' }, leftButton], action: 'Add to selection' },
      { keys: [deselectKey, leftButton], action: 'Remove from selection' },
      { actionId: 'clearSelection', action: 'Clear selection' },
      // the copy and the paste of the faces: `primary` is Ctrl everywhere and the Cmd of the mac (the row above the
      // delete, the order of the keyboard section of the ticket)
      { actionId: 'copySelection', action: 'Copy face(s)' },
      { actionId: 'pasteSelection', action: 'Paste face(s)' },
      { actionId: 'deleteSelectedPolygons', action: 'Delete face(s), room(s) or group(s)' },
      // the two steps of the selection: the camera goes to a face of it, so a face no view shows can be found
      // (2026-11-22, the owner)
      { actionId: 'stepPreviousFace', action: 'Previous face of the selection' },
      { actionId: 'stepNextFace', action: 'Next face of the selection' },
    ],
  },
  {
    // the section of the keys that belong to none of the others (2026-11-14, the owner). The row of the popup is here,
    // so a layout without the widget still shows the list, and the dialog says how it opens
    title: 'Miscellaneous',
    rows: [
      { actionId: 'toggleHelp', action: 'Show keyboard shortcuts popup' },
      { actionId: 'createFaceGroup', action: 'Group the selected faces' },
    ],
  },
  {
    // the last section: the five factory presets on the function keys, in the order the Presets menu shows them (a
    // list, not a sorted one), and the blank layout has no key of its own (2026-11-22, the owner)
    title: 'Layout presets',
    rows: [
      { actionId: 'presetViewer', action: 'Viewer' },
      { actionId: 'presetEditor', action: 'Editor' },
      { actionId: 'presetPainter', action: 'Painter' },
      { actionId: 'presetRooms', action: 'Rooms' },
      { actionId: 'presetLighter', action: 'Lighter' },
      { actionId: 'presetEntities', action: 'Entities' },
    ],
  },
]
