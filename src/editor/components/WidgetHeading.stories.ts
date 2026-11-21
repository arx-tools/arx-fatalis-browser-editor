import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PowerButton from './ToggleButton.vue'
import WidgetHeading from './WidgetHeading.vue'

/**
 * The heading of an info widget: the title, and the switch of the widget on the right.
 */
const meta = {
  title: 'Editor/WidgetHeading',
  component: WidgetHeading,
  args: {
    label: 'Group Inspector',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WidgetHeading>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The title alone, on the whole width of the widget.
 */
export const Title: Story = {
  render: (args) => {
    return {
      components: { WidgetHeading },
      setup() {
        return { args }
      },
      template: '<div style="width: 320px"><WidgetHeading v-bind="args" /></div>',
    }
  },
}

/**
 * The title with the action of the widget: the switch of a layer or a `+` of the info widgets.
 */
export const WithAction: Story = {
  render: (args) => {
    return {
      components: { WidgetHeading, PowerButton },
      setup() {
        return { args }
      },
      template: `
        <div style="width: 320px">
          <WidgetHeading v-bind="args">
            <template #actions>
              <PowerButton :pressed="false" label="Group the selected faces" />
            </template>
          </WidgetHeading>
        </div>
      `,
    }
  },
}
