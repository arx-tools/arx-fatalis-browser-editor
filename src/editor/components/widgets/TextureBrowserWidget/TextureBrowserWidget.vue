<script setup lang="ts">
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-vue-next'
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import {
  MATERIAL_ALIASES,
  materialLabelOf,
  materialOf,
  TEXTURE_MATERIALS,
  type TextureMaterial,
} from '../../../modules/textures/material.ts'
import { paintSelectedFaces } from '../../../modules/textures/paintTextures.ts'
import { TEXTURE_GROUPS, type TextureFilter, type TextureGroup } from '../../../modules/textures/search.ts'
import {
  addDroppedTextures,
  loadThumbnails,
  textureCatalog,
  thumbnailOf,
} from '../../../modules/textures/textureCatalog.ts'
import type { TextureEntry } from '../../../modules/textures/textureEntry.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { texturePageOf } from './textureBrowser.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The search field, so a drop can leave the focus on the list.
 */
const root = useTemplateRef<HTMLDivElement>('root')

/**
 * What the user typed into the search field.
 */
const query = ref('')

/**
 * The element of the search field, so the clear button can put the focus back on it.
 */
const searchField = useTemplateRef<HTMLInputElement>('searchField')

/**
 * Selects the whole text of the search field when it takes the focus.
 *
 * @remarks
 * A filter is typed over: the author wants the next word to replace the one that is there, and a click that leaves the
 * caret in the middle of the word makes that a delete of half of it. The selection puts the whole word in the field,
 * ready to be typed over (2026-11-12, the owner).
 *
 * @param event The focus of the field.
 */
function selectAllOf(event: FocusEvent): void {
  const field = event.currentTarget

  if (field instanceof HTMLInputElement) {
    field.select()
  }
}

/**
 * Empties the search field, and leaves the focus on it.
 *
 * @remarks
 * The clear button is the end of the field: the pointer is already there, and the next word is typed right away.
 */
function clearSearch(): void {
  query.value = ''
  searchField.value?.focus()
}

/**
 * The material the list is narrowed to, or `all`.
 */
const material = ref<TextureMaterial | 'all'>('all')

/**
 * The group of the list (the game's materials, its items, or the level's own), or `all`.
 */
const group = ref<TextureGroup | 'all'>('all')

/**
 * Whether the pointer of a drag is over the widget: the drop zone covers the list while it is.
 */
const isDropTarget = ref(false)

/**
 * The page of the list, counted from one.
 */
const page = shallowRef(1)

/**
 * The filter the list is read with.
 */
const filter = computed<TextureFilter>(() => {
  return { query: query.value, material: material.value, group: group.value }
})

/**
 * What the list shows now: the filter, and the page of it.
 */
const shown = computed(() => {
  return texturePageOf(textureCatalog.entries.value, filter.value, page.value)
})

/**
 * How many faces are selected: the info of the widget, and the switch of the tiles.
 */
const selected = computed(() => {
  return selectionStore.count.value
})

/**
 * The materials of the filter, with the aliases the game gives them.
 *
 * @remarks
 * The aliases are worth reading: the game hears a `[rock]_…` as stone and a `[shit]_…` as wet, so a filter of the names
 * alone would not find them (see `modules/textures/material.ts`).
 */
const materials = computed(() => {
  return [
    { value: 'all' as const, label: 'All materials' },
    ...TEXTURE_MATERIALS.map((name) => {
      const aliases = MATERIAL_ALIASES.find((row) => {
        return row.material === name
      })?.aliases

      let label = materialLabelOf(name)

      if (aliases !== undefined) {
        label = `${label}: ${aliases.join(', ')}`
      }

      return { value: name, label }
    }),
  ]
})

// the thumbnails of the page are read when the page is shown: a hundred of them, a few at a time
watch(
  shown,
  async (current) => {
    await loadThumbnails(current.entries)
  },
  { immediate: true },
)

