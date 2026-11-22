import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SectionTitle from './SectionTitle.vue'

/**
 * The title of a section inside a widget.
 */
const meta = {
  title: 'Editor/SectionTitle',
  component: SectionTitle,
  tags: ['autodocs'],
} satisfies Meta<typeof SectionTitle>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The title over a group of rows.
 */
export const Title: Story = {
  render: () => {
    return {
      components: { SectionTitle },
      template: '<div style="width: 280px"><SectionTitle>Manage selection</SectionTitle></div>',
    }
  },
}
