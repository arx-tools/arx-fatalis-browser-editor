<script setup lang="ts">
import type { ArxColor } from 'arx-convert/types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ColorSwatch from '../../ColorSwatch.vue'
import { colorOfHsl, hslOfColor, type LightHsl } from './lightEditor.ts'

/**
 * The three sliders of a color: the hue, the saturation and the lightness of the light.
 *
 * @remarks
 * The light of the LLF is RGB, and the sliders are HSL: the author turns the hue, and the widget writes the RGB the game
 * reads. The swatch and the hex are the color the parent holds; a new color from the parent (another light, an undo)
 * puts the sliders back on it, while the color the sliders made does not move them.
 */
const props = defineProps<{
  /**
   * The color of the light.
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
 * The color the sliders would make now.
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
 * The color of the swatch, in the way CSS writes it.
 */
const cssColor = computed(() => {
  return `rgb(${String(props.modelValue.r)} ${String(props.modelValue.g)} ${String(props.modelValue.b)})`
})

/**
 * The size of the patch, in pixels: the height of the sliders beside it.
 *
 * @remarks
 * The patch is a square, as tall as the three sliders (2026-11-23, the owner). The height of the sliders comes from
 * the browser (the range inputs are taller in Firefox than in Chromium), and the `aspect-ratio` of a stretched flex
 * item resolves to a zero width in some Firefox builds, so the height is measured and the width follows it (2026-11-23).
 */
const patchSize = ref(52)

/**
 * The column of the sliders, whose height the patch takes.
 */
const slidersElement = ref<HTMLElement | null>(null)

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    const height = entry?.contentRect.height

    if (height !== undefined && height > 0) {
      patchSize.value = height
    }
  })

  if (slidersElement.value !== null) {
    resizeObserver.observe(slidersElement.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
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
 * Turns one part of the picker, and gives the parent the color it makes.
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
    <div class="swatch" :style="{ width: `${String(patchSize)}px` }">
      <ColorSwatch :color="cssColor" fill :radius="4" border="strong" />
    </div>
    <div ref="slidersElement" class="sliders">
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
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.LightColorPicker {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;

  // the patch is as tall as the three sliders, and a square: the height comes from the row, the width from the
  // measured height of the sliders (the aspect-ratio of a stretched item is not reliable in Firefox)
  .swatch {
    flex: none;
    align-self: stretch;
  }

  .sliders {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .part {
    display: grid;
    grid-template-columns: 10px 1fr 26px;
    align-items: center;
    gap: 6px;
  }

  .name {
    color: $text-muted;
    font-size: 11px;
  }

  .value {
    color: $text-muted;
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
