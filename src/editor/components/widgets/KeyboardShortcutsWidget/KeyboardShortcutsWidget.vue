<script setup lang="ts">
import { Command, Eye, EyeOff, MouseLeft, Redo2, Undo2, UndoDot } from 'lucide-vue-next'
import { computed } from 'vue'
import { history } from '../../../modules/history/history.ts'
import { redoLastStep, resetHistorySteps, undoLastStep } from '../../../modules/level/edit/editing.ts'
import { isMacKeyboard } from '../../../modules/keyboard/keyboard.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { isViewAtDefault, resetViewSwitches, viewSwitches, type ViewSwitch } from '../shared/levelDisplay.ts'

/**
 * One cell of the key column: a key cap with a text, or one with an icon of the library.
 */
type HelpKey =
  { readonly kind: 'icon'; readonly icon: 'command' | 'mouse-left' } | { readonly kind: 'text'; readonly text: string }

/**
 * A switch the help can flip from its row.
 */
type HelpToggle = ViewSwitch

/**
 * One row of the key help: the keys of an action, what they do, and the switch behind it.
 */
interface HelpRow {
  /**
   * The keys to press, in the order of the gesture: the cells are joined with a plus sign.
   */
  readonly keys: readonly HelpKey[]
  /**
   * What the keys do.
   */
  readonly action: string
  /**
   * How the gesture is repeated, if it is: the double click shows it as `× 2` after the key.
   */
  readonly suffix?: string
  /**
   * The switch the row belongs to, if it has one: the row then shows a button that flips it too.
   */
  readonly toggle?: HelpToggle
  /**
   * The switch this row sits under, if it is a child of one.
   *
   * @remarks
   * The row is drawn as a folder child of its parent (indented, with a corner at the end of its label), and its switch
   * only works while the parent switch is on: a view over a level that is not drawn has nothing to show.
   */
  readonly parent?: HelpToggle
  /**
   * The history command the row runs, if it has one: the row then shows an undo or a redo button.
   *
   * @remarks
   * The button is disabled when the step it would take is not there (the beginning or the end of the history), so
   * the widget shows what can be done, the same way the eye of the view rows shows what is on.
   */
  readonly button?: 'redo' | 'undo'
}

/**
 * One section of the key help.
 */
interface HelpSection {
  /**
   * The name of the section, shown above its rows.
   */
  readonly title: string
  /**
   * The rows of the section.
   */
  readonly rows: readonly HelpRow[]
  /**
   * The reset of the section, when its header carries a button for it.
   */
  readonly reset?: HelpReset
}

/**
 * The reset button of a section: what it is called, when it can be pressed, and what it does.
 */
interface HelpReset {
  /**
   * The tooltip and the screen reader name of the button.
   */
  readonly title: string
  /**
   * Whether the button is disabled: there is nothing to reset.
   */
  readonly disabled: () => boolean
  /**
   * The reset itself.
   */
  readonly run: () => void
}

/**
 * The icons a cell may show, by name.
 */
const icons = { command: Command, 'mouse-left': MouseLeft }

/**
 * The words the buttons use for the switches of the rows.
 */
const switchNames: Record<HelpToggle, string> = {
  mesh: 'the mesh',
  wireframe: 'the wireframe',
  roomColors: 'the rooms',
}

/**
 * The key that takes a face out of the selection: `Ctrl` everywhere, and the `Cmd` of the mac.
 *
 * @remarks
 * The editor answers to both on every platform (`selectionModeOf` reads `ctrlKey` and `metaKey`), the help
 * only shows the one the platform puts under the fingers.
 */
let removeKey: HelpKey = { kind: 'text', text: 'Ctrl' }

if (isMacKeyboard()) {
  removeKey = { kind: 'icon', icon: 'command' }
}

/**
 * The left button of the mouse, as the icon the library draws.
 */
const leftButton: HelpKey = { kind: 'icon', icon: 'mouse-left' }

/**
 * Whether the history has nothing to take back, so its reset button is disabled.
 */
