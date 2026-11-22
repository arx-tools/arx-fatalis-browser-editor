import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import AccordionRow from './AccordionRow.vue'

/**
 * A row of a list that folds its content away: the label, a value, and the arrow of the fold.
 */
const meta = {
  title: 'Editor/AccordionRow',
  component: AccordionRow,
  args: {
    label: 'fix_inter',
    value: '130',
    open: false,
    stripe: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AccordionRow>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The row closed: the label and the value of the right, with the arrow down.
 */
export const Closed: Story = {
  render: (args) => {
    return {
      components: { AccordionRow },
      setup() {
        return { args }
      },
      template: '<div style="width: 320px"><AccordionRow v-bind="args" /></div>',
    }
  },
}

/**
 * The row open, with its content under the head.
 */
export const Open: Story = {
  render: (args) => {
    return {
      components: { AccordionRow },
      setup() {
        return { args }
      },
      template:
        '<div style="width: 320px"><AccordionRow v-bind="args" :open="true"><p style="margin: 0">A row of the content.</p></AccordionRow></div>',
    }
  },
}

/**
 * A list of rows: every second one carries a stripe, and one of them is open.
 *
 * @remarks
 * The stripes and the hover paint the whole head, so the label, the value and the arrow answer the pointer together.
 */
export const Rows: Story = {
  render: () => {
    return {
      components: { AccordionRow },
      setup() {
        const open = ref('items')

        return {
          open,
          toggle: (label: string): void => {
            open.value = open.value === label ? '' : label
          },
        }
      },
      template: `
        <div style="width: 320px">
          <AccordionRow
            v-for="(row, index) in [
              { label: 'fix_inter', value: '130' },
              { label: 'items', value: '180' },
              { label: 'npc', value: '37' },
              { label: 'player', value: '0' },
            ]"
            :key="row.label"
            :label="row.label"
            :value="row.value"
            :stripe="index % 2 === 1"
            :open="open === row.label"
            @toggle="toggle(row.label)"
          >
            <p style="margin: 0">The rows of {{ row.label }}.</p>
          </AccordionRow>
        </div>
      `,
    }
  },
}
