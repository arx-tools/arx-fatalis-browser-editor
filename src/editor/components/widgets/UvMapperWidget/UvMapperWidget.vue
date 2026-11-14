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
import {
  DEFAULT_ZOOM,
  mismatchMessageOf,
  centreOfUvs,
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
 * The stage: the box the square is centred in.
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
 * The uv the square is centred on.
 *
 * @remarks
 * It is the middle of the face **when a face arrives** (a selection, a level, a reload) — `centreOnFace` —, and after
 * that it only moves when the texture is dragged or the wheel zooms: the corners move under a picture that stays, so
 * dragging the yellow of a face does not chase the view (2026-11-06, the owner's request).
 */
const centre = shallowRef<UvPoint>({ u: 0.5, v: 0.5 })

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
 * What the view draws: the zoom, and the uv the square is centred on.
 */
const view = shallowRef<UvView>({ size: size.value, zoom: zoom.value, centre: centre.value })

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
    centre.value = { u: 0.5, v: 0.5 }
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
    centre.value = centreOfUvs(corners.value)
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
 */
function requestRedraw(): void {
  if (redrawFrame !== 0) {
    return
  }

  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = 0
    bumpLevelRevision()
  })
}

/**
 * Moves the view and the handles to the centre, the zoom and the corners.
 *
 * @remarks
 * The view is the zoom and the uv the square is centred on — **not** the corners: a corner that moves stays on the
 * screen, and a face that is dragged does not drag the picture with it.
 */
function reframe(): void {
  const next: UvView = { size: size.value, zoom: zoom.value, centre: centre.value }

  view.value = next
  handles.value = corners.value.map((corner, index) => {
    const at = screenOfUv(next, corner)

    return { index, x: at.x, y: at.y }
  })

  draw()
}

const fields = useUvMapperFields({ corners, active, shown, reframe, requestRedraw })

const { fieldU, fieldV, onFieldInput, onFieldFocus, onFieldBlur, onFieldEnter } = fields

const drag = useUvMapperDrag({
  canvas,
  shown,
  corners,
  view,
  size,
  zoom,
  centre,
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
 * native select are painted by the system on Firefox, so the colours of the corners never reached them (2026-11-09,
 * the owner's report).
 */
const activeCornerNumber = computed((): number => {
  return active.value ?? 0
})

/**
 * Whether the list of the corners is open.
 */
const cornerListOpen = shallowRef(false)

/**
 * The list of the corners, when it is open.
 */
const cornerList = useTemplateRef<HTMLDivElement>('cornerList')

/**
 * The button that opens the list: the focus goes back to it when the list closes.
 */
const cornerTrigger = useTemplateRef<HTMLButtonElement>('cornerTrigger')

/**
 * Puts the focus on an item of the list, the way the arrows walk it.
 *
 * @param index The position of the item to focus; it stays inside the list when the walk runs over an end.
 */
function focusCornerItem(index: number): void {
  const items = cornerList.value?.querySelectorAll<HTMLElement>('.corner-item')

  if (items === undefined) {
    return
  }

  const at = Math.min(Math.max(index, 0), items.length - 1)

  items[at]?.focus()
}

/**
 * Opens the list, with the focus on the corner the fields hold.
 */
async function openCornerList(): Promise<void> {
  cornerListOpen.value = true

  await nextTick()
  focusCornerItem(activeCornerNumber.value)
}

/**
 * Closes the list.
 */
function closeCornerList(): void {
  cornerListOpen.value = false
}

/**
 * Opens the list, or closes it when it is open.
 */
function toggleCornerList(): void {
  if (cornerListOpen.value) {
    closeCornerList()

    return
  }

  openCornerList()
}

/**
 * Takes a corner from the list, and gives the focus back to the button.
 *
 * @param index The corner the list offered.
 */
function chooseCorner(index: number): void {
  active.value = index
  closeCornerList()
  reframe()
  cornerTrigger.value?.focus()
}

/**
 * Closes the list on the escape key, and gives the focus back to the button.
 */
function onCornerEscape(): void {
  if (!cornerListOpen.value) {
    return
  }

  closeCornerList()
  cornerTrigger.value?.focus()
}

/**
 * Closes the list when the pointer lands outside the button and the list.
 *
 * @remarks
 * The listener is on the document, in the capture phase, so a press anywhere closes the list before the page handles it:
 * a corner of the square, a field, or the walkable view.
 *
 * @param event The press of the pointer, anywhere on the page.
 */
function onDocumentPointerDown(event: PointerEvent): void {
  const { target } = event

  if (!(target instanceof Node)) {
    return
  }

  if (cornerList.value?.contains(target) === true || cornerTrigger.value?.contains(target) === true) {
    return
  }

  closeCornerList()
}

// the listener of the outside click only lives while the list is open
watch(cornerListOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocumentPointerDown, { capture: true })

    return
  }

  document.removeEventListener('pointerdown', onDocumentPointerDown, { capture: true })
})

