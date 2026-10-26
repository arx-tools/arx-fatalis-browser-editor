import type { KeyComboInput, KeyboardMode } from './functions.ts'

/**
 * Every function of the page which can be reached with a keyboard.
 *
 * @remarks
 * - the id is stable: the bindings and the settings panel are keyed by it
 * - an action **without** a handler is a `hold` action (the movement), it is read through
 * `isKeyboardActionActive`
 */
export type KeyboardActionId =
  | 'clearSelection'
  | 'closeDialog'
  | 'deleteSelectedPolygons'
  | 'moveBackward'
  | 'moveForward'
  | 'moveLeft'
  | 'moveRight'
  | 'moveSlower'
  | 'openCameraDialog'
  | 'toggleAnchors'
  | 'toggleCameraInfo'
  | 'toggleCameraLight'
  | 'toggleDebugPanel'
  | 'toggleLights'
  | 'toggleMesh'
  | 'togglePortals'
  | 'toggleWireframe'
  | 'unlockPointer'

/**
 * The group an action belongs to in the help panel.
 */
export type KeyboardGroup = 'camera' | 'developer' | 'movement' | 'overlay' | 'selection' | 'view'

/**
 * One row of the action table: what it is called, where it lives and which combos fire it.
 *
 * @remarks
 * - `modes` is the list of modes the action is allowed in; omitted means every mode except `typing`
 * - `hold` actions are the ones the render loop reads (the movement): they have no handler
 * - the table holds no implementation: the handlers are registered at startup, so this file stays
 * pure data (and the tests can read it without a browser)
 */
export type KeyboardAction = {
  id: KeyboardActionId
  label: string
  group: KeyboardGroup
  keys: KeyComboInput[]
  modes?: KeyboardMode[]
  hold?: boolean
}

/**
 * The action table: every page function, with or without a hotkey.
 *
 * @remarks
 * - the movement and the Escape key only work while the pointer is locked (the scene has the mouse)
 * - the toggles work in the scene and in the plain editor, but not while typing or while a dialog is
 * open, so a hotkey can not disturb the input of a dialog
 * - `toggleCameraInfo` has no key on purpose: it is listed so a settings panel can offer one
 * - `Escape` is the browser's own key while the pointer is locked (Firefox does not even deliver the
 * `keydown`), which is why the selection has its own `C` key. `closeDialog` uses `Escape` in the
 * dialog mode, where the pointer is not locked.
 */
export const keyboardActions: readonly KeyboardAction[] = [
  {
    id: 'toggleMesh',
    label: 'Toggle the mesh',
    group: 'view',
    keys: [{ code: 'KeyM' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleWireframe',
    label: 'Toggle the wireframe',
    group: 'view',
    keys: [{ code: 'KeyX' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleCameraLight',
    label: 'Toggle the camera light',
    group: 'view',
    keys: [{ code: 'KeyF' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleCameraInfo',
    label: 'Toggle the camera info',
    group: 'view',
    keys: [],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleAnchors',
    label: 'Toggle the anchors',
    group: 'overlay',
    keys: [{ code: 'KeyJ' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'togglePortals',
    label: 'Toggle the portals',
    group: 'overlay',
    keys: [{ code: 'KeyK' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleLights',
    label: 'Toggle the lights',
    group: 'overlay',
    keys: [{ code: 'KeyL' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'toggleDebugPanel',
    label: 'Toggle the debug panel',
    group: 'developer',
    keys: [{ code: 'F2' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'clearSelection',
    label: 'Clear the selection',
    group: 'selection',
    keys: [{ code: 'KeyC' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'deleteSelectedPolygons',
    label: 'Delete the selected polygons',
    group: 'selection',
    keys: [{ code: 'Delete' }],
    modes: ['editor', 'pointerLocked'],
  },
  {
    id: 'openCameraDialog',
    label: 'Open the camera dialog',
    group: 'camera',
    keys: [],
    modes: ['editor'],
  },
  {
    id: 'unlockPointer',
    label: 'Leave the scene',
    group: 'camera',
    keys: [{ code: 'Escape' }],
    modes: ['pointerLocked'],
  },
  {
    id: 'closeDialog',
    label: 'Close the dialog',
    group: 'camera',
    keys: [{ code: 'Escape' }],
    modes: ['dialog', 'typing'],
  },
  {
    id: 'moveForward',
    label: 'Move forward',
    group: 'movement',
    keys: [{ code: 'KeyW' }, { code: 'ArrowUp' }],
    modes: ['pointerLocked'],
    hold: true,
  },
  {
    id: 'moveBackward',
    label: 'Move backward',
    group: 'movement',
    keys: [{ code: 'KeyS' }, { code: 'ArrowDown' }],
    modes: ['pointerLocked'],
    hold: true,
  },
  {
    id: 'moveLeft',
    label: 'Move left',
    group: 'movement',
    keys: [{ code: 'KeyA' }, { code: 'ArrowLeft' }],
    modes: ['pointerLocked'],
    hold: true,
  },
  {
    id: 'moveRight',
    label: 'Move right',
    group: 'movement',
    keys: [{ code: 'KeyD' }, { code: 'ArrowRight' }],
    modes: ['pointerLocked'],
    hold: true,
  },
  {
    id: 'moveSlower',
    label: 'Move slower',
    group: 'movement',
    keys: [{ code: 'ShiftLeft' }, { code: 'ShiftRight' }],
    modes: ['pointerLocked'],
    hold: true,
  },
]
