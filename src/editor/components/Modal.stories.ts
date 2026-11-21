import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import Modal from './Modal.vue'

/**
 * A dialog over the whole editor: the cover, the title and the slots of the content and the actions.
 */
const meta = {
  title: 'Editor/Modal',
  component: Modal,
  args: {
    title: 'Export Map',
    wide: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Modal>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The dialog of the export: the form in the default slot, the buttons in the actions slot. The close (the X, Escape, the
 * cover) asks the story to put the dialog away, and the button brings it back.
 */
export const Dialog: Story = {
  render: (args) => {
    return {
      components: { Modal },
      setup() {
        const open = ref(true)

        return {
          args,
          open,
          close: (): void => {
            open.value = false
          },
        }
      },
      template: `
        <div>
          <button v-if="!open" type="button" @click="open = true">Open the dialog</button>
          <Modal v-if="open" v-bind="args" @close="close">
            <p>The form of the export goes here.</p>
            <template #actions>
              <button type="button" @click="close">Cancel</button>
            </template>
          </Modal>
        </div>
      `,
    }
  },
}
