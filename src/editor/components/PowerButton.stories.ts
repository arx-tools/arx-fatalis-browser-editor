import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import PowerButton from './PowerButton.vue'

/**
 * The power switch of a setting, alone.
 *
 * @remarks
 * The switch is controlled (the widget owns the value), so the toggling story holds a ref the way a widget does: a
 * click asks for the other state, and the story writes it back.
 */
const meta = {
  title: 'Editor/PowerButton',
  component: PowerButton,
  args: {
    pressed: false,
    label: 'Static lights',
    tooltip: 'Static lights',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PowerButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The switch off.
 */
export const Off: Story = {}

/**
 * The switch on: the accent border and icon of the lighting controls.
 */
export const On: Story = {
  args: { pressed: true },
}

/**
 * The switch of a setting whose master switch is off: it keeps its state, and can not be pressed.
 */
export const Disabled: Story = {
  args: { pressed: true, disabled: true },
}

/**
 * The switch toggling, with a local value.
 */
export const Toggling: Story = {
  render: (args) => {
    return {
      components: { PowerButton },
      setup() {
        const pressed = ref(args.pressed)

        return {
          args,
          pressed,
          onPress: (value: boolean): void => {
            pressed.value = value
          },
        }
      },
      template: '<PowerButton v-bind="args" :pressed="pressed" @update:pressed="onPress" />',
    }
  },
}