function isHistoryAtStart(): boolean {
  return !history.canUndo.value
}

/**
 * The modifier of a shortcut: `Ctrl` everywhere, and the `Cmd` of the mac.
 */
let primaryKey: HelpKey = { kind: 'text', text: 'Ctrl' }

if (isMacKeyboard()) {
  primaryKey = { kind: 'icon', icon: 'command' }
}

// The keys the views really answer today: the rest of the table is not wired to a widget yet, so listing it
// would promise keys that do nothing (the generated list comes with the widget round that uses them).
const sections = computed<readonly HelpSection[]>(() => {
  return [
    {
      title: 'View context',
      reset: {
        title: 'Reset view context',
        disabled: (): boolean => {
          return isViewAtDefault.value
        },
        run: resetViewSwitches,
      },
      rows: [
        { keys: [{ kind: 'text', text: 'X' }], action: 'Wireframe', toggle: 'wireframe' },
        { keys: [{ kind: 'text', text: 'M' }], action: 'Mesh', toggle: 'mesh' },
        { keys: [{ kind: 'text', text: 'R' }], action: 'room', toggle: 'roomColors', parent: 'mesh' },
      ],
    },
    {
      title: 'History',
      reset: { title: 'Take every step back', disabled: isHistoryAtStart, run: resetHistorySteps },
      rows: [
        { keys: [primaryKey, { kind: 'text', text: 'Z' }], action: 'Undo', button: 'undo' },
        { keys: [primaryKey, { kind: 'text', text: 'Y' }], action: 'Redo', button: 'redo' },
      ],
    },
    {
      title: 'Selection',
      rows: [
        { keys: [leftButton], action: 'Select face(s)' },
        { keys: [leftButton], suffix: '× 2', action: 'Fill select by view context' },
        { keys: [{ kind: 'text', text: 'Shift' }, leftButton], action: 'Add to selection' },
        { keys: [removeKey, leftButton], action: 'Remove from selection' },
        { keys: [{ kind: 'text', text: 'C' }], action: 'Clear selection' },
        { keys: [{ kind: 'text', text: 'Delete' }], action: 'Delete face(s)' },
      ],
    },
  ]
})

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * Tells whether the switch of a row is on.
 *
 * @param toggle The switch of the row.
 *
 * @returns Whether the thing it shows is visible.
 */
function isOn(toggle: HelpToggle): boolean {
  return viewSwitches[toggle].ref.value
}

/**
 * Flips the switch of a row.
 *
 * @param toggle The switch of the row.
 */
function flip(toggle: HelpToggle): void {
  viewSwitches[toggle].ref.value = !viewSwitches[toggle].ref.value
}

/**
 * The tooltip of the button of a row: it says what a click does.
 *
 * @param toggle The switch of the row.
 *
 * @returns The label of the button.
 */
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
 * @returns True when the row has a switch under a switch that is off: the row then greys out, so it reads as one
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
    <WidgetHeading :label="props.label" />
    <section v-for="section in sections" :key="section.title" class="section">
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
        <template v-for="row in section.rows" :key="row.action">
          <dt :class="{ 'is-disabled': isRowDisabled(row) }">
            <template v-for="(key, index) in row.keys" :key="index">
              <span v-if="index > 0" class="plus">+</span>
              <component :is="icons[key.icon]" v-if="key.kind === 'icon'" class="key-icon" />
              <kbd v-else>{{ key.text }}</kbd>
            </template>
            <span v-if="row.suffix !== undefined" class="suffix">{{ row.suffix }}</span>
          </dt>
          <dd :class="{ 'is-disabled': isRowDisabled(row) }">
            <span class="action">{{ row.action }}</span>
            <span v-if="row.parent !== undefined" class="branch" aria-hidden="true">┘</span>
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
  padding: 8px;

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

    // at the default state there is nothing to put back: the button is greyed out and does not react
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

  // a child of a switch that is off: the whole row greys out, so it reads as one block that waits for its parent
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
