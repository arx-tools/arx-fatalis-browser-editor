<script setup lang="ts">
import { computed } from 'vue'
import { Eye } from 'lucide-vue-next'
import FieldLabel from '../../FieldLabel.vue'
import ToggleButton from '../../ToggleButton.vue'
import { isNormalsVisible } from '../shared/levelDisplay.ts'
import { faceNormalsVisible, vertexNormalsVisible } from '../shared/normalsOverlay.ts'

/**
 * What a click on the power switch does, for the tooltip.
 *
 * @remarks
 * The label of the switch names it for the screen reader; the tooltip says the next step, the way every other switch of
 * the dock does.
 */
const powerTooltip = computed<string>(() => {
  if (isNormalsVisible.value) {
    return 'Hide the normals'
  }

  return 'Show the normals'
})

/**
 * The text of the tooltip of the vertex normals: what the next click does.
 */
const vertexTooltip = computed<string>(() => {
  if (vertexNormalsVisible.value) {
    return 'Hide the vertex normals'
  }

  return 'Show the vertex normals'
})

/**
 * The text of the tooltip of the face normals: what the next click does.
 */
const faceTooltip = computed<string>(() => {
  if (faceNormalsVisible.value) {
    return 'Hide the face normals'
  }

  return 'Show the face normals'
})

/**
 * Writes the switch of the normals.
 *
 * @param value Whether the normals should be drawn.
 */
function setVisible(value: boolean): void {
  isNormalsVisible.value = value
}

/**
 * Writes the switch of the vertex normals.
 *
 * @param value Whether the corner normals should be drawn.
 */
function setVertex(value: boolean): void {
  vertexNormalsVisible.value = value
}

/**
 * Writes the switch of the face normals.
 *
 * @param value Whether the face normals should be drawn.
 */
function setFace(value: boolean): void {
  faceNormalsVisible.value = value
}
</script>

<template>
  <div class="NormalsWidget">
    <!-- the switch of the layer: the `N` flips the same ref, so the key help's eye and this button are one switch -->
    <FieldLabel class="field" inline label="Normals">
      <ToggleButton :pressed="isNormalsVisible" label="Normals" :tooltip="powerTooltip" @update:pressed="setVisible">
        <Eye :size="14" aria-hidden="true" />
      </ToggleButton>
    </FieldLabel>

    <!-- the two layers: independent switches, the way the snap types are, so the author can show either or both. Both
    off is a state of its own: the switch of the normals is on, and nothing is drawn. The buttons wait while the
    normals are off -->
    <FieldLabel class="field types-field" inline label="Mode" :class="{ 'is-disabled': !isNormalsVisible }">
      <div class="types" role="group" aria-label="Normals to show">
        <div class="type-row">
          <span class="type-label">Vertex</span>
          <ToggleButton
            :pressed="vertexNormalsVisible"
            label="Vertex normals"
            :tooltip="vertexTooltip"
            :disabled="!isNormalsVisible"
            @update:pressed="setVertex"
          >
            <Eye :size="14" aria-hidden="true" />
          </ToggleButton>
        </div>
        <div class="type-row">
          <span class="type-label">Face</span>
          <ToggleButton
            :pressed="faceNormalsVisible"
            label="Face normals"
            :tooltip="faceTooltip"
            :disabled="!isNormalsVisible"
            @update:pressed="setFace"
          >
            <Eye :size="14" aria-hidden="true" />
          </ToggleButton>
        </div>
      </div>
    </FieldLabel>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The normals of the walkable view: the switch of the layer and the choice of its lines, the way the snapping settings
// show theirs (2026-11-23, the owner): a caption beside every switch, and the two layers as the rows of the snap types.
// The widget is content-sized and has no heading of its own (the dock says its name), so the rows keep it thin.
.NormalsWidget {
  display: grid;
  grid-template-columns: max-content;
  justify-content: center;
  align-content: center;
  gap: 4px;
  height: 100%;
  padding: 2px 4px;
  overflow: auto;
  font-size: 13px;

  // the two layers: a column of label and power button rows, the labels on one width so the buttons line up
  .types {
    display: grid;
    gap: 2px;
  }

  .type-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-label {
    flex: none;
    width: 40px;
    color: $text;
    line-height: 1;
    white-space: nowrap;
  }

  .types-field.is-disabled .type-label {
    opacity: 0.45;
  }
}
</style>
