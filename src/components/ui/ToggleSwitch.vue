<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  hotkey?: string
  disabled?: boolean
  /** draw the fixed width status slot (green check / spinning throbber) before the label */
  status?: boolean
  /** the worker is running: the slot shows a throbber instead of the check */
  busy?: boolean
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
    <span v-if="status" class="indicator">
      <span v-if="busy" class="throbber" />
      <span v-else class="check">✓</span>
    </span>
    <span class="label">{{ label }}</span>
    <span v-if="hotkey" class="hotkey">[{{ hotkey }}]</span>
  </button>
</template>

<style scoped lang="scss">
/* the same look as the level buttons of the header: dark, rounded, gold when active */
.indicator {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 11px;
  height: 11px;
  box-sizing: border-box;
}

.check {
  color: #35d84a;
  font-size: 12px;
  line-height: 1;
}

/* on the gold (active) button the green would disappear: inherit the button's text colour */
.toggle-switch.active .check {
  color: currentColor;
}

.throbber {
  box-sizing: border-box;
  flex: none;
  width: 9px;
  height: 9px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: toggle-switch-spin 0.7s linear infinite;
}

@keyframes toggle-switch-spin {
  to {
    transform: rotate(360deg);
  }
}

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

    /* the grey hover of the dark button would wash the gold away */
    &:hover:not(:disabled) {
      background: linear-gradient(#e9c95f, #bb9326);
    }

    &:active:not(:disabled) {
      background: linear-gradient(#c9a63f, #9a7718);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
</style>
