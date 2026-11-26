<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { textureKeyOf, textureSelectionStore } from '../../../modules/selection/textureSelectionStore.ts'
import {
  MATERIAL_ALIASES,
  materialLabelOf,
  materialOf,
  TEXTURE_MATERIALS,
  type TextureMaterial,
} from '../../../modules/textures/material.ts'
import { paintSelectedFaces } from '../../../modules/textures/paintTextures.ts'
import {
  filteredEntries,
  TEXTURE_GROUPS,
  type TextureFilter,
  type TextureGroup,
} from '../../../modules/textures/search.ts'
import {
  addDroppedTextures,
  entryOfName,
  loadPictures,
  textureCatalog,
} from '../../../modules/textures/textureCatalog.ts'
import type { TextureEntry } from '../../../modules/textures/textureEntry.ts'
import EmptyMessage from '../../EmptyMessage.vue'
import TextureThumb from '../../TextureThumb.vue'
import SearchField from '../../SearchField.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import { createRevealGate, revealRowIn } from '../shared/revealRow.ts'
import { TEXTURES_PER_PAGE, texturePageOf } from './textureMapper.ts'

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
 * The scroller of the tiles, so a new page can start at its top.
 */
const list = useTemplateRef<HTMLDivElement>('list')

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
 * The keys of the textures the selected faces draw with.
 *
 * @remarks
 * The list shows the texture a paint would touch: the faces of the selection name their textures, and the tiles of them
 * are marked the way the 3D views mark a pick (2026-11-25, the owner: the Texture Mapper should read the selection the
 * way the UV Mapper does).
 */
const usedKeys = computed<ReadonlySet<string>>(() => {
  const keys = new Set<string>()
  const map = levelStore.map.value

  if (map === undefined) {
    return keys
  }

  for (const index of selectionStore.polygons.value) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    const name = map.textureNameOf(polygon.textureContainerId)

    if (name === undefined) {
      continue
    }

    const entry = entryOfName(name)

    if (entry !== undefined) {
      keys.add(textureKeyOf(entry))
    }
  }

  return keys
})

/**
 * Tells whether a texture of the list is marked: the picked one, or one the selected faces draw with.
 *
 * @param entry The texture of a tile.
 *
 * @returns True when the tile takes the yellow of the selection.
 */
function isSelected(entry: TextureEntry): boolean {
  const key = textureKeyOf(entry)
  const picked = textureSelectionStore.texture.value

  if (picked !== undefined && textureKeyOf(picked) === key) {
    return true
  }

  return usedKeys.value.has(key)
}

/**
 * The frame that waits for the list to draw the page the reveal went to.
 *
 * @returns A promise that resolves on the next frame.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

/**
 * How many frames a reveal follows the box for.
 *
 * @remarks
 * The dock gives a widget its size after the widget is attached: the first scroll reads the box of the moment, and the
 * passes after it read the box the author has.
 */
const REVEAL_PASSES = 3

/**
 * The reveal that is being worked out, so a pick that moves on takes the last one away.
 */
let revealToken = 0

/**
 * The gate of the reveal: a click on a tile does not move the list.
 */
const revealGate = createRevealGate()

/**
 * Reads the tile of a texture the list drew.
 *
 * @param texture The texture to find.
 *
 * @returns The tile of the texture, or `null` while the page is not on the screen.
 */
function tileElementOf(texture: TextureEntry): HTMLElement | null {
  const element = list.value

  if (element === null) {
    return null
  }

  const key = textureKeyOf(texture)

  for (const tile of element.querySelectorAll<HTMLElement>(':scope [data-texture-key]')) {
    if (tile.dataset.textureKey === key) {
      return tile
    }
  }

  return null
}

/**
 * Puts the picked texture on the screen: clears the filter that hides it, turns to its page, and scrolls to its tile.
 *
 * @remarks
 * The owner asked for a pick to find its list (2026-11-25): a texture of the selected faces, a row of the Selection
 * Inspector, is on the screen of the list. The filter that hides the texture is cleared, because the author picked a
 * texture to see it, and the list turns to the page the texture is on; the tile is already highlighted by the store.
 * A tile that is on the screen stays where it is.
 */
async function revealSelectedTexture(): Promise<void> {
  const token = revealToken + 1

  revealToken = token

  const texture = textureSelectionStore.texture.value

  if (texture === undefined) {
    return
  }

  const key = textureKeyOf(texture)
  const entries = textureCatalog.entries.value
  const inCatalog = entries.some((entry) => {
    return textureKeyOf(entry) === key
  })

  // a texture the list does not carry (a missing texture of the level) has no tile to go to
  if (!inCatalog) {
    return
  }

  const visible = filteredEntries(entries, filter.value).some((entry) => {
    return textureKeyOf(entry) === key
  })

  if (!visible) {
    query.value = ''
    material.value = 'all'
    group.value = 'all'
  }

  // the filter puts the list back on its first page, and the page of the texture is the one it is on: the model settles
  // on the next tick
  await nextTick()

  const filtered = filteredEntries(textureCatalog.entries.value, filter.value)
  const position = filtered.findIndex((entry) => {
    return textureKeyOf(entry) === key
  })

  if (position === -1) {
    return
  }

  page.value = Math.floor(position / TEXTURES_PER_PAGE) + 1

  await nextTick()

  for (let pass = 0; pass < REVEAL_PASSES; pass++) {
    if (token !== revealToken) {
      return
    }

    revealRowIn(list.value, tileElementOf(texture))

    await nextFrame()
  }
}

// a pick of the walkable view's faces (the selection inspector) and a click in this list both write the same store
watch(
  () => {
    return textureSelectionStore.texture.value
  },
  () => {
    if (revealGate.take()) {
      return
    }

    revealSelectedTexture().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  },
)

