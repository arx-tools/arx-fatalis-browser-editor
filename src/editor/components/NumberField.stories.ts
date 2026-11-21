import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import NumberField from './NumberField.vue'

/**
 * A number in a text field: no spinner, the whole value selected when the field takes the focus.
 */
const meta = {
  title: 'Editor/NumberField',
  component: NumberField,
  args: {
    modelValue: '42',
    label: 'Pitch',
    inputmode: 'decimal',
    invalid: false,
    disabled: false,
    step: true,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NumberField>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The field with a value: the arrow keys step it, the way the camera form does.
 */
export const Value: Story = {
  render: (args) => {
    return {
      components: { NumberField },
      setup() {
        const value = ref(args.modelValue)

        return {
          args,
          value,
          step: (direction: number): void => {
            value.value = String(Number(value.value) + direction)
          },
        }
      },
      template: '<div style="width: 120px"><NumberField v-bind="args" v-model="value" @step="step" /></div>',
    }
  },
}

/**
 * The text is not a number the widget can use: the field shows the edge of the mistake.
 */
export const Invalid: Story = {
  args: {
    modelValue: '12x',
    invalid: true,
  },
}

/**
 * The field of a form that can not be edited.
 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
}
