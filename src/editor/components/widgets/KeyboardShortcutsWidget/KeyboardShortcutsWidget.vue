<script setup lang="ts">
import { Command, Eye, EyeOff, MouseLeft, Redo2, Undo2, UndoDot } from 'lucide-vue-next'
import type { ShallowRef } from 'vue'
import { history } from '../../../modules/history/history.ts'
import { redoLastStep, undoLastStep } from '../../../modules/level/edit/editing.ts'
import { keyboardShortcutPartsOf } from '../../../modules/keyboard/keyboard.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { editModeSwitches } from '../shared/editModes.ts'
import { viewSwitches } from '../shared/levelDisplay.ts'
import { helpSections, switchNames, type HelpKey, type HelpRow, type HelpToggle } from './helpRows.ts'

/**
 * The keys of the editor: the view context, the edit modes, the movement, the history and the selection.
 *
 * @remarks
 * The **caps of a row come from the keyboard table** (through the bindings): the row names its action, and the widget
 * asks the bindings for the parts of its first combo, so a rebound key shows up here and the list can not drift from the
 * keys the editor answers (2026-11-22, the 68). The gestures the table does not cover (the mouse, the `Shift` of the
 * snapping) keep their own caps.
 *
 * The eyes of the view and the mode rows flip the switches of the store, and the history rows carry the two steps: the
 * widget is not a list of keys only, it is also the panel where the switches can be flipped (2026-11-12, the owner).
 *
 * The data is [`helpRows.ts`](helpRows.ts): the sections and the rows, kept apart so a test can read them without the
 * page, and the rendering (the icons, the switches, the rows) lives here.
 */
const switches = { ...viewSwitches, ...editModeSwitches } as const satisfies Record<
  string,
  { readonly ref: ShallowRef<boolean>; readonly defaultValue: boolean }
>

/**
 * The icons a cell may show, by name.
 */
const icons = { command: Command, 'mouse-left': MouseLeft }

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
  /**
   * Whether the list draws its own heading (the default), or the box around it carries the title: the popup of the keys
   * is a dialog, and the title of a dialog is its head (TODO 187).
   */
  readonly heading?: boolean
}>()

/**
 * The caps of a row: the parts of the key of its action, or the hand-written cells of a gesture.
 *
 * @param row The row to read.
 *
 * @returns The cells of the key column, in the order of the press.
 */
function keysOf(row: HelpRow): readonly HelpKey[] {
  if (row.actionId === undefined) {
    return row.keys ?? []
  }

  return keyboardShortcutPartsOf(row.actionId).map((text) => {
    return { kind: 'text' as const, text }
  })
}

/**
 * Tells whether the switch of a row is on.
 *
 * @param toggle The switch of the row.
 *
 * @returns Whether the thing it shows is visible.
 */
function isOn(toggle: HelpToggle): boolean {
  return switches[toggle].ref.value
}

/**
 * Flips the switch of a row.
 *
 * @param toggle The switch of the row.
 */
function flip(toggle: HelpToggle): void {
  switches[toggle].ref.value = !switches[toggle].ref.value
}

/**
 * Tells whether the button of a row can be pressed.
 *
 * @param button The step the row runs.
 *
 * @returns False when the history has nothing on that side, so the button is disabled.
 */
function isButtonEnabled(button: 'redo' | 'undo'): boolean {
  if (button === 'undo') {
    return history.canUndo.value
  }

  return history.canRedo.value
}

/**
 * The label of the button of a row.
 *
 * @param button The step the row runs.
 *
 * @returns What the button does, for the screen reader and the tooltip.
 */
function buttonLabel(button: 'redo' | 'undo'): string {
  if (button === 'undo') {
    return 'Undo'
  }

  return 'Redo'
}

/**
 * Runs the step of a row: the undo or the redo of the history.
 *
 * @remarks
 * The buttons go through the same door as the keys (`undoLastStep`/`redoLastStep` in the editing module): the undo of
 * a delete drops the selection, because the faces that stay selected would point at other faces after the step. A
 * button that called the history directly would leave that selection behind (2026-11-05, a refactor find).
 *
 * @param button The step the row runs.
 */
