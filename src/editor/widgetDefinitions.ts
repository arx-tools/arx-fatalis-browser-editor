import type { Widget } from '@lumino/widgets'
import CameraControlsWidget from './components/widgets/CameraControlsWidget/CameraControlsWidget.vue'
import FixedViewWidget from './components/widgets/FixedViewWidget/FixedViewWidget.vue'
import HelpWidget from './components/widgets/HelpWidget/HelpWidget.vue'
import StatisticsWidget from './components/widgets/StatisticsWidget/StatisticsWidget.vue'
import View3DWidget from './components/widgets/View3DWidget/View3DWidget.vue'
import type { CameraViewMode } from './components/widgets/FixedViewWidget/cameraAlign.ts'
import { VueWidget } from './modules/vueWidget/VueWidget.ts'
import type { WidgetDefinition } from './modules/layout/widgetDefinition.ts'

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
  { kind: 'view-top', label: 'Top view', mode: 'top' },
  { kind: 'view-bottom', label: 'Bottom view', mode: 'bottom' },
  { kind: 'view-front', label: 'Front view', mode: 'front' },
  { kind: 'view-back', label: 'Back view', mode: 'back' },
  { kind: 'view-left', label: 'Left view', mode: 'left' },
  { kind: 'view-right', label: 'Right view', mode: 'right' },
]

/**
 * The widget kinds of the shell.
 *
 * A kind exists at most once on the dock (the picker marks the placed kinds instead of letting them
 * be dragged in twice), so the `kind` is a stable identifier of both the widget and its place in the
 * saved layout.
 *
 * The statistics and the help are placeholders for now: the real numbers and the key table come with
 * the later rounds.
 */
export const widgetDefinitions: readonly WidgetDefinition[] = [
  {
    kind: 'view3d',
    label: '3D View',
    create: (): Widget => {
      return new VueWidget(View3DWidget)
    },
  },
  ...fixedViews.map((view) => {
    return {
      kind: view.kind,
      label: view.label,
      create: (): Widget => {
        return new VueWidget(FixedViewWidget, { mode: view.mode })
      },
    }
  }),
  {
    kind: 'camera',
    label: 'Camera',
    create: (): Widget => {
      return new VueWidget(CameraControlsWidget)
    },
  },
  {
    kind: 'statistics',
    label: 'Statistics',
    create: (): Widget => {
      return new VueWidget(StatisticsWidget)
    },
  },
  {
    kind: 'help',
    label: 'Help',
    create: (): Widget => {
      return new VueWidget(HelpWidget)
    },
  },
]
