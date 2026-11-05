<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import WidgetHeading from '../../WidgetHeading.vue'
import {
  drawnPerSecondOf,
  FRAME_WINDOW_MS,
  frameRateOf,
  renderPerformanceRows,
  renderPerformanceStore,
  ROWS_INTERVAL_MS,
  type RenderCounters,
  type RenderPerformanceRow,
  type RenderPerformanceSample,
} from '../shared/renderPerformance.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The rows of the readout.
 */
const rows = shallowRef<RenderPerformanceRow[]>(renderPerformanceRows())

/**
 * The timestamps of the animation frames of the last window, oldest first.
 */
const timestamps: number[] = []

let animationFrame = 0
let lastDrawSample: { frames: number; at: number } | undefined
let drawnPerSecond = 0
let lastRowsAt = 0

/**
 * Reads the counters of the last frame the walkable view drew.
 *
 * @returns The counters, or `undefined` while no walkable view is on the dock.
 */
function countersOf(): RenderCounters | undefined {
  const renderer = renderPerformanceStore.renderer.value

  if (renderer === undefined) {
    return undefined
  }

  const { calls, triangles, frame } = renderer.info.render

  return { calls, triangles, frames: frame }
}

/**
 * Builds the sample of the current moment.
 *
 * @param counters The counters of the renderer.
 *
 * @returns What the rows need, or `undefined` while there is no renderer.
 */
function sampleOf(counters: RenderCounters | undefined): RenderPerformanceSample | undefined {
  const renderer = renderPerformanceStore.renderer.value

  if (renderer === undefined || counters === undefined) {
    return undefined
  }

  const rate = frameRateOf(timestamps)
  const canvas = renderer.domElement

  return {
    fps: rate.fps,
    frameTimeMs: rate.frameTimeMs,
    drawnPerSecond,
    counters,
    pixelRatio: renderer.getPixelRatio(),
    width: canvas.width,
    height: canvas.height,
  }
}

/**
 * Samples the frame rate and the renderer, and draws the rows now and then.
 *
 * @param now The timestamp the browser gave the frame.
 */
function tick(now: number): void {
  timestamps.push(now)

  while (timestamps.length > 0 && now - (timestamps[0] ?? now) > FRAME_WINDOW_MS) {
    timestamps.shift()
  }

  const counters = countersOf()

  if (counters === undefined) {
    lastDrawSample = undefined
    drawnPerSecond = 0
  } else {
    const previous = lastDrawSample

    lastDrawSample = { frames: counters.frames, at: now }

    if (previous !== undefined) {
      drawnPerSecond = drawnPerSecondOf(previous, lastDrawSample)
    }
  }

  if (now - lastRowsAt >= ROWS_INTERVAL_MS) {
    lastRowsAt = now
    rows.value = renderPerformanceRows(sampleOf(counters))
  }

  animationFrame = requestAnimationFrame(tick)
}

// a renderer that arrives later (the 3D view mounts after the dock) starts a fresh measurement
watch(renderPerformanceStore.renderer, () => {
  lastDrawSample = undefined
  drawnPerSecond = 0
  timestamps.length = 0
})

onMounted(() => {
  animationFrame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (animationFrame !== 0) {
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }
})
</script>

<template>
  <div class="RenderPerformanceWidget">
    <WidgetHeading :label="props.label" />
    <dl>
      <template v-for="row in rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../shared/infoRows' as *;

.RenderPerformanceWidget {
  height: 100%;
  padding: 8px;

  @include info-list;
}
</style>
