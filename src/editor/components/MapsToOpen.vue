<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import {
  currentMapId,
  mapCount,
  mapEntryOf,
  mapGroups,
  openMap,
  MAP_GROUP_PREFIXES,
} from '../modules/level/source/maps.ts'

/**
 * The list of the maps the editor can open: choosing one opens it.
 *
 * @remarks
 * The list shows the map on the screen and a **change opens the chosen one**, in place (the page and the layout stay).
 * There is no question before it: the work of a level is the level's own — its history is put aside by the value of the
 * map and replayed when the map comes back — so a switch loses nothing, and a dialog in front of a plain choice would
 * only be in the way.
 *
 * A row is the **name** of the map, and nothing else: the dot that marked a map with changes was taken out (2026-11-04,
 * the owner's decision, TODO 120 in `CANCELLED.md`), and a styled `<option>` would need a dropdown of its own — the
 * browser draws the row of a native select.
 *
 * The **group** of the map is written before the control, not inside the row (2026-11-06, the owner's request): the
 * closed control reads `Blank: Flat Plane`, while the list under it is the bare names, cut into sections by the
 * `<optgroup>`s. A native select can not show one text closed and another open, so the prefix is a span of its own — the
 * border of the box around the two makes it read as one control.
 */
const selected = ref(currentMapId.value)

/**
 * The map the control shows, so its group can be written before it.
 */
const current = computed(() => {
  return mapEntryOf(selected.value, mapGroups.value)
})

/**
 * The name of the group of the chosen map, like `Blank`.
 */
const prefix = computed(() => {
  const entry = current.value

  if (entry === undefined) {
    return ''
  }

  return MAP_GROUP_PREFIXES[entry.group]
})

/**
 * What the whole control says, for a reader that can not see it: `Blank: Flat Plane`.
 */
const title = computed(() => {
  const entry = current.value

  if (entry === undefined) {
    return ''
  }

  return `${prefix.value}: ${entry.label}`
})

/**
 * The name of the select, with the map on the screen when the list has it.
 */
const ariaLabel = computed(() => {
  if (title.value === '') {
    return 'The maps the editor can open'
  }

  return `The maps the editor can open (${title.value})`
})

/**
 * Whether a map is on its way in: the changes of the list are ignored while one loads.
 */
const isLoading = ref(false)

/**
 * Opens the map the list moved to.
 *
 * @remarks
 * A map that does not load leaves the list on the map of the screen: the index can not show a level that is not there.
 */
async function choose(): Promise<void> {
  const wanted = selected.value

  if (wanted === currentMapId.value || isLoading.value) {
    return
  }

  isLoading.value = true

  try {
    await openMap(wanted)
  } finally {
    isLoading.value = false
  }

  if (currentMapId.value !== wanted) {
    selected.value = currentMapId.value
  }
}

// a map opened by something else of the editor (the zip of the header, the folder of the url) moves the list with it
watch(currentMapId, (id) => {
  selected.value = id
})
</script>

<template>
  <div class="MapsToOpen">
    <span class="label">Maps ({{ mapCount }})</span>
    <div class="list" :title="title">
      <!-- a map the list does not have (a level of a folder that is not there yet) has no row: the control shows only
           the empty box, the way it did before the group was written before the name -->
      <span v-if="prefix !== ''" class="group" aria-hidden="true">{{ prefix }}:</span>
      <select v-model="selected" :aria-label="ariaLabel" @change="choose">
        <optgroup v-for="group in mapGroups" :key="group.group" :label="group.label">
          <option v-for="entry in group.entries" :key="entry.id" :value="entry.id">
            {{ entry.label }}
          </option>
        </optgroup>
      </select>
      <ChevronDown class="chevron" :size="12" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.MapsToOpen {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    white-space: nowrap;
    opacity: 0.65;
  }

  // the group of the chosen map and the select read as one control: the box is the border of the row, and only the
  // select inside it is a control (that is what makes `Blank: Flat Plane` possible with a native select)
  .list {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding-left: 6px;
    color: $text;
    border: 1px solid $border;
    border-radius: 4px;

    &:hover {
      background: $surface-panel;
    }

    // the name of the group is a caption, not a choice: only the select under it can be opened. The space after its
    // colon is the gap of the row (the owner asked for `Blank: Flat Plane`, with the space always there)
    .group {
      color: $text-subtle;
      white-space: nowrap;
    }

    select {
      padding: 2px 18px 2px 0;
      color: $text;
      font: inherit;
      background: transparent;
      border: 0;
      border-radius: 4px;
      appearance: none;
      cursor: pointer;

      &:hover {
        background: $surface-panel;
      }
    }

    .chevron {
      position: absolute;
      right: 4px;
      pointer-events: none;
    }
  }
}
</style>
