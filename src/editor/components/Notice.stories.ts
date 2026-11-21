import type { Meta, StoryObj } from '@storybook/vue3-vite'
import Notice from './Notice.vue'

/**
 * A sentence in the place of a list or an edit.
 */
const meta = {
  title: 'Editor/Notice',
  component: Notice,
  tags: ['autodocs'],
} satisfies Meta<typeof Notice>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The note of an empty edit.
 */
export const SelectALight: Story = {
  render: () => {
    return {
      components: { Notice },
      template: '<div style="width: 280px"><Notice>Select a light to edit.</Notice></div>',
    }
  },
}