// a narrower list is a shorter list: the page starts again, so the list is never empty by accident
watch([query, material, group], () => {
  page.value = 1
})

/**
 * The thumbnail of a texture, if it is read already.
 *
 * @param entry The texture of a tile.
 *
 * @returns The data url of the thumbnail, or `undefined` while the tile shows a placeholder.
 */
function thumbOf(entry: TextureEntry): string | undefined {
  return thumbnailOf(entry).value
}

/**
 * The title of a tile: the name, the material the game hears and where the texture comes from.
 *
 * @param entry The texture of a tile.
 *
 * @returns The line a hover shows.
 */
function titleOf(entry: TextureEntry): string {
  let where = 'Custom'

  if (entry.source === 'arx') {
    where = 'Arx Fatalis'
  }

  return `${entry.name}: ${materialLabelOf(materialOf(entry.name))}, ${where}`
}

/**
 * Paints the selected faces with a texture.
 *
 * @param entry The texture of the tile that was clicked.
 */
async function paint(entry: TextureEntry): Promise<void> {
  await paintSelectedFaces(entry)
}

/**
 * Turns the drag into a drop target while the pointer is over the widget.
 *
 * @param event The drag event of the page.
 */
function onDragOver(event: DragEvent): void {
  // a drop is only allowed on an element that says so, and the widget says it while the drag is over it
  if (event.dataTransfer?.types.includes('Files') === true) {
    event.preventDefault()
    isDropTarget.value = true
  }
}

/**
 * Puts the drop zone away when the drag leaves the widget.
 *
 * @param event The drag event of the page.
 */
function onDragLeave(event: DragEvent): void {
  const next = event.relatedTarget as Node | null

  // a drag over a child of the widget is not a drag out of it: the zone stays while the pointer is inside
  if (next !== null && root.value?.contains(next) === true) {
    return
  }

  isDropTarget.value = false
}

/**
 * Adds the dropped files to the textures the level can be painted with.
 *
 * @param event The drop event of the page.
 */
async function onDrop(event: DragEvent): Promise<void> {
  isDropTarget.value = false

  const files = [...(event.dataTransfer?.files ?? [])]
  const added = await addDroppedTextures(files)

  if (added === 0) {
    return
  }

  // the list jumps to where the new textures are: the custom group of the level, from the first page
  group.value = 'custom'
  query.value = ''
  page.value = 1
}
</script>

