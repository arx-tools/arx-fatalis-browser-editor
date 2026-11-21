<script setup lang="ts">
import type { ArxColor } from 'arx-convert/types'
import { computed, ref, watch } from 'vue'
import ColorSwatch from '../../ColorSwatch.vue'
import { colorOfHsl, hslOfColor, type LightHsl } from './lightEditor.ts'

/**
 * The three sliders of a colour: the hue, the saturation and the lightness of the light.
 *
 * @remarks
 * The light of the LLF is RGB, and the sliders are HSL: the author turns the hue, and the widget writes the RGB the game
 * reads. The swatch and the hex are the colour the parent holds; a new colour from the parent (another light, an undo)
 * puts the sliders back on it, while the colour the sliders made does not move them.
 */
const props = defineProps<{
  /**
   * The colour of the light.
   */
  readonly modelValue: ArxColor
}>()

const emit = defineEmits<{
  'update:modelValue': [color: ArxColor]
  change: []
}>()

/**
 * The three sliders, as the picker shows them.
 */
const hsl = ref<LightHsl>(hslOfColor(props.modelValue))

/**
 * The colour the sliders would make now.
 */
const ownColor = computed(() => {
  return colorOfHsl(hsl.value)
})

watch(
  () => {
    return props.modelValue
  },
  (color) => {
    const own = ownColor.value

    if (color.r !== own.r || color.g !== own.g || color.b !== own.b) {
      hsl.value = hslOfColor(color)
    }
  },
)

/**
 * The colour of the swatch, in the way CSS writes it.
 */
const cssColor = computed(() => {
  return `rgb(${String(props.modelValue.r)} ${String(props.modelValue.g)} ${String(props.modelValue.b)})`
})

/**
 * The colour of the swatch, in the way the author writes it.
 */
const hexColor = computed(() => {
  const channels = [props.modelValue.r, props.modelValue.g, props.modelValue.b].map((channel) => {
    return channel.toString(16).padStart(2, '0')
  })

  return `#${channels.join('').toUpperCase()}`
})

/**
 * Reads a number of a slider.
 *
 * @param event The event of the slider.
 *
 * @returns The value of the slider.
 */
function numberOfEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

/**
 * Turns one part of the picker, and gives the parent the colour it makes.
 *
 * @param part The part the author moved.
 * @param value The value of the slider.
 */
function setPart(part: 'h' | 's' | 'l', value: number): void {
  hsl.value = { ...hsl.value, [part]: value }
  emit('update:modelValue', colorOfHsl(hsl.value))
}
</script>

<template>
  <div class="LightColorPicker">
    <div class="head">
      <ColorSwatch :color="cssColor" :size="18" :radius="3" border="strong" />
      <span class="hex">{{ hexColor }}</span>
    </div>
    <label class="part">
      <span class="name">H</span>
      <input
        type="range"
        min="0"
        max="360"
        step="1"
        :value="hsl.h"
        aria-label="Hue"
        @input="setPart('h', numberOfEvent($event))"
        @change="emit('change')"
      />
      <span class="value">{{ hsl.h }}</span>
    </label>
    <label class="part">
      <span class="name">S</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="hsl.s"
        aria-label="Saturation"
        @input="setPart('s', numberOfEvent($event))"
        @change="emit('change')"
      />
      <span class="value">{{ hsl.s }}</span>
    </label>
    <label class="part">
      <span class="name">L</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="hsl.l"
        aria-label="Lightness"
        @input="setPart('l', numberOfEvent($event))"
        @change="emit('change')"
      />
      <span class="value">{{ hsl.l }}</span>
    </label>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.LightColorPicker {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hex {
    color: $text-muted;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .part {
    display: grid;
    grid-template-columns: 10px 1fr 26px;
    align-items: center;
    gap: 6px;
  }

  .name {
    color: $text-dim;
    font-size: 11px;
  }

  .value {
    color: $text-dim;
    font-size: 11px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
  }
}
</style>
