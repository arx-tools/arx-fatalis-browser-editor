/**
 * The kinds of the widgets the shell can put on the dock.
 *
 * @remarks
 * A kind is a stable identifier, and it is used in four places at once: the key of the saved layout, the
 * `data-widget-kind` attribute of the widget node (the stylesheet hangs the per widget sizes on it), the
 * `data-picker-kind` attribute of the picker row, and the widget itself when it says that it is there
 * ({@link ../layout/widgetPresence.ts}). So the names are written here once, and the name says what the
 * widget is (`camera-controls`, not `camera`).
 *
 * The kinds were renamed on 2026-10-28, and again on 2026-10-31 (`controls` became `keyboard-shortcuts`, so the
 * name of the kind is the name of the widget). A layout that was saved under the old names is **not** migrated:
 * its kinds are unknown, so they drop out and the default layout takes over (the editor is not 1.0.0 yet,
 * a stale localStorage value does not have to be kept alive).
 */
export const WIDGET_KINDS = {
  /**
   * The walkable 3D view.
   */
  view3d: '3d-view',
  /**
   * The fixed view from above.
   */
  topView: 'top-view',
  /**
   * The fixed view from below.
   */
  bottomView: 'bottom-view',
  /**
   * The fixed view from the front.
   */
  frontView: 'front-view',
  /**
   * The fixed view from behind.
   */
  backView: 'back-view',
  /**
   * The fixed view from the left.
   */
  leftView: 'left-view',
  /**
   * The fixed view from the right.
   */
  rightView: 'right-view',
  /**
   * The camera form: the pose of the walkable view.
   */
  cameraControls: 'camera-controls',
  /**
   * The points the camera can jump to.
   */
  jumpToLocation: 'jump-to-location',
  /**
   * The numbers of the loaded level.
   */
  mapStatistics: 'map-statistics',
  /**
   * The face under the crosshair of the walkable view.
   */
  polygonInspector: 'polygon-inspector',
  /**
   * The rooms of the level: the list, the one the player stands in, and the problems.
   */
  areas: 'areas',
  /**
   * The textures a face can be painted with.
   */
  textures: 'textures',
  /**
   * The faces of the selection, and the textures they draw with.
   */
  selectionInspector: 'selection-inspector',
  /**
   * The uv of the selected face, on the texture.
   */
  uvMapper: 'uv-mapper',
  /**
   * The two steps of the history: undo and redo, next to each other.
   */
  undoRedo: 'undo-redo',
  /**
   * The key table of the editor.
   */
  keyboardShortcuts: 'keyboard-shortcuts',
  /**
   * The frame rate and the cost of a frame of the walkable view.
   */
  renderPerformance: 'render-performance',
} as const
