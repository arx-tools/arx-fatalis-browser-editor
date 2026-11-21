import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { Eye, Pencil, ScanSearch, Trash2 } from 'lucide-vue-next'
import RowActionButton from './RowActionButton.vue'

/**
 * One action of a row: the eye, the magnifier, the pencil and the trash of the group and room lists.
 */
const meta = {
  title: 'Editor/RowActionButton',
  component: RowActionButton,
  args: {
    label: 'Hide group 1',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RowActionButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The eye of a visible row: pressed, with the accent.
 */
export const EyeOn: Story = {
  render: (args) => {
    return {
      components: { RowActionButton, Eye },
      setup() {
        return { args }
      },
      template: '<RowActionButton v-bind="args" :pressed="true" label="Hide group 1"><Eye :size="14" /></RowActionButton>',
    }
  },
}

/**
 * The eye of a hidden row.
 */
export const EyeOff: Story = {
  render: (args) => {
    return {
      components: { RowActionButton, Eye },
      setup() {
        return { args }
      },
      template: '<RowActionButton v-bind="args" :pressed="false" label="Show group 1"><Eye :size="14" /></RowActionButton>',
    }
  },
}

/**
 * The quiet actions: the magnifier and the pencil come forward under the pointer.
 */
export const Muted: Story = {
  render: (args) => {
    return {
      components: { RowActionButton, ScanSearch, Pencil },
      setup() {
        return { args }
      },
      template: `
        <div style="display: flex; gap: 8px">
          <RowActionButton v-bind="args" muted label="Jump to group 1"><ScanSearch :size="13" /></RowActionButton>
          <RowActionButton v-bind="args" muted label="Rename group 1"><Pencil :size="13" /></RowActionButton>
        </div>
      `,
    }
  },
}

/**
 * The delete of a row: the danger colour on the hover.
 */
export const Danger: Story = {
  render: (args) => {
    return {
      components: { RowActionButton, Trash2 },
      setup() {
        return { args }
      },
      template: '<RowActionButton v-bind="args" muted danger label="Delete group 1"><Trash2 :size="13" /></RowActionButton>',
    }
  },
}
