import type { LayoutNode } from './layoutNode.ts'

/**
 * The presets of the dock layout: the trees the editor can start from.
 *
 * @remarks
 * A preset is a plain {@link LayoutNode}, so a new one is just another constant in this file (a layout
 * for a level editor, one for the lighting work, …), and the header can offer them later. Today only
 * the default one exists: it is what the editor starts with, and what the reset button restores.
 */

/**
 * The layout the editor starts with, and the one the reset button restores.
 *
 * @remarks
 * - the 3D view takes 70% of the width: it is the working surface, and it wants the room
 * - the statistics sit above the help on the right 30%
 * - the camera is **not** part of it: it is the free kind of the picker, and a kind that is not in the
 * tree is simply not on the dock
 * - the reset button compares the live layout against this constant, so it is shown only when the user
 * moved something
 */
export const defaultLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [0.7, 0.3],
  children: [
    { type: 'widget', kind: 'view3d' },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'widget', kind: 'statistics' },
        { type: 'widget', kind: 'help' },
      ],
    },
  ],
}
