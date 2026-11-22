import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { FlipHorizontal, RotateCcw, RotateCw } from 'lucide-vue-next'
import ToolButton from './ToolButton.vue'

/**
 * A small tool of a toolbar: the flat icon button of the uv mapper's turns.
 */
const meta = {
  title: 'Editor/ToolButton',
  component: ToolButton,
  args: {
    label: 'Rotate counter-clockwise',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ToolButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The row of the uv mapper's tools, with one of them disabled (a tool that only works on a quad).
 */
export const Tools: Story = {
  render: (args) => {
    return {
      components: { ToolButton, FlipHorizontal, RotateCcw, RotateCw },
      setup() {
        return { args }
      },
      template: `
        <div style="display: flex; gap: 4px">
          <ToolButton label="Rotate counter-clockwise"><RotateCcw :size="13" /></ToolButton>
          <ToolButton label="Rotate clockwise"><RotateCw :size="13" /></ToolButton>
          <ToolButton label="Flip horizontally"><FlipHorizontal :size="13" /></ToolButton>
          <ToolButton label="Lay the corners in a quarter of the texture" :disabled="true">
            <RotateCw :size="13" />
          </ToolButton>
        </div>
      `,
    }
  },
}
