import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ColorSwatch from './ColorSwatch.vue'

/**
 * A patch of a color: the light of a row, the color of a room, the color the light editor picks.
 */
const meta = {
  title: 'Editor/ColorSwatch',
  component: ColorSwatch,
  args: {
    color: '#e8a33d',
    size: 10,
    radius: 2,
    border: 'none',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ColorSwatch>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The patch of a row: ten pixels, no border.
 */
export const Row: Story = {}

/**
 * The patch with the line of a row: the edge separates the colour from the panel.
 */
export const Bordered: Story = {
  args: {
    radius: 3,
    border: 'line',
  },
}

/**
 * The patch of the light editor: bigger, with the strong edge.
 */
export const LightEditor: Story = {
  args: {
    size: 18,
    radius: 3,
    border: 'strong',
  },
}