<template>
  <div
    ref="root"
    class="TextureBrowserWidget"
    :class="{ 'is-drop-target': isDropTarget }"
    @dragenter.prevent
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <WidgetHeading :label="props.label" />

    <p class="info">Click to replace textures on selected faces.</p>

    <div class="filters">
      <label class="search">
        <Search :size="12" class="icon" />
        <input
          ref="searchField"
          v-model="query"
          type="search"
          placeholder="Search textures"
          aria-label="Search textures"
          @focus="selectAllOf"
        />
        <button
          v-if="query !== ''"
          class="clear"
          type="button"
          aria-label="Empty the search"
          @click.prevent="clearSearch"
        >
          <X :size="12" />
        </button>
      </label>
      <select v-model="material" aria-label="Filter by material">
        <option v-for="option in materials" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <select v-model="group" aria-label="Filter by source">
        <option v-for="option in TEXTURE_GROUPS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>

    <div class="list">
      <button
        v-for="entry in shown.entries"
        :key="`${entry.source}:${entry.name}`"
        class="tile"
        type="button"
        :title="titleOf(entry)"
        :disabled="selected === 0"
        @click="paint(entry)"
      >
        <img v-if="thumbOf(entry) !== undefined" class="thumb" :src="thumbOf(entry)" alt="" />
        <span v-else class="thumb placeholder" aria-hidden="true"></span>
        <span class="name">{{ entry.name }}</span>
      </button>
    </div>

    <div class="pager">
      <button type="button" aria-label="Previous page" :disabled="shown.page <= 1" @click="page = shown.page - 1">
        <ChevronLeft :size="14" />
      </button>
      <span class="range">{{ shown.label }}</span>
      <button
        type="button"
        aria-label="Next page"
        :disabled="shown.page >= shown.pageCount"
        @click="page = shown.page + 1"
      >
        <ChevronRight :size="14" />
      </button>
    </div>

    <div v-if="isDropTarget" class="drop-zone">
      <span>Drop textures here</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The list of the textures a face can be painted with: the filter on top, the tiles in the middle (the
// part that scrolls) and the pager under them. The widget fills the space the dock gives it, so a bigger
// window shows more tiles and not a bigger tile.
.TextureBrowserWidget {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 8px;
  font-size: 12px;
}

// the line that says what a click does: it is always there, and the tiles look the same with and without a
// selection (the owner asked for no dimming: the picture of a texture is the point, not whether a face is taken)
.info {
  margin: 0;
  padding: 0 6px;
  color: $text-muted;
  font-size: 11px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 6px;

  .search {
    position: relative;
    display: inline-flex;
    flex: 1 1 120px;
    align-items: center;
    min-width: 110px;

    .icon {
      position: absolute;
      left: 6px;
      color: $text-subtle;
      pointer-events: none;
    }

    // the browser draws its own clear button for a search field, and it would sit next to the one of the widget: the
    // one of the widget is the button of every browser
    input::-webkit-search-cancel-button,
    input::-webkit-search-decoration {
      appearance: none;
    }

    // the clear button of the field: the quiet grey of an icon, the bright text under the pointer
    .clear {
      position: absolute;
      right: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: $text-subtle;
      background: none;
      border: 0;
      cursor: pointer;

      &:hover {
        color: $text;
      }
    }

    input {
      box-sizing: border-box;
      width: 100%;
      // the room of the two icons of the field: the glass on the left, the clear button on the right
      padding: 3px 22px 3px 22px;
      border: 1px solid $border-dark;
      border-radius: 4px;
      background: $surface-panel;
      color: $text;
      font: inherit;

      &:focus {
        border-color: $interactive;
        outline: 1px solid $interactive;
      }
    }
  }

  select {
    padding: 3px 6px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    cursor: pointer;

    &:hover {
      border-color: $border;
    }
  }
}

// the tiles: a grid of squares, each one a texture of the filtered list. It scrolls inside the widget, so
// the pager under it stays where it is whatever the page holds.
.list {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
  gap: 4px;
  padding: 2px 6px;
  overflow-y: auto;
  align-content: start;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: 3px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: $text;
  font: inherit;
  font-size: 9px;
  text-align: center;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: $border-strong;
    background: $surface-panel;
  }

  // a tile without a selection does nothing, but it is not dimmed: the textures read the same either way
  &:disabled {
    cursor: default;
  }

  .thumb {
    display: block;
    width: 100%;
    max-width: 64px;
    aspect-ratio: 1;
    border-radius: 3px;
    object-fit: cover;
    image-rendering: auto;
  }

  .placeholder {
    border: 1px solid $border-dark;
    background: $surface-panel;
  }

  .name {
    display: -webkit-box;
    width: 100%;
    overflow: hidden;
    color: $text-muted;
    line-height: 1.15;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
  }
}

// the pager: the range of the page, with the two buttons of the neighbouring pages
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 6px;

  button {
    display: inline-flex;
    align-items: center;
    padding: 2px 4px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text-icon;
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: $border;
      color: $text-strong;
    }

    &:disabled {
      cursor: default;
      opacity: 0.4;
    }
  }

  .range {
    color: $text-muted;
    font-variant-numeric: tabular-nums;
  }
}

// the drop zone: it covers the widget while a file of the page is dragged over it, so the whole widget is the target
.drop-zone {
  position: absolute;
  inset: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed $interactive;
  border-radius: 6px;
  background: rgba($surface-app, 0.85);
  color: $text-strong;
  font-size: 13px;
  pointer-events: none;
}
</style>
