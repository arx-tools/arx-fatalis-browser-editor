<script setup lang="ts">
import { Command, Eye, EyeOff, MouseLeft } from 'lucide-vue-next'
import { computed, type ShallowRef } from 'vue'
import { isMacKeyboard } from '../../../modules/keyboard/keyboard.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { isMeshVisible, isWireframeVisible } from '../levelDisplay.ts'

/**
 * One cell of the key column: a key cap with a text, or one with an icon of the library.
 */
type HelpKey =
  { readonly kind: 'icon'; readonly icon: 'command' | 'mouse-left' } | { readonly kind: 'text'; readonly text: string }

/**
 * A switch the help can flip from its row.
 */
type HelpToggle = 'mesh' | 'wireframe'

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
   * The switch the row belongs to, if it has one: the row then shows a button that flips it too.
   */
  readonly toggle?: HelpToggle
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
}

/**
 * The icons a cell may show, by name.
 */
const icons = { command: Command, 'mouse-left': MouseLeft }

/**
 * The switches behind the rows that have one, with the word the button uses for them.
 */
const toggles: Record<HelpToggle, { readonly ref: ShallowRef<boolean>; readonly name: string }> = {
  mesh: { ref: isMeshVisible, name: 'the mesh' },
  wireframe: { ref: isWireframeVisible, name: 'the wireframe' },
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

// The keys the views really answer today: the rest of the table is not wired to a widget yet, so listing it
// would promise keys that do nothing (the generated list comes with the widget round that uses them).
const sections = computed<readonly HelpSection[]>(() => {
  return [
    {
      title: 'View',
      rows: [
        { keys: [{ kind: 'text', text: 'M' }], action: 'Mesh', toggle: 'mesh' },
        { keys: [{ kind: 'text', text: 'X' }], action: 'Wireframe', toggle: 'wireframe' },
      ],
    },
    {
      title: 'Selection',
      rows: [
        { keys: [leftButton], action: 'Select face(s)' },
        { keys: [{ kind: 'text', text: 'Shift' }, leftButton], action: 'Add to selection' },
        { keys: [removeKey, leftButton], action: 'Remove from selection' },
        { keys: [{ kind: 'text', text: 'C' }], action: 'Clear selection' },
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
  return toggles[toggle].ref.value
}

/**
 * Flips the switch of a row.
 *
 * @param toggle The switch of the row.
 */
function flip(toggle: HelpToggle): void {
  toggles[toggle].ref.value = !toggles[toggle].ref.value
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
    return `Hide ${toggles[toggle].name}`
  }

  return `Show ${toggles[toggle].name}`
}
</script>

<template>
  <div class="HelpWidget">
    <WidgetHeading :label="props.label" />
    <section v-for="section in sections" :key="section.title" class="section">
      <h3 class="section-title">{{ section.title }}</h3>
      <dl>
        <template v-for="row in section.rows" :key="row.action">
          <dt>
            <template v-for="(key, index) in row.keys" :key="index">
              <span v-if="index > 0" class="plus">+</span>
              <component :is="icons[key.icon]" v-if="key.kind === 'icon'" class="key-icon" />
              <kbd v-else>{{ key.text }}</kbd>
            </template>
          </dt>
          <dd>
            <span class="action">{{ row.action }}</span>
            <button
              v-if="row.toggle !== undefined"
              class="visibility"
              :class="{ 'is-on': isOn(row.toggle) }"
              type="button"
              :aria-pressed="isOn(row.toggle)"
              :aria-label="buttonTitle(row.toggle)"
              v-tooltip="buttonTitle(row.toggle)"
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
@use '../infoRows' as *;

.HelpWidget {
  height: 100%;
  padding: 8px;

  // the sections follow each other with a small gap, the first one right under the title
  .section + .section {
    margin-top: 13px;
  }

  // the name of a section: the look of the widget title, a size smaller and without the weight
  .section-title {
    margin: 0 0 6px;
    padding: 0 6px 5px;
    border-bottom: 1px solid $border-dark;
    color: $text-icon;
    font-size: 11px;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

    &:hover {
      background: $surface-panel;
    }

    // only the eye turns orange: the frame stays the neutral border of every button
    &.is-on {
      color: $accent;
    }
  }

  .visibility-icon {
    width: 14px;
    height: 14px;
  }
}
</style>
