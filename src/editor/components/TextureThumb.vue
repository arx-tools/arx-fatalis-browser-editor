<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { bitmapOf } from '../modules/textures/textureCatalog.ts'
import type { TextureEntry } from '../modules/textures/textureEntry.ts'

/**
 * The picture of a texture of the list, drawn into a canvas.
 *
 * @remarks
 * The tile of the texture mapper and the row of the selection inspector show the picture of a texture. It is a **canvas**
 * and not a background of a data url: the picture of a texture the level draws with is decoded already, and the canvas is
 * drawn from it in the frame the tile appears. A png encoded for a data url would be decoded again by the browser for the
 * background, and the tile would show its placeholder until that happened (2026-11-26, the owner).
 *
 * The size of the canvas comes from the widget it stands in (the `.thumb` class of the tile or of the row), and the
 * picture is {@link PICTURE_SIZE} square: a tile shows a texture at 64 pixels, the row of the inspector at 20.
 */
const props = defineProps<{
  /**
   * The texture whose picture the canvas shows, or `undefined` when the level has no file for it.
   */
  readonly entry: TextureEntry | undefined
}>()

/**
 * The side of the canvas, in pixels: the largest a tile shows a texture at.
 */
const PICTURE_SIZE = 64

const canvas = ref<HTMLCanvasElement>()

/**
 * Whether the canvas has the picture of the texture: the placeholder of the widget shows until it does.
 */
const drawn = ref(false)

/**
 * Draws the picture of the texture, or leaves the canvas empty for the placeholder.
 */
function draw(): void {
  const target = canvas.value

  if (target === undefined) {
    return
  }

  const context = target.getContext('2d')

  if (context === null) {
    return
  }

  let picture: ImageBitmap | undefined

  if (props.entry !== undefined) {
    picture = bitmapOf(props.entry).value
  }

  context.clearRect(0, 0, PICTURE_SIZE, PICTURE_SIZE)
  drawn.value = picture !== undefined

  if (picture === undefined) {
    return
  }

  context.imageSmoothingQuality = 'high'
  context.drawImage(picture, 0, 0, PICTURE_SIZE, PICTURE_SIZE)
}

onMounted(draw)

// the picture of a texture of the game arrives after the tile: the canvas is drawn again when it is decoded
watch(() => {
  const { entry } = props

  if (entry === undefined) {
    return undefined
  }

  return bitmapOf(entry).value
}, draw)
</script>

<template>
  <canvas
    ref="canvas"
    class="TextureThumb"
    :class="{ 'is-drawn': drawn }"
    :width="PICTURE_SIZE"
    :height="PICTURE_SIZE"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the placeholder of a texture that is not decoded yet: the grey and the border of the tile, in the box the widget
// gives the canvas (`border-box` keeps the border inside it, so the drawn picture does not move the layout)
.TextureThumb {
  display: block;
  box-sizing: border-box;
  background: $surface-panel;
  border: 1px solid $border-dark;
  border-radius: 3px;

  &.is-drawn {
    background: transparent;
    border: 0;
  }
}
</style>
