import type { Meta, StoryObj } from '@storybook/vue3-vite'
import EmptyMessage from './EmptyMessage.vue'

/**
 * The line a list shows when it is empty.
 */
const meta = {
  title: 'Editor/EmptyMessage',
  component: EmptyMessage,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyMessage>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The message of a list that a filter emptied.
 */
export const NoMatch: Story = {
  render: () => {
    return {
      components: { EmptyMessage },
      template: '<EmptyMessage>No light matches the search</EmptyMessage>',
    }
  },
}

/**
 * The message of a list that has nothing to show at all.
 */
export const NothingSelected: Story = {
  render: () => {
    return {
      components: { EmptyMessage },
      template: '<EmptyMessage>Nothing is selected.</EmptyMessage>',
    }
  },
}
