import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PaletteSwatches from './PaletteSwatches.vue'

/**
 * The palette of the editor: the surfaces, the borders, the text and the marks, token by token.
 *
 * @remarks
 * A new colour comes from these tokens and not from a raw value (the `palette.spec.ts` guards it in the sources); the page
 * is the place where a token is looked at before it is written into a widget.
 */
const meta = {
  title: 'Editor/Palette',
  component: PaletteSwatches,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PaletteSwatches>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The tokens, grouped by what they are for.
 */
export const Tokens: Story = {}
