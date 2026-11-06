import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetUvRecord } from '../../../modules/history/records.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { movedCorner, numberOfText, sameUvs, uvsOfFace, type ShownFace, type UvPoint } from './uvMapper.ts'

/**
 * The two uv fields under the square of the uv mapper: typing a corner instead of dragging it.
 *
 * @remarks
 * The fields follow the corners except the one that holds the focus (a half typed number would be overwritten by the
 * model on every frame of a drag), the same way the camera form follows the pose. The two fields are **one** corner and
 * **one** step of the history: typing the `u` and then the `v` is a single edit, which is what a painter expects.
 *
 * The widget tells the composable what it edits ({@link UvMapperFieldsContext.shown}), which corner is on
 * ({@link UvMapperFieldsContext.active}) and how to redraw; the typing itself lives here.
 */

/**
 * What the fields edit and how they redraw.
 */
export interface UvMapperFieldsContext {
  /**
   * The uv of the corners of the face, as the model holds them.
   */
  readonly corners: ShallowRef<readonly UvPoint[]>
  /**
   * The corner the fields edit: the one the user was on last.
   */
  readonly active: ShallowRef<number | undefined>
  /**
   * The faces the edit writes into, or `undefined` when the selection can not be edited.
   */
  readonly shown: ShallowRef<ShownFace | undefined>
  /**
   * Draws the square again (the corner, the handles and the fields), after a live change.
   */
  readonly reframe: () => void
  /**
   * Asks for a frame, so the 3D view follows the typing without a bump per keystroke.
   */
  readonly requestRedraw: () => void
}

/**
 * The text of the fields and the handlers of the input.
 */
export interface UvMapperFields {
  /**
   * The text of the `u` field, as the user types it.
   */
  readonly fieldU: Ref<string>
  /**
   * The text of the `v` field, as the user types it.
   */
  readonly fieldV: Ref<string>
  /**
   * Which field the user is typing into, if any.
   */
  readonly focusedField: ShallowRef<'u' | 'v' | undefined>
  /**
   * Writes the numbers of a corner into the fields, except the one the user is typing into.
   *
   * @param corner The corner the fields show.
   */
  readonly syncFields: (corner: UvPoint) => void
  /**
   * Reads the typed uv into the model, and remembers which field is being typed.
   *
   * @param axis The field that was typed into.
   */
  readonly onFieldInput: (axis: 'u' | 'v') => void
  /**
   * Starts a typed edit, so the whole typing is one step of the history.
   */
  readonly onFieldFocus: () => void
  /**
   * Ends a typed edit, unless the focus only moved to the other field of the corner.
   *
   * @param event The event of the field that lost the focus.
   */
  readonly onFieldBlur: (event: FocusEvent) => void
  /**
   * Ends a typed edit on Enter.
   *
   * @param event The key down of the field.
   */
  readonly onFieldEnter: (event: KeyboardEvent) => void
}

/**
 * Builds the field editing of the uv mapper.
 *
 * @param context What the fields edit and how they redraw.
 *
 * @returns The field state and the handlers the widget binds.
 */
export function useUvMapperFields(context: UvMapperFieldsContext): UvMapperFields {
  const { corners, active, shown, reframe, requestRedraw } = context

  /**
   * The text of the two uv fields, as the user types it.
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
   * Puts a typed uv into the model, when both fields hold a number.
   *
   * @remarks
   * The two fields are one edit: a corner has two numbers, and a half typed one (an empty field, a comma) leaves the
   * model alone. The value is kept inside the texture, like the drag.
   */
  function applyFields(): void {
    const index = active.value ?? 0
    const current = shown.value
    const u = numberOfText(fieldU.value)
    const v = numberOfText(fieldV.value)

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

    const command = commandOf(
      createSetUvRecord(current.indices, uvsOfFace(from), uvsOfFace(corners.value)),
      current.map,
    )

    if (command !== undefined) {
      runStep(command)
    }
  }

  // the fields follow the corner under the eye: the drag, a turn and an undo all move it, and a typed field keeps
  // what the user is typing into
  watch(
    [corners, active],
    () => {
      const corner = corners.value[active.value ?? 0]

      if (corner !== undefined) {
        syncFields(corner)
      }
    },
    { immediate: true },
  )

  return {
    fieldU,
    fieldV,
    focusedField,
    syncFields,
    onFieldInput: (axis): void => {
      focusedField.value = axis
      applyFields()
    },
    onFieldFocus: (): void => {
      // the two fields are one corner: the snapshot is taken on the first of them and kept until the focus leaves both
      if (fieldStart !== undefined) {
        return
      }

      fieldStart = corners.value.map((corner) => {
        return { ...corner }
      })
    },
    onFieldBlur: (event): void => {
      const next = event.relatedTarget

      if (next instanceof HTMLElement && next.closest('.fields') !== null) {
        return
      }

      commitFields()
    },
    onFieldEnter: (event): void => {
      commitFields()
      ;(event.target as HTMLInputElement | null)?.blur()
    },
  }
}
