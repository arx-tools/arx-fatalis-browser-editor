<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import {
  ChevronDown,
  LayoutGrid,
  Maximize,
  RotateCcw,
  RotateCw,
  SquareCenterlineDashedHorizontal,
  SquareCenterlineDashedVertical,
} from 'lucide-vue-next'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetUvRecord } from '../../../modules/history/records.ts'
import { bumpLevelRevision, levelRevision, runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { bitmapOf, entryOfName, loadBitmap } from '../../../modules/textures/textureCatalog.ts'
import type { TextureEntry } from '../../../modules/textures/textureEntry.ts'
import Notice from '../../Notice.vue'
import NumberField from '../../NumberField.vue'
import ToolButton from '../../ToolButton.vue'
import {
  DEFAULT_ZOOM,
  mismatchMessageOf,
  centerOfUvs,
  cornerNameOf,
  perimeterOf,
  screenOfUv,
  maximizedUvs,
  quarteredUvs,
  turnedUvs,
  uvsOfFace,
  uvSelectionOf,
  type ShownFace,
  type UvView,
  type UvPoint,
  type UvTurn,
} from './uvMapper.ts'
import { useUvMapperDrag } from './useUvMapperDrag.ts'
import { useUvMapperFields } from './useUvMapperFields.ts'
import { useCornerList } from './useCornerList.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The line of the widget when it has no face to edit: what the user has to do, or why the selection can not be edited.
 */
const hint = shallowRef('Select one face to edit its texture coordinates.')

/**
 * The stage: the box the square is centered in.
 */
const stage = useTemplateRef<HTMLDivElement>('stage')

/**
 * The square itself: the texture, and the corners over it.
 */
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/**
 * The picture of the texture, when the editor could decode it.
 *
 * @remarks
 * The square is the texture: without a picture there is nothing to drag a corner on, so the widget shows only its line
 * instead of an empty frame (a frame that waits for a texture that may never come is the shape of a loaded texture that
 * is not loaded, which reads as a bug).
 */
const imageShown = shallowRef<ImageBitmap | undefined>(undefined)

/**
 * The face of the widget, or `undefined` when the selection is not one face.
 */
const shown = shallowRef<ShownFace | undefined>(undefined)

/**
 * Whether the face on the screen has no picture to edit: the level has no texture for it, or the editor has no file of
 * that one.
 *
 * @remarks
 * The square is the picture of the texture, so without a picture there is nothing to drag a corner on. The widget then
 * reads as the other selections it can not edit: the corners and the controls are not there, and the line under the
 * square says why (2026-11-14, the owner; before it the message sat in the middle of the stage over a collapsed face).
 */
const pictureMissing = shallowRef(false)

/**
 * What the widget says under the square: the line of the selection, or the lack of a picture.
 */
const notice = computed(() => {
  if (shown.value !== undefined && pictureMissing.value) {
    return 'The texture of this face is not loaded.'
  }

  return hint.value
})

/**
 * The uv of the corners of the face, as the model holds them.
 */
const corners = shallowRef<readonly UvPoint[]>([])

/**
 * Whether the face on the screen is a quad.
 *
 * @remarks
 * The two buttons of the footer that lay the corners in a quarter of the texture and over the whole of it work on the
 * four corners of a quad only (2026-11-06, the owner's request): a triangle has three, and there is no quarter of a
 * texture to give them.
 */
const isQuad = computed(() => {
  return shown.value !== undefined && corners.value.length === 4
})

/**
 * The side of the square, in pixels.
 */
const size = shallowRef(240)

/**
 * The zoom of the view: 1 shows the texture at the size of the square.
 */
const zoom = shallowRef(DEFAULT_ZOOM)

/**
 * The uv the square is centered on.
 *
 * @remarks
 * It is the middle of the face **when a face arrives** (a selection, a level, a reload) — `centerOnFace` —, and after
 * that it only moves when the texture is dragged or the wheel zooms: the corners move under a picture that stays, so
 * dragging the yellow of a face does not chase the view (2026-11-06, the owner's request).
 */
const center = shallowRef<UvPoint>({ u: 0.5, v: 0.5 })

/**
 * Whether the texture is being dragged.
 */
const panning = shallowRef(false)

/**
 * Whether the pointer rests on the yellow of the face: the canvas then shows the move cursor, and a press moves the
 * whole face instead of sliding the texture.
 */
const overFace = shallowRef(false)

/**
 * The corner the pointer drags, or `undefined` when nothing is dragged.
 */
const dragged = shallowRef<number | undefined>(undefined)

/**
 * The corner the caption reads: the one that was dragged last, so the numbers under the square stay on it.
 */
const active = shallowRef<number | undefined>(undefined)

/**
 * The frame a live change asked for, so a drag does not bump the views on every event of the pointer.
 */
let redrawFrame = 0

/**
 * What the view draws: the zoom, and the uv the square is centered on.
 */
const view = shallowRef<UvView>({ size: size.value, zoom: zoom.value, center: center.value })

/**
 * The corner handles, at their place on the square.
 */
const handles = shallowRef<Array<{ readonly index: number; readonly x: number; readonly y: number }>>([])

/**
 * The texture of the face, when the editor has the file of it.
 */
const entry = shallowRef<TextureEntry | undefined>(undefined)

/**
 * The name of the texture, for the caption of the widget.
 */
const textureName = shallowRef<string | undefined>(undefined)

/**
 * The name the caption of the widget shows: the file name of the texture when the editor has the file for it.
 *
 * @remarks
 * A level may name a texture without the extension (`[glass]_windows2`), while the file is `[glass]_windows2.jpg`: the
 * user needs to read the file it is, so the caption takes the name of the file the catalog found for the texture, and
 * only falls back to the name of the container when the editor has no file for it.
 */
const captionName = computed(() => {
  return entry.value?.name ?? textureName.value
})

/**
 * The zoom as the corner of the widget shows it.
 */
const zoomLabel = computed(() => {
  return `${zoom.value.toFixed(1)}×`
})

/**
 * Shows a selection the widget can not edit: its message, and the texture the faces are on.
 *
 * @remarks
 * The corner frame and the controls under the square are the tools of an edit, so they go, and the message takes their
 * place (2026-11-12, the owner: a selection that can not be edited still shows what it is painted with). A selection of
 * faces on one texture keeps the name and the picture.
 *
 * The view goes back to the whole texture: the corners that would place it are not there, so the zoom of the last face
 * says nothing about this selection, and the texture is looked at from its middle on the default zoom (2026-11-12, the
 * owner). The reset happens when the widget arrives at the message from an edit, or when the texture is another one: a
 * zoom the user makes **on** the message stays, so the wheel keeps working on a selection it can not edit.
 *
 * @param message What the widget says about the selection.
 * @param name The name of the texture the faces share, or `undefined` when they do not share one.
 */
function showMessage(message: string, name: string | undefined): void {
  const wasEditing = shown.value !== undefined
  const isNewTexture = textureName.value !== name

  shown.value = undefined
  corners.value = []
  hint.value = message
  textureName.value = name

  if (name === undefined) {
    entry.value = undefined
  } else {
    entry.value = entryOfName(name)
  }

  // the view is only worth placing when there is a texture to look at: a selection of faces on many textures has none
  if (name !== undefined && (wasEditing || isNewTexture)) {
    zoom.value = DEFAULT_ZOOM
    center.value = { u: 0.5, v: 0.5 }
  }
}

/**
 * Reads the selection and the corners of its faces.
 *
 * @remarks
 * The widget edits the uv of **one** face — or of **many faces that share their texture and their uv**: those are one
 * shape on the texture, so the drag moves the same corners on all of them ({@link uvSelectionOf}). A selection of faces
 * with different textures or different uv can not be edited together, and the widget says which of the two is the
 * reason ({@link mismatchMessageOf}).
 *
 * The uv of the corners is read from the model on every revision, so an undo of a drag lands on the widget too.
 */
function refresh(): void {
  const map = levelStore.map.value
  const indices = [...selectionStore.polygons.value]

  if (map === undefined) {
    showMessage('Select one face to edit its texture coordinates.', undefined)

    return
  }

  const selection = uvSelectionOf({
    indices,
    polygons: map.polygons,
    textureNameOf: (textureContainerId) => {
      return map.textureNameOf(textureContainerId)
    },
  })

  if (selection.kind === 'empty') {
    showMessage('Select one face to edit its texture coordinates.', undefined)

    return
  }

  if (selection.kind === 'mismatch') {
    showMessage(mismatchMessageOf(selection.reasons), selection.textureName)

    return
  }

  const polygon = map.polygons[selection.faces[0] ?? -1]

  if (polygon === undefined) {
    showMessage('Select one face to edit its texture coordinates.', undefined)

    return
  }

  const signature = selection.faces.join(',')
  const isNewFace = shown.value?.indices.join(',') !== signature

  shown.value = { map, indices: selection.faces, polygon }
  corners.value = selection.corners.map((corner) => {
    return { ...corner }
  })
  hint.value = ''

  // a new face is the one time the square goes back to the middle of the face: after that the picture stays where the
  // user left it (2026-11-06, the owner: the view must not chase a drag)
  if (isNewFace) {
    center.value = centerOfUvs(corners.value)
  }

  const name = map.textureNameOf(polygon.textureContainerId)

  textureName.value = name

  if (name === undefined) {
    entry.value = undefined
  } else {
    entry.value = entryOfName(name)
  }
}

/**
 * Draws the square: the texture (repeated, the way the game draws a tiled face), the border of the texture and the face.
 */
function draw(): void {
  const element = canvas.value
  const side = size.value

  if (element === null || side <= 0) {
    return
  }

  const context = element.getContext('2d')

  if (context === null) {
    return
  }

  const ratio = window.devicePixelRatio || 1

  element.width = Math.round(side * ratio)
  element.height = Math.round(side * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, side, side)

  const current = view.value
  const image = imageShown.value
  const scale = side * current.zoom

  context.imageSmoothingQuality = 'high'

  if (image !== undefined) {
    // the v of a level runs down the file, so the top left of a copy of the image is the uv of its own corner
    for (let column = -2; column <= 2; column = column + 1) {
      for (let row = -2; row <= 2; row = row + 1) {
        const at = screenOfUv(current, { u: column, v: row })

        context.drawImage(image, at.x, at.y, scale, scale)
      }
    }

    // the texture itself stays the bright one: the copies around it are darkened, so the eye reads the file and the
    // repeat apart (the copies are there because the game tiles a face with its texture)
    const topLeft = screenOfUv(current, { u: 0, v: 0 })

    context.fillStyle = 'rgba(12, 16, 21, 0.62)'
    context.fillRect(0, 0, side, side)
    context.drawImage(image, topLeft.x, topLeft.y, scale, scale)
  }

  // the border of the texture: what is outside of it is the repeat, not the file
  const topLeft = screenOfUv(current, { u: 0, v: 0 })

  context.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  context.lineWidth = 1
  context.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, scale, scale)

  // the face: the same translucent yellow as the selection fill of the 3D view
  if (corners.value.length >= 3) {
    // the perimeter of a quad is `a, b, d, c` (the stored order `a, b, c, d` crosses itself and draws a bow tie), and
    // `perimeterOf` is where that rule lives: the hit test of the press reads the same shape
    const points = perimeterOf(corners.value).map((index) => {
      return screenOfUv(current, corners.value[index] ?? { u: 0, v: 0 })
    })

    context.beginPath()
    context.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0)

    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y)
    }

    context.closePath()
    context.fillStyle = 'rgba(255, 255, 0, 0.35)'
    context.fill()
    context.strokeStyle = 'rgb(146, 196, 79)'
    context.lineWidth = 1.5
    context.stroke()
  }
}