/**
 * Writes the corners of the face, and makes the change a step of the history.
 *
 * @remarks
 * The faces of a selection that share their corners all take the same layout, the way a drag of one corner moves all of
 * them; the step goes on the history, so the undo puts the corners back. The four turns and the two buttons of the
 * footer share this: they only work out the corners they want.
 *
 * @param next The corners the face takes.
 */
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
  document.removeEventListener('pointerdown', onDocumentPointerDown, { capture: true })

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
      <span class="name">{{ textureName ?? 'no face' }}</span>
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

    <p v-if="shown === undefined || pictureMissing" class="hint">{{ notice }}</p>
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
        <input
          v-model="fieldU"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          aria-label="U of the corner"
          :disabled="shown === undefined"
          @focus="onFieldFocus()"
          @input="onFieldInput('u')"
          @blur="onFieldBlur"
          @keydown.enter.prevent="onFieldEnter"
        />
      </label>
      <label class="field">
        <span class="axis">V</span>
        <input
          v-model="fieldV"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          aria-label="V of the corner"
          :disabled="shown === undefined"
          @focus="onFieldFocus()"
          @input="onFieldInput('v')"
          @blur="onFieldBlur"
          @keydown.enter.prevent="onFieldEnter"
        />
      </label>
      <div v-if="shown !== undefined" class="turns">
        <button
          class="turn"
          type="button"
          aria-label="Rotate counter-clockwise"
          v-tooltip="'Rotate counter-clockwise'"
          @click="onTurn('rotate-ccw')"
        >
          <RotateCcw :size="13" />
        </button>
        <button
          class="turn"
          type="button"
          aria-label="Rotate clockwise"
          v-tooltip="'Rotate clockwise'"
          @click="onTurn('rotate-cw')"
        >
          <RotateCw :size="13" />
        </button>
        <button
          class="turn"
          type="button"
          aria-label="Flip horizontally"
          v-tooltip="'Flip horizontally'"
          @click="onTurn('flip-h')"
        >
          <SquareCenterlineDashedHorizontal :size="13" />
        </button>
        <button
          class="turn"
          type="button"
          aria-label="Flip vertically"
          v-tooltip="'Flip vertically'"
          @click="onTurn('flip-v')"
        >
          <SquareCenterlineDashedVertical :size="13" />
        </button>
        <!-- the two buttons of the quad: a face that draws a quarter of its texture, and one that draws all of it -->
        <button
          class="turn"
          type="button"
          aria-label="Lay the corners in a quarter of the texture"
          v-tooltip="'Lay the corners in a quarter of the texture (the next quarter on every click)'"
          :disabled="!isQuad"
          @click="onQuarter"
        >
          <LayoutGrid :size="13" />
        </button>
        <button
          class="turn"
          type="button"
          aria-label="Stretch the corners to the whole texture"
          v-tooltip="'Stretch the corners to the whole texture'"
          :disabled="!isQuad"
          @click="onMaximize"
        >
          <Maximize :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The uv mapper: the texture of the selected face as a square, with the face on it. The square takes the room the
// widget has, the caption stays under it.
.UvMapperWidget {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 8px;
  overflow: hidden;
}

