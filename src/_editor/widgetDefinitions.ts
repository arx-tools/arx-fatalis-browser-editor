import type { Widget } from '@lumino/widgets'
import HelpWidget from './components/widgets/HelpWidget.vue'
import StatisticsWidget from './components/widgets/StatisticsWidget.vue'
import View3DWidget from './components/widgets/View3DWidget.vue'
import { VueWidget } from './modules/vueWidget/VueWidget.ts'
import type { WidgetDefinition } from './modules/layout/widgetDefinition.ts'

/**
 * The widget kinds of the shell.
 *
 * A kind exists at most once on the dock (the picker marks the placed kinds instead of letting them
 * be dragged in twice), so the `kind` is a stable identifier of both the widget and its place in the
 * saved layout.
 *
 * The contents are placeholders for now: the real statistics, the key help and the 3D renderer are
 * ported from the archived app in later rounds.
 */
export const widgetDefinitions: readonly WidgetDefinition[] = [
  {
    kind: 'view3d',
    label: '3D View',
    create: (): Widget => {
      return new VueWidget(View3DWidget)
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
