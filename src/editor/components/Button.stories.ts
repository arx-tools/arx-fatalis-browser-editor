import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { Check, Download, X } from 'lucide-vue-next'
import Button from './Button.vue'

/**
 * The wide button of a dialog's footer: the export of the export map, and the action of the next dialog.
 */
const meta = {
  title: 'Editor/Button',
  component: Button,
  args: {
    label: 'Export the level',
    tone: 'plain',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The three states of the export: the ready button, the finished one and the failed one.
 */
export const States: Story = {
  render: (args) => {
    return {
      components: { Button, Check, Download, X },
      setup() {
        return { args }
      },
      template: `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 240px">
          <Button label="Export the level"><Download :size="14" /></Button>
          <Button label="Downloaded" tone="ok"><Check :size="14" /></Button>
          <Button label="The export failed" tone="danger"><X :size="14" /></Button>
          <Button label="Packing" :disabled="true"><Download :size="14" /></Button>
        </div>
      `,
    }
  },
}