onMounted(() => {
  // a widget that arrives with a texture picked (a preset switch, a drag into the dock) shows it: the dock builds the
  // widget before it lays it out, so the reveal waits a frame for the box
  requestAnimationFrame(() => {
    revealSelectedTexture().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  })
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
    await loadPictures(current.entries)
  },
  { immediate: true },
)

// a narrower list is a shorter list: the page starts again, so the list is never empty by accident
watch([query, material, group], () => {
  page.value = 1
})

// a new page starts at the top: the tiles are read from the first one, and the scroll of the page that was left would
// hide them (the pages are the same height, so the browser keeps the position by itself)
watch(
  () => {
    return shown.value.page
  },
  () => {
    if (list.value !== null) {
      list.value.scrollTop = 0
    }
  },
  { flush: 'post' },
)

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
 * Picks a texture, and paints the selected faces with it.
 *
 * @remarks
 * The click of a tile is two things (2026-11-25, the owner): the texture the faces take, which the store holds and the
 * tile shows as picked, and the paint of the selected faces. The name of a tile is a text the user can select (the file
 * name is worth copying), and the drag that selects it ends with a click on the tile: the click of a selection paints
 * nothing, or the faces would take a texture the user did not ask for.
 *
 * @param entry The texture of the tile that was clicked.
 */
async function paint(entry: TextureEntry): Promise<void> {
  // the tiles are idle while nothing is selected: there is no face to paint, and the pick of a texture belongs to the
  // faces of the selection (2026-11-25, the owner: a click on an idle tile picked a texture that nothing could clear)
  if (selected.value === 0) {
    return
  }

  revealGate.suppress()
  textureSelectionStore.select(entry)

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
    class="TextureMapperWidget"
    :class="{ 'is-drop-target': isDropTarget }"
    @dragenter.prevent
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <WidgetHeading :label="props.label">
      <template #actions>
        <span class="total">Total: {{ textureCatalog.entries.value.length }}</span>
      </template>
    </WidgetHeading>

    <p class="info">Click to replace textures on selected faces.</p>

    <div class="filters">
      <SearchField v-model="query" placeholder="Search textures" label="Search textures" />
      <select v-model="material" aria-label="Filter by material">
        <option v-for="option in materials" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <select v-model="group" aria-label="Filter by source">
        <option v-for="option in TEXTURE_GROUPS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>

    <div ref="list" class="list">
      <!-- the tile is a div: a button of the browser does not let the pointer select the text of a name, and the name is
           a file name the user copies (2026-11-16, the owner) -->
      <div
        v-for="entry in shown.entries"
        :key="`${entry.source}:${entry.name}`"
        class="tile"
        :class="{ 'is-selected': isSelected(entry) }"
        role="button"
        :tabindex="selected === 0 ? undefined : 0"
        :aria-disabled="selected === 0 ? 'true' : undefined"
        :data-texture-key="textureKeyOf(entry)"
        v-tooltip="titleOf(entry)"
        @click="paint(entry)"
        @keydown.enter.prevent="paint(entry)"
        @keydown.space.prevent="paint(entry)"
      >
        <TextureThumb class="thumb" :entry="entry" />
        <span class="name">{{ entry.name }}</span>
      </div>
    </div>

    <EmptyMessage v-if="shown.total === 0 && textureCatalog.entries.value.length > 0">
      No texture matches the search.
    </EmptyMessage>
    <EmptyMessage v-else-if="textureCatalog.entries.value.length === 0">The level has no textures.</EmptyMessage>

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
.TextureMapperWidget {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 0 8px 8px;
  font-size: 12px;
}

// the count of the list sits in the heading, on the right, the way the entity list and the light inspector keep theirs
.total {
  color: $text-muted;
  font-size: 11px;
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

  // the field takes the width the row gives it, the select stays beside it
  .SearchField {
    flex: 1 1 120px;
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
  // the search row keeps a breath before the list (2026-11-22, the owner: the rows touched the field), and the tiles
  // stop before the scrollbar the way the rows of the other lists do
  margin-top: 20px;
  padding: 2px 10px 2px 6px;
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

  // the pointer takes the panel of the rows of the lists (2026-11-25, the owner: the white hover was a family of its
  // own), and the name comes forward on it; the picked tile keeps the accent, its dark text, and no hover of its own:
  // a selected row is not hovered, and a second look under the pointer would read as neither state
  &:hover:not([aria-disabled='true']):not(.is-selected) {
    background: $surface-panel;

    .name {
      color: $text;
    }
  }

  // a tile is a div, so the frame of the focus is drawn here (the browser draws one for a button by itself)
  &:focus-visible {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }

  // a tile without a selection does nothing, but it is not dimmed: the textures read the same either way
  &[aria-disabled='true'] {
    cursor: default;
  }

  // the picked texture, and the textures of the selected faces: the full accent of the picked rows, with the dark text of
  // a chip, so a tile reads as picked even when its picture is dark (2026-11-25, the owner: the yellow belongs to the
  // 3D view)
  &.is-selected {
    border-color: $accent;
    background: $accent;
    color: $surface-widget;
    cursor: default;

    .name {
      color: $surface-widget;
    }
  }

  .thumb {
    width: 100%;
    max-width: 64px;
    aspect-ratio: 1;
    border-radius: 3px;
  }

  // the name is a caption, not a file to copy (2026-11-25, the owner: the ellipsis cuts it anyway): the text of a tile is
  // not a selection of its own, so a drag on the list never leaves a selected word behind
  .name {
    display: -webkit-box;
    width: 100%;
    overflow: hidden;
    color: $text-muted;
    line-height: 1.15;
    user-select: none;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
  }
}

// the pager: the range of the page, with the two buttons of the neighboring pages
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