/**
 * Turns the model write into a frame, so a drag of the pointer does not re-render the views on every event.
 *
 * @remarks
 * A frame that is already asked for is canceled and asked again: a browser that freezes a tab in the background may
 * drop the callback it owes, and the id would stay set forever, which would stop the views from following the mapper
 * (see the same guard in the fixed view).
 */
function requestRedraw(): void {
  if (redrawFrame !== 0) {
    cancelAnimationFrame(redrawFrame)
  }

  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = 0
    bumpLevelRevision()
  })
}

/**
 * Moves the view and the handles to the center, the zoom and the corners.
 *
 * @remarks
 * The view is the zoom and the uv the square is centered on — **not** the corners: a corner that moves stays on the
 * screen, and a face that is dragged does not drag the picture with it.
 */
function reframe(): void {
  const next: UvView = { size: size.value, zoom: zoom.value, center: center.value }

  view.value = next
  handles.value = corners.value.map((corner, index) => {
    const at = screenOfUv(next, corner)

    return { index, x: at.x, y: at.y }
  })

  draw()
}

const fields = useUvMapperFields({ corners, active, shown, reframe, requestRedraw })

const { fieldU, fieldV, invalidU, invalidV, onFieldInput, onFieldFocus, onFieldBlur, onFieldEnter } = fields

