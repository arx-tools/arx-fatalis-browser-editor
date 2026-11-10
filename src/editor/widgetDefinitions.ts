import type { Widget } from '@lumino/widgets'
import RoomInspectorWidget from './components/widgets/RoomInspectorWidget/RoomInspectorWidget.vue'
import CameraControlsWidget from './components/widgets/CameraControlsWidget/CameraControlsWidget.vue'
import FixedViewWidget from './components/widgets/FixedViewWidget/FixedViewWidget.vue'
import KeyboardShortcutsWidget from './components/widgets/KeyboardShortcutsWidget/KeyboardShortcutsWidget.vue'
import JumpToLocationWidget from './components/widgets/JumpToLocationWidget/JumpToLocationWidget.vue'
import PolygonInspectorWidget from './components/widgets/PolygonInspectorWidget/PolygonInspectorWidget.vue'
import MapStatisticsWidget from './components/widgets/MapStatisticsWidget/MapStatisticsWidget.vue'
import RenderPerformanceWidget from './components/widgets/RenderPerformanceWidget/RenderPerformanceWidget.vue'
import SelectionInspectorWidget from './components/widgets/SelectionInspectorWidget/SelectionInspectorWidget.vue'
import TextureBrowserWidget from './components/widgets/TextureBrowserWidget/TextureBrowserWidget.vue'
import UndoRedoWidget from './components/widgets/UndoRedoWidget/UndoRedoWidget.vue'
import UvMapperWidget from './components/widgets/UvMapperWidget/UvMapperWidget.vue'
import View3DWidget from './components/widgets/View3DWidget/View3DWidget.vue'
import type { CameraViewMode } from './components/widgets/FixedViewWidget/cameraAlign.ts'
import { WIDGET_KINDS } from './modules/layout/widgetKinds.ts'
import { VueWidget } from './modules/vueWidget/VueWidget.ts'
import type { WidgetDefinition, WidgetGroup } from './modules/layout/widgetDefinition.ts'

/**
 * One fixed direction of the level and the widget that shows it.
 */
interface FixedViewDefinition {
  /**
   * The kind of the widget, also its key in the saved layout.
   */
  readonly kind: string
  /**
   * The name of the widget in the picker and the overlay.
   */
  readonly label: string
  /**
   * The direction the widget shows the level from.
   */
  readonly mode: CameraViewMode
  /**
   * The category of the picker the widget goes to.
   */
  readonly group: WidgetGroup
}

/**
 * The six fixed direction views.
 *
 * @remarks
 * They are the small overviews of a level editor (the THEO Game Maker layout): a widget per direction,
 * always framed on the level, with no pointer lock and no camera fields of its own. The widget is
 * `FixedViewWidget`, the module behind it is `components/widgets/FixedViewWidget/fixedView.ts`.
 */
const fixedViews: readonly FixedViewDefinition[] = [
  { kind: WIDGET_KINDS.topView, label: 'Top View', mode: 'top', group: 'rendering' },
  { kind: WIDGET_KINDS.bottomView, label: 'Bottom View', mode: 'bottom', group: 'rendering' },
  { kind: WIDGET_KINDS.frontView, label: 'Front View', mode: 'front', group: 'rendering' },
  { kind: WIDGET_KINDS.backView, label: 'Back View', mode: 'back', group: 'rendering' },
  { kind: WIDGET_KINDS.leftView, label: 'Left View', mode: 'left', group: 'rendering' },
  { kind: WIDGET_KINDS.rightView, label: 'Right View', mode: 'right', group: 'rendering' },
]

/**
 * The widget kinds of the shell.
 *
 * A kind exists at most once on the dock (the picker marks the placed kinds instead of letting them
 * be dragged in twice), so the `kind` is a stable identifier of both the widget and its place in the
 * saved layout.
 *
 * The statistics and the controls are placeholders for now: the real numbers and the key table come with
 * the later rounds.
 */
export const widgetDefinitions: readonly WidgetDefinition[] = [
  {
    kind: WIDGET_KINDS.view3d,
    label: '3D View',
    group: 'rendering',
    create: (): Widget => {
      return new VueWidget(View3DWidget)
    },
  },
  ...fixedViews.map((view) => {
    return {
      kind: view.kind,
      label: view.label,
      group: view.group,
      create: (): Widget => {
        return new VueWidget(FixedViewWidget, { mode: view.mode })
      },
    }
  }),
  {
    kind: WIDGET_KINDS.cameraControls,
    label: 'Camera Controls',
    contentSized: true,
    group: 'controls',
    create: (): Widget => {
      return new VueWidget(CameraControlsWidget)
    },
  },
  {
    kind: WIDGET_KINDS.jumpToLocation,
    label: 'Jump to Location',
    contentSized: true,
    group: 'controls',
    create: (): Widget => {
      return new VueWidget(JumpToLocationWidget)
    },
  },
  {
    kind: WIDGET_KINDS.undoRedo,
    label: 'Undo and Redo',
    contentSized: true,
    group: 'controls',
    create: (): Widget => {
      return new VueWidget(UndoRedoWidget)
    },
  },
  {
    kind: WIDGET_KINDS.roomInspector,
    label: 'Room Inspector',
    contentSized: true,
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(RoomInspectorWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.mapStatistics,
    label: 'Map Statistics',
    contentSized: true,
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(MapStatisticsWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.polygonInspector,
    label: 'Polygon Inspector',
    contentSized: true,
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(PolygonInspectorWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.textures,
    label: 'Texture Mapper',
    group: 'controls',
    create: (label): Widget => {
      return new VueWidget(TextureBrowserWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.selectionInspector,
    label: 'Selection Inspector',
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(SelectionInspectorWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.uvMapper,
    label: 'UV Mapper',
    group: 'controls',
    create: (label): Widget => {
      return new VueWidget(UvMapperWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.keyboardShortcuts,
    label: 'Keyboard Shortcuts',
    contentSized: true,
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(KeyboardShortcutsWidget, { label })
    },
  },
  {
    kind: WIDGET_KINDS.renderPerformance,
    label: 'Render Performance',
    contentSized: true,
    group: 'info',
    create: (label): Widget => {
      return new VueWidget(RenderPerformanceWidget, { label })
    },
  },
]
