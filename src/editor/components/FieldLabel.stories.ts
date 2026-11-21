import type { Meta, StoryObj } from '@storybook/vue3-vite'
import FieldLabel from './FieldLabel.vue'
import PowerButton from './PowerButton.vue'

/**
 * The caption of a control: above it (the thin camera and jump widgets) or beside it (the settings rows).
 */
const meta = {
  title: 'Editor/FieldLabel',
  component: FieldLabel,
  args: {
    label: 'Static lights',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldLabel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The caption above the control: the cell of the camera form and the jump.
 */
export const Above: Story = {
  render: (args) => {
    return {
      components: { FieldLabel, PowerButton },
      setup() {
        return { args }
      },
      template: '<FieldLabel v-bind="args"><PowerButton :pressed="true" label="Static lights" /></FieldLabel>',
    }
  },
}

/**
 * The caption beside the control: one line per setting, the caption on the same 72px column.
 */
export const Inline: Story = {
  args: {
    label: 'Snapping',
    inline: true,
  },
  render: (args) => {
    return {
      components: { FieldLabel, PowerButton },
      setup() {
        return { args }
      },
      template: '<FieldLabel v-bind="args"><PowerButton :pressed="true" label="Snapping" /></FieldLabel>',
    }
  },
}