/**
 * Writes the text of a field, and applies it to the corner when it is a number the uv can take.
 *
 * @param axis The field that was typed in.
 * @param value The text of the field.
 */
function onUvFieldValue(axis: 'u' | 'v', value: string): void {
  if (axis === 'u') {
    fieldU.value = value
  } else {
    fieldV.value = value
  }

  onFieldInput(axis)
}

const drag = useUvMapperDrag({
  canvas,
  shown,
  corners,
  view,
  size,
  zoom,
  center,
  panning,
  overFace,
  dragged,
  active,
  reframe,
  requestRedraw,
})

const { onPointerDown, onPointerMove, onPointerUp, onPanStart, onPanMove, onPanEnd } = drag

/**
 * The corner the fields edit, as the list under the square shows it.
 *
 * @remarks
 * Picking a corner from the list is the way to edit a corner without the mouse: the drag sets the same one, so the two
 * ways meet on {@link active}. The list is drawn by the widget and not by the `select` of the browser: the items of a
 * native select are painted by the system on Firefox, so the colors of the corners never reached them (2026-11-09,
 * the owner's report).
 */
const {
  activeCornerNumber,
  chooseCorner,
  cornerListOpen,
  focusCornerItem,
  onCornerEscape,
  openCornerList,
  toggleCornerList,
} = useCornerList({
  active,
  reframe,
})