function runHistory(button: 'redo' | 'undo'): void {
  if (button === 'undo') {
    undoLastStep()

    return
  }

  redoLastStep()
}

/**
 * The tooltip of the button of a row: it says what a click does.
 *
 * @param toggle The switch of the row.
 *
 * @returns The label of the button.
 */
function buttonTitle(toggle: HelpToggle): string {
  if (isOn(toggle)) {
    return `Hide ${switchNames[toggle]}`
  }

  return `Show ${switchNames[toggle]}`
}

/**
 * Tells whether the switch of a row can be flipped.
 *
 * @param row The row to read.
 *
 * @returns False when the switch of the row sits under a switch that is off: the eye is disabled then, but the state
 * of the row stays as it was, so turning the parent back on brings the row back the way it was.
 */
function isToggleEnabled(row: HelpRow): boolean {
  if (row.parent === undefined) {
    return true
  }

  return isOn(row.parent)
}

/**
 * Tells whether the whole row is disabled.
 *
 * @param row The row to read.
 *
 * @returns True when the row has a switch under a switch that is off: the row then grays out, so it reads as one
 * block that is waiting for its parent.
 */
function isRowDisabled(row: HelpRow): boolean {
  return row.toggle !== undefined && !isToggleEnabled(row)
}

/**
 * The tooltip of the switch of a row, which says why it is disabled.
 *
 * @param row The row to read.
 *
 * @returns The tooltip of its eye button.
 */
/**
 * The character of the branch of a row under its switch.
 *
 * @remarks
 * The children of a switch are a tree with the line on the right of their labels: a child that has a sibling after it
 * keeps the line going (`┤`), and the last one closes it (`┘`). The section of the view context is the one that has
 * children today (the portals, the rooms and the textures under the mesh).
 *
 * @param rows The rows of the section the child is in.
 * @param index The position of the row in the section.
 *
 * @returns The character of its branch.
 */
function branchOf(rows: readonly HelpRow[], index: number): string {
  const row = rows[index]

  if (row === undefined || row.parent === undefined) {
    return ''
  }

  const sibling = rows.slice(index + 1).some((next) => {
    return next.parent === row.parent
  })

  if (sibling) {
    return '┤'
  }

  return '┘'
}

function toggleTitle(row: HelpRow): string {
  if (row.toggle === undefined) {
    return ''
  }

  if (!isToggleEnabled(row)) {
    return `${switchNames[row.parent ?? row.toggle]} is off`
  }

  return buttonTitle(row.toggle)
}
</script>

<template>
  <div class="KeyboardShortcutsWidget">
    <WidgetHeading v-if="props.heading !== false" :label="props.label" />
    <section v-for="section in helpSections" :key="section.title" class="section">
      <div class="section-head">
        <h3 class="section-title">{{ section.title }}</h3>
        <button
          v-if="section.reset !== undefined"
          class="reset-view"
          type="button"
          :disabled="section.reset.disabled()"
          :aria-label="section.reset.title"
          v-tooltip="section.reset.title"
          @click="section.reset.run()"
        >
          <UndoDot class="reset-icon" />
        </button>
      </div>
      <dl>
        <template v-for="(row, rowIndex) in section.rows" :key="row.action">
          <dt :class="{ 'is-disabled': isRowDisabled(row) }">
            <template v-for="(key, index) in keysOf(row)" :key="index">
              <span v-if="index > 0" class="plus">+</span>
              <component :is="icons[key.icon]" v-if="key.kind === 'icon'" class="key-icon" />
              <kbd v-else>{{ key.text }}</kbd>
            </template>
            <span v-if="row.suffix !== undefined" class="suffix">{{ row.suffix }}</span>
          </dt>
          <dd :class="{ 'is-disabled': isRowDisabled(row) }">
            <span class="action">{{ row.action }}</span>
            <span v-if="row.parent !== undefined" class="branch" aria-hidden="true">{{
              branchOf(section.rows, rowIndex)
            }}</span>
            <button
              v-if="row.button !== undefined"
              class="history-button"
              type="button"
              :disabled="!isButtonEnabled(row.button)"
              :aria-label="buttonLabel(row.button)"
              v-tooltip="buttonLabel(row.button)"
              @click="runHistory(row.button)"
            >
              <component :is="row.button === 'undo' ? Undo2 : Redo2" class="history-icon" />
            </button>
            <button
              v-if="row.toggle !== undefined"
              class="visibility"
              :class="{ 'is-on': isOn(row.toggle) }"
              type="button"
              :disabled="!isToggleEnabled(row)"
              :aria-pressed="isOn(row.toggle)"
              :aria-label="toggleTitle(row)"
              v-tooltip="toggleTitle(row)"
              @click="flip(row.toggle)"
            >
              <component :is="isOn(row.toggle) ? Eye : EyeOff" class="visibility-icon" />
            </button>
          </dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../shared/infoRows' as *;

