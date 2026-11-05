<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import type { ArxPolygon } from 'arx-convert/types'
import { RotateCcw, RotateCw, SquareCenterlineDashedHorizontal, SquareCenterlineDashedVertical } from 'lucide-vue-next'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { commandOf, createSetUvRecord } from '../../../modules/history/records.ts'
import { bumpLevelRevision, levelRevision, runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import { bitmapOf, entryOfName, loadBitmap } from '../../../modules/textures/textureCatalog.ts'
import type { TextureEntry } from '../../../modules/textures/textureEntry.ts'
import {
  DEFAULT_ZOOM,
  mismatchMessageOf,
  movedCorner,
  pannedBy,
  sameUvs,
  screenOfUv,
  snappedPoint,
  turnedUvs,
  uvsOfFace,
  uvOfScreen,
  uvSelectionOf,
  viewOf,
  zoomAfter,
  type StagePoint,
  type UvPoint,
  type UvTurn,
} from './uvMapper.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * What the widget edits: the faces of the selection that share their texture and their uv, and the one set of corners.
 */
interface ShownFace {
  /**
   * The level the faces belong to.
   */
  readonly map: ArxMap
  /**
   * The faces, all of them drawing with the same corners on the same texture.
   */
  readonly indices: readonly number[]
  /**
   * The first of them: the one the caption names the texture by.
   */
  readonly polygon: ArxPolygon
}

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
 * The face of the widget, or `undefined` when the selection is not one face.
 */
const shown = shallowRef<ShownFace | undefined>(undefined)

/**
 * The uv of the corners of the face, as the model holds them.
 */
const corners = shallowRef<readonly UvPoint[]>([])

/**
 * The side of the square, in pixels.
 */
const size = shallowRef(240)

/**
 * The zoom of the view: 1 shows the texture at the size of the square.
 */
const zoom = shallowRef(DEFAULT_ZOOM)

/**
 * How far the view was dragged away from the face, in uv units.
 *
 * @remarks
 * The zoom of the widget turns around the face, so a zoomed view only ever shows the neighbourhood of the face. The drag
 * of the **texture** (not a corner) slides the whole view, the way a map is dragged: what is under the hand stays under
 * it. A new face starts again in the middle.
 */
const pan = shallowRef<UvPoint>({ u: 0, v: 0 })

/**
 * Whether the texture is being dragged.
 */
const panning = shallowRef(false)

/**
 * Where the drag of the texture started, in pixels of the square.
 */
let panFrom: StagePoint | undefined

/**
 * The corner the pointer drags, or `undefined` when nothing is dragged.
 */
const dragged = shallowRef<number | undefined>(undefined)

/**
 * The corner the caption reads: the one that was dragged last, so the numbers under the square stay on it.
 */
const active = shallowRef<number | undefined>(undefined)

/**
 * The corners the drag started from, so the step can be undone to the state before it.
 */
let dragStart: readonly UvPoint[] | undefined

/**
 * The frame a live change asked for, so a drag does not bump the views on every event of the pointer.
 */
let redrawFrame = 0

/**
 * What the view draws: the corners of the face in the middle of the square.
 */
const view = shallowRef(viewOf(size.value, zoom.value, corners.value, pan.value))

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
 * The text of the two uv fields, as the user types it.
 *
 * @remarks
 * The fields follow the corners except the one that holds the focus (a half typed number would be overwritten by the
 * model on every frame of a drag), the same way the camera form follows the pose.
 */
const fieldU = ref('')
const fieldV = ref('')

/**
 * Which field the user is typing into, if any.
 */
const focusedField = shallowRef<'u' | 'v' | undefined>(undefined)

/**
 * The corners the typing started from, so the change is one step of the history (like a drag).
 */
let fieldStart: readonly UvPoint[] | undefined

/**
 * Empties the widget: no face, no texture.
 */
function clear(): void {
  shown.value = undefined
  corners.value = []
  entry.value = undefined
  textureName.value = undefined
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
    clear()
    hint.value = 'Select one face to edit its texture coordinates.'

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
    clear()
    hint.value = 'Select one face to edit its texture coordinates.'

    return
  }

  if (selection.kind === 'mismatch') {
    clear()
    hint.value = mismatchMessageOf(selection.reasons)

    return
  }

  const polygon = map.polygons[selection.faces[0] ?? -1]

  if (polygon === undefined) {
    clear()
    hint.value = 'Select one face to edit its texture coordinates.'

    return
  }

  const signature = selection.faces.join(',')
  const isNewFace = shown.value?.indices.join(',') !== signature

  shown.value = { map, indices: selection.faces, polygon }
  corners.value = selection.corners.map((corner) => {
    return { ...corner }
  })
  hint.value = ''

  if (isNewFace) {
    pan.value = { u: 0, v: 0 }
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
  const texture = entry.value
  let image: ImageBitmap | undefined

  if (texture !== undefined) {
    image = bitmapOf(texture).value
  }

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
    // the four corners of a quad are **not** around it: `a` and `b` are one edge and `c` and `d` the one across, so the
    // perimeter is `a, b, d, c` (the stored order `a, b, c, d` crosses itself and draws a bow tie)
    let order = [0, 1, 2]

    if (corners.value.length === 4) {
      order = [0, 1, 3, 2]
    }

    const points = order.map((index) => {
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
 * Writes the numbers of a corner into the two fields, except the one the user is typing into.
 *
 * @param corner The corner the fields show.
 */
function syncFields(corner: UvPoint): void {
  if (focusedField.value !== 'u') {
    fieldU.value = corner.u.toFixed(3)
  }

  if (focusedField.value !== 'v') {
    fieldV.value = corner.v.toFixed(3)
  }
}

/**
 * Moves the view and the handles to the corners and the zoom.
 */
function reframe(): void {
  const next = viewOf(size.value, zoom.value, corners.value, pan.value)

  view.value = next
  handles.value = corners.value.map((corner, index) => {
    const at = screenOfUv(next, corner)

    return { index, x: at.x, y: at.y }
  })

  const shownCorner = dragged.value ?? active.value ?? 0
  const corner = corners.value[shownCorner]

  if (corner !== undefined) {
    syncFields(corner)
  }

  draw()
}

/**
 * The corner the fields edit, as the select under the square shows it.
 *
 * @remarks
 * Picking a corner from the list is the way to edit a corner without the mouse: the drag sets the same one, so the two
 * ways meet on {@link active}.
 */
const activeCorner = computed({
  get: (): string => {
    return String(active.value ?? 0)
  },
  set: (value: string): void => {
    active.value = Number(value)
    reframe()
  },
})

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
 * Reads the pointer in the pixels of the square.
 *
 * @param event The pointer event of the handle.
 *
 * @returns The place of the pointer, from the top left of the square.
 */
function pointOf(event: PointerEvent): { x: number; y: number } {
  const box = canvas.value?.getBoundingClientRect()

  if (box === undefined) {
    return { x: 0, y: 0 }
  }

  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

/**
 * Takes a corner for the drag.
 *
 * @param index The corner of the handle.
 * @param event The press that starts the drag.
 */
function onPointerDown(index: number, event: PointerEvent): void {
  const current = shown.value

  if (current === undefined) {
    return
  }

  event.preventDefault()
  ;(event.currentTarget as Element | null)?.setPointerCapture(event.pointerId)
  dragged.value = index
  active.value = index
  dragStart = corners.value.map((corner) => {
    return { ...corner }
  })
  reframe()
}

/**
 * Moves the dragged corner, and the model with it, so the 3D view follows the drag.
 *
 * @param event The position of the drag.
 */
function onPointerMove(event: PointerEvent): void {
  const index = dragged.value
  const current = shown.value

  if (index === undefined || current === undefined) {
    return
  }

  event.preventDefault()

  // with the shift held, the corner is laid on the nearest 45 degree ray of the drag: a wall's texture is as wide as the
  // wall above it, not a degree off (2026-11-05, the owner)
  const origin = dragStart?.[index]
  let target = pointOf(event)

  if (origin !== undefined && event.shiftKey) {
    target = snappedPoint(screenOfUv(view.value, origin), target)
  }

  corners.value = movedCorner(corners.value, index, uvOfScreen(view.value, target))

  for (const face of current.indices) {
    current.map.setFaceUvs(face, uvsOfFace(corners.value))
  }

  reframe()
  requestRedraw()
}

/**
 * Reads a number a user typed into a field.
 *
 * @remarks
 * An empty field, a lone minus or a half typed decimal is **not** a number: the model is left alone until the text is
 * one (an empty string would be a zero, and the corner would jump to the corner of the texture on the first keystroke of
 * a new number). A comma is read as the decimal point, the way a Hungarian keyboard writes it.
 *
 * @param text The text of the field.
 *
 * @returns The number, or `undefined` when the text is not one.
 */
function numberOf(text: string): number | undefined {
  const clean = text.trim().replace(',', '.')

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(clean)) {
    return undefined
  }

  const value = Number(clean)

  if (!Number.isFinite(value)) {
    return undefined
  }

  return value
}

/**
 * Puts a typed uv into the model, when both fields hold a number.
 *
 * @remarks
 * The two fields are one edit: a corner has two numbers, and a half typed one (an empty field, a comma) leaves the model
 * alone. The value is kept inside the texture, like the drag.
 */
function applyFields(): void {
  const index = active.value ?? 0
  const current = shown.value
  const u = numberOf(fieldU.value)
  const v = numberOf(fieldV.value)

  if (current === undefined || u === undefined || v === undefined) {
    return
  }

  const next = movedCorner(corners.value, index, { u, v })

  if (sameUvs(corners.value, next)) {
    return
  }

  corners.value = next

  for (const face of current.indices) {
    current.map.setFaceUvs(face, uvsOfFace(corners.value))
  }

  reframe()
  requestRedraw()
}

/**
 * Reads a typed uv, and the corner the user is on.
 *
 * @param axis The field that was typed into.
 */
function onFieldInput(axis: 'u' | 'v'): void {
  focusedField.value = axis
  applyFields()
}

/**
 * Starts a typed edit: the corners are kept, so the whole typing is one step of the history.
 *
 * @remarks
 * The two fields are one corner, so the edit starts at the first of them and the step is written when the focus leaves
 * both (typing the u and then the v is **one** step, not two).
 */
function onFieldFocus(): void {
  if (fieldStart === undefined) {
    fieldStart = corners.value.map((corner) => {
      return { ...corner }
    })
  }
}

/**
 * Ends a typed edit: the change is a step of the history, the way a drag is.
 */
function commitFields(): void {
  const current = shown.value
  const from = fieldStart

  focusedField.value = undefined
  fieldStart = undefined

  if (current === undefined || from === undefined || sameUvs(from, corners.value)) {
    return
  }

  const command = commandOf(createSetUvRecord(current.indices, uvsOfFace(from), uvsOfFace(corners.value)), current.map)

  if (command !== undefined) {
    runStep(command)
  }
}

/**
 * Ends a typed edit, unless the focus only moved to the other field of the corner.
 *
 * @param event The event of the field that lost the focus.
 */
function onFieldBlur(event: FocusEvent): void {
  const next = event.relatedTarget

  if (next instanceof HTMLElement && next.closest('.fields') !== null) {
    return
  }

  commitFields()
}

/**
 * Ends a typed edit on Enter: the step is on the stack, and the keyboard belongs to the editor again.
 *
 * @param event The key down of the field.
 */
function onFieldEnter(event: KeyboardEvent): void {
  commitFields()
  ;(event.target as HTMLInputElement | null)?.blur()
}

/**
 * Lays the corners of the face on other corners of it: the four buttons of the footer.
 *
 * @remarks
 * The uv values do not change, only which corner holds which: a texture that came in rotated or mirrored is fixed by
 * this, and the step goes on the history so the undo puts the corners back (2026-11-05, the owner). The faces of a
 * selection that share their corners all take the same layout, the way a drag of one corner moves all of them.
 *
 * @param turn Which way to lay the corners.
 */
function onTurn(turn: UvTurn): void {
  const current = shown.value

  if (current === undefined) {
    return
  }

  const from = corners.value.map((corner) => {
    return { ...corner }
  })

  corners.value = turnedUvs(corners.value, turn)

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
 * Ends the drag: the corner stays where it was let go, and the drag becomes a step of the history.
 *
 * @param event The release that ends the drag.
 */
function onPointerUp(event: PointerEvent): void {
  const index = dragged.value
  const current = shown.value
  const from = dragStart

  ;(event.currentTarget as Element | null)?.releasePointerCapture(event.pointerId)
  dragged.value = undefined
  dragStart = undefined

  if (index === undefined || current === undefined || from === undefined) {
    reframe()

    return
  }

  if (!sameUvs(from, corners.value)) {
    const command = commandOf(
      createSetUvRecord(current.indices, uvsOfFace(from), uvsOfFace(corners.value)),
      current.map,
    )

    if (command !== undefined) {
      runStep(command)
    }
  }

  reframe()
}

/**
 * Starts the drag of the texture: the whole view follows the pointer.
 *
 * @param event The press that starts the drag.
 */
function onPanStart(event: PointerEvent): void {
  event.preventDefault()
  ;(event.currentTarget as Element | null)?.setPointerCapture(event.pointerId)
  panning.value = true
  panFrom = pointOf(event)
}

/**
 * Slides the view with the pointer: the texture under the hand stays under it.
 *
 * @param event The position of the drag.
 */
function onPanMove(event: PointerEvent): void {
  const from = panFrom

  if (from === undefined) {
    return
  }

  const point = pointOf(event)

  pan.value = pannedBy(pan.value, { x: point.x - from.x, y: point.y - from.y }, size.value, zoom.value)
  panFrom = point
  reframe()
}

/**
 * Ends the drag of the texture.
 *
 * @param event The release that ends the drag.
 */
function onPanEnd(event: PointerEvent): void {
  ;(event.currentTarget as Element | null)?.releasePointerCapture(event.pointerId)
  panning.value = false
  panFrom = undefined
}

/**
 * Zooms the square with the wheel of the pointer.
 *
 * @param event The turn of the wheel.
 */
function onWheel(event: WheelEvent): void {
  // the wheel must not scroll the dock under the widget
  event.preventDefault()
  zoom.value = zoomAfter(zoom.value, event.deltaY)
  reframe()
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
    box.addEventListener('wheel', onWheel, { passive: false })
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
    if (value !== undefined) {
      await loadBitmap(value)
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
      <span class="name">{{ textureName ?? '—' }}</span>
      <span v-if="shown !== undefined && shown.indices.length > 1" class="faces">{{ shown.indices.length }} faces</span>
      <span class="zoom">{{ zoomLabel }}</span>
    </div>

    <div ref="stage" class="stage">
      <div class="square" :style="{ width: `${size}px`, height: `${size}px` }">
        <canvas
          ref="canvas"
          class="texture"
          :class="{ 'is-panning': panning }"
          :style="{ width: `${size}px`, height: `${size}px` }"
          @pointerdown="onPanStart"
          @pointermove="onPanMove"
          @pointerup="onPanEnd"
          @pointercancel="onPanEnd"
        ></canvas>
        <button
          v-for="handle in handles"
          :key="handle.index"
          class="corner"
          :class="{ 'is-dragged': dragged === handle.index, 'is-active': active === handle.index }"
          type="button"
          :data-corner="handle.index"
          :aria-label="`Corner ${handle.index + 1}`"
          :style="{ left: `${handle.x}px`, top: `${handle.y}px` }"
          @pointerdown="onPointerDown(handle.index, $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span class="index">{{ handle.index + 1 }}</span>
        </button>
      </div>

      <p v-if="hint !== ''" class="hint">{{ hint }}</p>
    </div>

    <div class="fields">
      <select v-model="activeCorner" class="corner-select" aria-label="Corner to edit" :disabled="shown === undefined">
        <option v-for="(_, index) in corners" :key="index" :value="String(index)">Corner {{ index + 1 }}</option>
      </select>
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

  .name {
    grid-column: 2;
    overflow: hidden;
    color: $text-muted;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .faces {
    grid-column: 3;
    color: $text-subtle;
    font-size: 10px;
    white-space: nowrap;
  }

  .zoom {
    grid-column: 4;
    color: $text-subtle;
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
  background: $surface-panel;
  overflow: hidden;
}

.texture {
  display: block;
  cursor: grab;
  touch-action: none;

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

.hint {
  position: absolute;
  margin: 0;
  padding: 0 12px;
  color: $text-dim;
  font-size: 12px;
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

  .corner-select {
    flex: 0 0 auto;
    padding: 2px 4px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text-icon;
    font: inherit;
    font-size: 11px;

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }

    &:disabled {
      opacity: 0.45;
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

    &:hover {
      color: $text-strong;
      background: $surface-widget;
    }

    &:disabled {
      opacity: 0.45;
    }
  }
}
</style>