function placeCorners(next: UvPoint[]): void {
  const current = shown.value

  if (current === undefined) {
    return
  }

  const from = corners.value.map((corner) => {
    return { ...corner }
  })

  corners.value = next

  for (const face of current.indices) {
    current.map.setFaceUvs(face, uvsOfFace(corners.value))
  }

  reframe()
  requestRedraw()

  const command = commandOf(createSetUvRecord(current.indices, uvsOfFace(from), uvsOfFace(corners.value)), current.map)

  if (command !== undefined) {
    runStep(command)
  }
}

/**
 * Lays the corners of the face on other corners of it: the four buttons of the footer.
 *
 * @remarks
 * The uv values do not change, only which corner holds which: a texture that came in rotated or mirrored is fixed by
 * this, and the step goes on the history so the undo puts the corners back (2026-11-05, the owner).
 *
 * @param turn Which way to lay the corners.
 */
function onTurn(turn: UvTurn): void {
  placeCorners(turnedUvs(corners.value, turn))
}

/**
 * Lays the corners of a quad in one quarter of the texture, and takes them to the next quarter on every click.
 */
function onQuarter(): void {
  placeCorners(quarteredUvs(corners.value))
}

/**
 * Stretches the corners of a quad over the whole texture.
 */
function onMaximize(): void {
  placeCorners(maximizedUvs(corners.value))
}

/**
 * Fits the square to the box of the widget.
 */
function resize(): void {
  const box = stage.value?.getBoundingClientRect()

  if (box === null || box === undefined) {
    return
  }

  const side = Math.max(40, Math.min(box.width, box.height) - 8)

  if (Math.abs(side - size.value) < 1) {
    return
  }

  size.value = side
}

/**
 * The observer of the box of the widget.
 */
let observer: ResizeObserver | undefined

onMounted(() => {
  const box = stage.value

  if (box !== null) {
    observer = new ResizeObserver(() => {
      resize()
    })
    observer.observe(box)
    // the wheel must be able to stop the dock from scrolling: a passive listener may not
    box.addEventListener('wheel', drag.onWheel, { passive: false })
  }

  resize()
  reframe()
})

onBeforeUnmount(() => {
  observer?.disconnect()

  if (redrawFrame !== 0) {
    cancelAnimationFrame(redrawFrame)
  }
})

watch(
  [
    (): number => {
      return levelRevision.value
    },
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
    (): unknown => {
      return levelStore.map.value
    },
  ],
  () => {
    refresh()
    reframe()
  },
  { immediate: true },
)

watch(size, () => {
  reframe()
})

