<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  hotkey?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <button
    type="button"
    class="toggle-switch"
    :class="{ active: modelValue }"
    :disabled="disabled"
    :aria-pressed="modelValue"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="label">{{ label }}</span>
    <span v-if="hotkey" class="hotkey">[{{ hotkey }}]</span>
  </button>
</template>

<style scoped lang="scss">
/* the same look as the level buttons of the header: dark, rounded, gold when active */
.toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #1a1717;
  border-radius: 5px;
  background: #4a4444;
  color: #e2d8d8;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow:
    inset 0 1px 2px rgb(0 0 0 / 60%),
    inset 0 -1px 1px rgb(255 255 255 / 8%),
    0 1px 0 rgb(255 255 255 / 6%);

  .hotkey {
    color: #a89a9a;
    font-family: monospace;
  }

  &:hover:not(:disabled) {
    background: #595151;
  }

  &:active:not(:disabled) {
    box-shadow: inset 0 2px 4px rgb(0 0 0 / 70%);
  }

  &.active {
    border-color: #e5c766;
    background: linear-gradient(#d8b44a, #a9821f);
    color: #2c2828;
    font-weight: bold;
    box-shadow:
      0 1px 3px rgb(0 0 0 / 60%),
      0 0 8px rgb(216 180 74 / 45%),
      inset 0 1px 0 rgb(255 255 255 / 45%);

    .hotkey {
      color: #4a3a10;
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
</style>
