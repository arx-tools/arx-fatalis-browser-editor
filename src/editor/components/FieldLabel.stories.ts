import type { Meta, StoryObj } from '@storybook/vue3-vite'
import FieldLabel from './FieldLabel.vue'
import NumberField from './NumberField.vue'

/**
 * The caption of a control: above it (the thin camera and jump widgets) or beside it (the settings rows).
 */
const meta = {
  title: 'Editor/FieldLabel',
  component: FieldLabel,
  args: {
    label: 'Pitch',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldLabel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The caption above a text field: the cell of the camera form and the jump.
 */
export const Above: Story = {
  render: (args) => {
    return {
      components: { FieldLabel, NumberField },
      setup() {
        return { args }
      },
      template: '<FieldLabel v-bind="args"><NumberField model-value="42" label="Pitch" style="width: 64px" /></FieldLabel>',
    }
  },
}

/**
 * The caption beside the control: one line per setting, the caption on the same 72px column.
 */
export const Inline: Story = {
  args: {
    label: 'Threshold',
    inline: true,
  },
  render: (args) => {
    return {
      components: { FieldLabel, NumberField },
      setup() {
        return { args }
      },
      template: '<FieldLabel v-bind="args"><NumberField model-value="20" label="Threshold" style="width: 56px" /></FieldLabel>',
    }
  },
}
