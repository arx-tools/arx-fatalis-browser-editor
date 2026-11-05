<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { currentMapId, mapCount, mapGroups, openMap } from '../modules/level/source/maps.ts'

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
 */
const selected = ref(currentMapId.value)

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
    <span class="label">Maps to open ({{ mapCount }})</span>
    <div class="list">
      <select v-model="selected" aria-label="The maps the editor can open" @change="choose">
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

  .list {
    position: relative;
    display: inline-flex;
    align-items: center;

    select {
      padding: 2px 18px 2px 6px;
      color: $text;
      font: inherit;
      background: transparent;
      border: 1px solid $border;
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