// a textúra képe: a katalógus dekódolja, a vászon azt rajzolja
watch(
  entry,
  async (value) => {
    imageShown.value = undefined
    pictureMissing.value = value === undefined

    if (value !== undefined) {
      await loadBitmap(value)
      imageShown.value = bitmapOf(value).value
      pictureMissing.value = imageShown.value === undefined

      // the square is not in the page while there is no picture (it is hidden with a `v-if`): the canvas of it can only be
      // drawn after the tick that puts it there
      await nextTick()
      reframe()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="UvMapperWidget">
    <div class="head">
      <h2 class="label">{{ props.label }}</h2>
      <span class="name">{{ captionName ?? 'no face' }}</span>
      <span v-if="shown !== undefined && shown.indices.length > 1" class="faces">{{ shown.indices.length }} faces</span>
      <span class="zoom">{{ zoomLabel }}</span>
    </div>

    <div ref="stage" class="stage">
      <div
        class="square"
        :class="{ 'is-empty': imageShown === undefined }"
        :style="{ width: `${size}px`, height: `${size}px` }"
      >
        <canvas
          v-if="imageShown !== undefined"
          ref="canvas"
          class="texture"
          :class="{ 'is-panning': panning, 'is-over-face': overFace }"
          :style="{ width: `${size}px`, height: `${size}px` }"
          @pointerdown="onPanStart"
          @pointermove="onPanMove"
          @pointerup="onPanEnd"
          @pointercancel="onPanEnd"
        ></canvas>
        <template v-if="imageShown !== undefined">
          <button
            v-for="handle in handles"
            :key="handle.index"
            class="corner"
            :class="{ 'is-dragged': dragged === handle.index, 'is-active': active === handle.index }"
            type="button"
            :data-corner="handle.index"
            :aria-label="`Corner ${cornerNameOf(handle.index)}`"
            :style="{ left: `${handle.x}px`, top: `${handle.y}px` }"
            @pointerdown="onPointerDown(handle.index, $event)"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <span class="index">{{ cornerNameOf(handle.index) }}</span>
          </button>
        </template>
      </div>
    </div>

    <Notice v-if="shown === undefined || pictureMissing" class="hint">{{ notice }}</Notice>
    <div v-else class="fields">
      <div class="corner-pick" @keydown.esc.stop="onCornerEscape()">
        <button
          ref="cornerTrigger"
          class="corner-select"
          type="button"
          :data-corner="activeCornerNumber"
          aria-haspopup="listbox"
          :aria-expanded="cornerListOpen"
          aria-label="Corner to edit"
          :disabled="shown === undefined"
          @click="toggleCornerList()"
          @keydown.down.prevent="openCornerList()"
          @keydown.up.prevent="openCornerList()"
        >
          {{ cornerNameOf(activeCornerNumber) }}
          <ChevronDown :size="10" />
        </button>
        <div v-if="cornerListOpen" ref="cornerList" class="corner-list" role="listbox" aria-label="Corners to edit">
          <button
            v-for="(_, index) in corners"
            :key="index"
            class="corner-item"
            type="button"
            role="option"
            :aria-selected="index === activeCornerNumber"
            :data-corner="index"
            @click="chooseCorner(index)"
            @keydown.down.prevent="focusCornerItem(index + 1)"
            @keydown.up.prevent="focusCornerItem(index - 1)"
          >
            {{ cornerNameOf(index) }}
          </button>
        </div>
      </div>
      <label class="field">
        <span class="axis">U</span>
        <NumberField
          :model-value="fieldU"
          :invalid="invalidU"
          label="U of the corner"
          :disabled="shown === undefined"
          @update:model-value="onUvFieldValue('u', $event)"
          @focus="onFieldFocus()"
          @blur="onFieldBlur"
          @keydown.enter.prevent="onFieldEnter"
        />
      </label>
      <label class="field">
        <span class="axis">V</span>
        <NumberField
          :model-value="fieldV"
          :invalid="invalidV"
          label="V of the corner"
          :disabled="shown === undefined"
          @update:model-value="onUvFieldValue('v', $event)"
          @focus="onFieldFocus()"
          @blur="onFieldBlur"
          @keydown.enter.prevent="onFieldEnter"
        />
      </label>
      <div v-if="shown !== undefined" class="turns">
        <ToolButton class="turn" label="Rotate counter-clockwise" @click="onTurn('rotate-ccw')">
          <RotateCcw :size="13" />
        </ToolButton>
        <ToolButton class="turn" label="Rotate clockwise" @click="onTurn('rotate-cw')">
          <RotateCw :size="13" />
        </ToolButton>
        <ToolButton class="turn" label="Flip horizontally" @click="onTurn('flip-h')">
          <SquareCenterlineDashedHorizontal :size="13" />
        </ToolButton>
        <ToolButton class="turn" label="Flip vertically" @click="onTurn('flip-v')">
          <SquareCenterlineDashedVertical :size="13" />
        </ToolButton>
        <!-- the two buttons of the quad: a face that draws a quarter of its texture, and one that draws all of it -->
        <ToolButton
          class="turn"
          label="Lay the corners in a quarter of the texture"
          tooltip="Lay the corners in a quarter of the texture (the next quarter on every click)"
          :disabled="!isQuad"
          @click="onQuarter"
        >
          <LayoutGrid :size="13" />
        </ToolButton>
        <ToolButton
          class="turn"
          label="Stretch the corners to the whole texture"
          :disabled="!isQuad"
          @click="onMaximize"
        >
          <Maximize :size="13" />
        </ToolButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./uvMapperWidget.scss"></style>