// The head of the widget: the name of the widget on the left, the **texture of the face** in the middle and the zoom on
// the right (2026-11-05, the owner: they were in the footer, where the uv numbers are the thing to read).
.head {
  display: grid;
  // the label, the name, the count of the faces and the zoom: the two `1fr` sides centre the name, and the zoom is
  // placed on the last column by itself (the count is only there for a selection of many faces, and the columns must not
  // shift when it is missing)
  grid-template-columns: 1fr auto auto 1fr;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 6px;
  padding: 0 6px 5px;
  border-bottom: 1px solid $border-dark;
  font-size: 12px;

  .label {
    grid-column: 1;
    margin: 0;
    overflow: hidden;
    color: $text-strong;
    font-size: 12px;
    font-weight: bold;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // every text of the head is the light of the label (2026-11-09, the owner's request): the name of the texture, the
  // count of the faces and the zoom used to be dimmer, and they are read as the same line as the name of the widget
  .name {
    grid-column: 2;
    overflow: hidden;
    color: $text-strong;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .faces {
    grid-column: 3;
    color: $text-strong;
    font-size: 10px;
    white-space: nowrap;
  }

  .zoom {
    grid-column: 4;
    color: $text-strong;
    font-size: 11px;
    justify-self: end;
    white-space: nowrap;
  }
}

.stage {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

// the window of the widget: a corner dragged (or panned) out of it is out of the window too, so the handles do not
// wander over the heading of the widget — panning brings the face back
.square {
  position: relative;
  flex: 0 0 auto;
  border: 1px solid $border-dark;
  background: $surface-app;
  overflow: hidden;

  // without a picture the square is only the frame of the place the texture would be: the line under the widget reads as
  // the caption of that place, and not as a sentence that lost its middle (2026-11-12, the owner)
  &.is-empty {
    border-color: $border;
    background: none;
  }
}

.texture {
  display: block;
  cursor: grab;
  touch-action: none;

  &.is-over-face {
    cursor: move;
  }

  &.is-panning {
    cursor: grabbing;
  }
}

// A corner of the face: a round handle with its **number** in it, and one colour per corner (2026-11-05, the owner:
// four green dots can not be told apart). The palette has four hues that are far enough: the ok green, the interactive
// blue, the accent orange and the marker red.
.corner {
  position: absolute;
  display: grid;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  padding: 0;
  place-items: center;
  border: 2px solid $surface-widget;
  border-radius: 50%;
  background: $ok;
  box-shadow: 0 0 0 1px rgba($ink, 0.45);
  cursor: grab;
  touch-action: none;

  &[data-corner='1'] {
    background: $interactive;
  }

  &[data-corner='2'] {
    background: $accent;
  }

  &[data-corner='3'] {
    background: $marker;
  }

  .index {
    color: $surface-widget;
    font-size: 9px;
    font-weight: bold;
    line-height: 1;
    pointer-events: none;
  }

  // the corner the fields edit (a drag or the list) carries a ring, and the one under the hand a wider one
  &.is-active {
    border-color: $text-strong;
    box-shadow: 0 0 0 2px $text-strong;
  }

  &.is-dragged {
    cursor: grabbing;
  }
}

// the line of a selection the widget can not edit: it takes the place of the controls under the square, so the numbers
// of the fields and the six buttons of an edit are not there to read as something that works (2026-11-12, the owner)
.hint {
  margin: 0;
  padding: 6px 2px;
  color: $text-dim;
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
}

// the two numbers of the corner, as fields: they can be selected and pasted, which is how a uv of a face of the game is
// written into another one
.fields {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  color: $text-muted;
  font-size: 11px;

  .corner-pick {
    position: relative;
    flex: 0 0 auto;
  }

  .corner-select {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text-icon;
    font: inherit;
    font-size: 11px;
    cursor: pointer;

    &:focus-visible {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }

  // The list of the corners is drawn by the widget: the items of a native select are painted by the system on Firefox,
  // so the colours of the corners never reached them (2026-11-09, the owner's report). It opens upwards, over the square,
  // so it stays inside the widget.
  .corner-list {
    position: absolute;
    z-index: 20;
    bottom: calc(100% + 2px);
    left: 0;
    display: flex;
    flex-direction: column;
    padding: 2px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-float;
    box-shadow: 0 6px 18px rgba($ink, 0.55);
  }

  .corner-item {
    padding: 3px 8px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: $text;
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 1px solid $interactive;
      outline-offset: -1px;
    }
  }

  // the button of the list and its items carry the colour of the handle on the square (A green, B blue, C orange and D
  // red, the hues of the handles), and the text on them is the dark of a widget
  .corner-select,
  .corner-item {
    &[data-corner='0'] {
      background: $ok;
      color: $surface-widget;
    }

    &[data-corner='1'] {
      background: $interactive;
      color: $surface-widget;
    }

    &[data-corner='2'] {
      background: $accent;
      color: $surface-widget;
    }

    &[data-corner='3'] {
      background: $marker;
      color: $surface-widget;
    }
  }

  .field {
    display: inline-flex;
    align-items: center;
    gap: 3px;

    .axis {
      color: $text-subtle;
      font-size: 10px;
    }

    input {
      box-sizing: border-box;
      width: 62px;
      padding: 2px 4px;
      border: 1px solid $border-dark;
      border-radius: 4px;
      background: $surface-panel;
      color: $text;
      font: inherit;
      font-size: 11px;
      font-variant-numeric: tabular-nums;

      &:focus {
        border-color: $interactive;
        outline: 1px solid $interactive;
      }

      &:disabled {
        opacity: 0.45;
      }
    }
  }

  // the four turns of the corners, right aligned: the same small buttons as the grid switch of a fixed view
  .turns {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .turn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    padding: 0;
    color: $text-icon;
    background: $surface-panel;
    border: 1px solid $border-dark;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: $text-strong;
      background: $surface-widget;
    }

    // the two buttons of the quad are off for a triangle
    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
}
</style>
