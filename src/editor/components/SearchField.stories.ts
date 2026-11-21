import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SearchField from './SearchField.vue'

/**
 * The search field of a list: the glass, the field and the clear button.
 *
 * @remarks
 * The field is controlled (`v-model`), so the story holds the query the way a widget does.
 */
const meta = {
  title: 'Editor/SearchField',
  component: SearchField,
  args: {
    modelValue: '',
    placeholder: 'Search lights',
    label: 'Search lights',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SearchField>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The empty field with its hint.
 */
export const Empty: Story = {
  render: (args) => {
    return {
      components: { SearchField },
      setup() {
        const query = ref(args.modelValue)

        return { args, query }
      },
      template: '<div style="width: 260px"><SearchField v-bind="args" :model-value="query" @update:model-value="(value) => (query = value)" /></div>',
    }
  },
}

/**
 * The field with a filter typed in: the clear button is at its end.
 */
export const WithText: Story = {
  args: {
    modelValue: 'floor',
  },
  render: (args) => {
    return {
      components: { SearchField },
      setup() {
        const query = ref(args.modelValue)

        return { args, query }
      },
      template: '<div style="width: 260px"><SearchField v-bind="args" :model-value="query" @update:model-value="(value) => (query = value)" /></div>',
    }
  },
}
