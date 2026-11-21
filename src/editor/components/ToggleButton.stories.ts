import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { LockKeyhole, LockKeyholeOpen, Power, Settings } from 'lucide-vue-next'
import { ref } from 'vue'
import ToggleButton from './ToggleButton.vue'

/**
 * The switch of a setting, with any icon: the power of a light layer, the snapping, a lock.
 *
 * @remarks
 * The switch is controlled (the widget owns the value), so the toggling story holds a ref the way a widget does: a click
 * asks for the other state, and the story writes it back.
 */
const meta = {
  title: 'Editor/ToggleButton',
  component: ToggleButton,
  args: {
    pressed: false,
    label: 'Static lights',
    tooltip: 'Static lights',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ToggleButton>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The power switch off.
 */
export const Off: Story = {
  render: (args) => {
    return {
      components: { ToggleButton, Power },
      setup() {
        return { args }
      },
      template: '<ToggleButton v-bind="args"><Power :size="14" /></ToggleButton>',
    }
  },
}

/**
 * The power switch on: the accent border and icon of the lighting controls.
 */
export const On: Story = {
  args: { pressed: true },
  render: (args) => {
    return {
      components: { ToggleButton, Power },
      setup() {
        return { args }
      },
      template: '<ToggleButton v-bind="args"><Power :size="14" /></ToggleButton>',
    }
  },
}

/**
 * The switch of a setting whose master switch is off: it keeps its state, and can not be pressed.
 */
export const Disabled: Story = {
  args: { pressed: true, disabled: true },
  render: (args) => {
    return {
      components: { ToggleButton, Power },
      setup() {
        return { args }
      },
      template: '<ToggleButton v-bind="args"><Power :size="14" /></ToggleButton>',
    }
  },
}

/**
 * The lock of the layout, unlocked: the green lock and the label of the next action.
 */
export const Lock: Story = {
  args: { pressed: false, label: 'Unlock the layout', tone: 'ok' },
  render: (args) => {
    return {
      components: { ToggleButton, LockKeyhole, LockKeyholeOpen },
      setup() {
        return { args }
      },
      template: `
        <ToggleButton v-bind="args">
          <template #on><LockKeyholeOpen :size="14" /></template>
          <template #off><LockKeyhole :size="14" /></template>
        </ToggleButton>
      `,
    }
  },
}

/**
 * The lock of the layout, locked: the green lock while the layout is locked, the accent while the edit mode is on.
 */
export const LockOpen: Story = {
  args: { pressed: true, label: 'Lock the layout', tone: 'ok' },
  render: (args) => {
    return {
      components: { ToggleButton, LockKeyhole, LockKeyholeOpen },
      setup() {
        return { args }
      },
      template: `
        <ToggleButton v-bind="args">
          <template #on><LockKeyholeOpen :size="14" /></template>
          <template #off><LockKeyhole :size="14" /></template>
        </ToggleButton>
      `,
    }
  },
}

/**
 * The gear of the widget list: the quiet tool, the raised plate while its popup is open.
 */
export const Gear: Story = {
  args: { pressed: true, label: 'Add a widget', tone: 'quiet' },
  render: (args) => {
    return {
      components: { ToggleButton, Settings },
      setup() {
        return { args }
      },
      template: '<ToggleButton v-bind="args"><Settings :size="14" /></ToggleButton>',
    }
  },
}

/**
 * The switch toggling, with a local value.
 */
export const Toggling: Story = {
  render: (args) => {
    return {
      components: { ToggleButton, Power },
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
      template: '<ToggleButton v-bind="args" :pressed="pressed" @update:pressed="onPress"><Power :size="14" /></ToggleButton>',
    }
  },
}
