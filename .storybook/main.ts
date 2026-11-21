import type { StorybookConfig } from '@storybook/vue3-vite'

/**
 * The Storybook of the editor's building blocks.
 *
 * @remarks
 * The `.vue` components can not be unit tested (`node --test` has no Vite transform, see the architecture), so the
 * Storybook is the place where a component is seen and tried alone: the power switch, the caption cell, the heading of
 * a widget. The stories live next to the components (`*.stories.ts`), and the app's palette and global style come from
 * the preview.
 */
const config: StorybookConfig = {
  stories: ['../src/editor/components/**/*.stories.ts'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
}

export default config