.KeyboardShortcutsWidget {
  height: 100%;
  padding: 0 8px 8px;

  // the sections follow each other with a small gap, the first one right under the title
  .section + .section {
    margin-top: 13px;
  }

  // the header of a section: the name on the left and, on a section of switches, the reset on the right.
  // The rule under it belongs to the row, so the button sits on the same line as the names
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 6px;
    padding: 0 6px 5px;
    border-bottom: 1px solid $border-dark;
  }

  // the name of a section: the look of the widget title, a size smaller and without the weight
  .section-title {
    margin: 0;
    color: $text-icon;
    font-size: 11px;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  // the reset of the switches: the look of the show/hide buttons of the rows, on the header line
  .reset-view {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: rgba($surface-app, 0.72);
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      color: $text;
      background: $surface-panel;
    }

    // at the default state there is nothing to put back: the button is grayed out and does not react
    &:disabled {
      color: $text-subtle;
      background: rgba($surface-app, 0.4);
      border-color: $border-dark;
      cursor: default;
    }
  }

  .reset-icon {
    width: 14px;
    height: 14px;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    margin: 0;
    font-size: 13px;

    @include info-rows;
  }

  // a row may need more than one key: they sit next to each other, with a small gap
  dt {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  // two pixels more than the shared rows: a key is taller than a line of text, and the caps need air
  dt,
  dd {
    padding-top: 4px;
    padding-bottom: 4px;
  }

  // a child of a switch that is off: the whole row grays out, so it reads as one block that waits for its parent
  dt.is-disabled,
  dd.is-disabled {
    opacity: 0.45;
  }

  // the corner of a child, after its label: it pulls the label a little left of the edge the other rows end at, so the
  // child reads as one under the row above it
  .branch {
    margin-right: 10px;
    color: $text-subtle;
    font-size: 12px;
  }

  // the action sits at the right edge, with the switch of the row after it
  dd {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin: 0;
    color: $text-icon;
    text-align: right;
  }

  kbd {
    display: inline-block;
    min-width: 18px;
    padding: 0 4px;
    color: $text;
    font-family: inherit;
    font-size: 12px;
    text-align: center;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 3px;
  }

  // an icon cell: a cap around the icon, so it reads like a key
  .key-icon {
    width: 16px;
    height: 16px;
    padding: 2px;
    color: $text;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 3px;
  }

  // the plus sign between the keys of a combination, not a key itself
  .plus {
    color: $text-icon;
    font-size: 12px;
  }

  // how many times the gesture is made: `× 2` after the key of a double click, not a key itself
  .suffix {
    color: $text-icon;
    font-size: 12px;
  }

  // the switch of a row: the look of the grid button of the fixed views
  .visibility {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: rgba($surface-app, 0.72);
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $surface-panel;
    }

    // only the eye turns orange: the frame stays the neutral border of every button
    &.is-on {
      color: $accent;
    }

    // the child of a switch that is off: the eye keeps its look but says it can not be used now
    &:disabled {
      color: $border;
      cursor: default;
    }
  }

  .visibility-icon {
    width: 14px;
    height: 14px;
  }

  // the undo and the redo of the history: the frame of the visibility button, and it goes quiet where there is
  // nothing to take back or make again
  .history-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: rgba($surface-app, 0.72);
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $surface-panel;
      color: $text;
    }

    &:disabled {
      color: $border;
      cursor: default;
    }
  }

  .history-icon {
    width: 14px;
    height: 14px;
  }
}
</style>
