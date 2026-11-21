import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { Eye } from 'lucide-vue-next'
import ColorSwatch from './ColorSwatch.vue'
import InspectorRow from './InspectorRow.vue'
import RowActionButton from './RowActionButton.vue'

/**
 * One row of an inspector list: the group, the room and the light lists have the same row.
 */
const meta = {
  title: 'Editor/InspectorRow',
  component: InspectorRow,
  tags: ['autodocs'],
} satisfies Meta<typeof InspectorRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The rows of a list: the even stripe, the selected row, and the actions at the end of the line.
 */
export const Rows: Story = {
  render: () => {
    return {
      components: { ColorSwatch, InspectorRow, RowActionButton, Eye },
      template: `
        <ul style="width: 320px; margin: 0; padding: 0; list-style: none">
          <InspectorRow class="group">
            <ColorSwatch color="#e8a33d" :radius="3" border="dark" />
            <span style="flex: 1">group 1</span>
            <span>121 faces</span>
            <RowActionButton label="Hide group 1" :pressed="true"><Eye :size="14" /></RowActionButton>
          </InspectorRow>
          <InspectorRow class="group" :class="{ 'is-selected': true }">
            <ColorSwatch color="#7aa7d8" :radius="3" border="dark" />
            <span style="flex: 1">group 2</span>
            <span>8 faces</span>
            <RowActionButton label="Hide group 2" :pressed="false"><Eye :size="14" /></RowActionButton>
          </InspectorRow>
          <InspectorRow class="group">
            <ColorSwatch color="#d87a7a" :radius="3" border="dark" />
            <span style="flex: 1">group 3</span>
            <span>44 faces</span>
            <RowActionButton label="Hide group 3" :pressed="true"><Eye :size="14" /></RowActionButton>
          </InspectorRow>
        </ul>
      `,
    }
  },
}
