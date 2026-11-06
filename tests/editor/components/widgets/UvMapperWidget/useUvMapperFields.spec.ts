import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextTick, shallowRef, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import type { ShownFace, UvPoint } from '../../../../../src/editor/components/widgets/UvMapperWidget/uvMapper.ts'
import { useUvMapperFields } from '../../../../../src/editor/components/widgets/UvMapperWidget/useUvMapperFields.ts'

/**
 * The corners of the test: a quad on the texture.
 *
 * @returns Four corners, in the order the polygon stores them.
 */
function quad(): UvPoint[] {
  return [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 0, v: 1 },
    { u: 1, v: 1 },
  ]
}

/**
 * Builds the fields over a fake level.
 *
 * @returns The fields, their state and what the widget would see.
 */
function fieldsOf(): {
  fields: ReturnType<typeof useUvMapperFields>
  corners: ShallowRef<readonly UvPoint[]>
  active: ShallowRef<number | undefined>
  written: Array<{ face: number; uvs: readonly UvPoint[] }>
  redraws: { reframe: number; frames: number }
} {
  const corners = shallowRef<readonly UvPoint[]>(quad())
  const active = shallowRef<number | undefined>(0)
  const written: Array<{ face: number; uvs: readonly UvPoint[] }> = []
  const redraws = { reframe: 0, frames: 0 }
  const fakeLevel = {
    setFaceUvs: (face: number, uvs: readonly UvPoint[]): void => {
      written.push({ face, uvs })
    },
  }
  const map = fakeLevel as unknown as ArxMap
  const empty = {}
  const polygon = empty as unknown as ShownFace['polygon']
  const shown = shallowRef<ShownFace | undefined>({ map, indices: [3, 7], polygon })

  const fields = useUvMapperFields({
    corners,
    active,
    shown,
    reframe: (): void => {
      redraws.reframe = redraws.reframe + 1
    },
    requestRedraw: (): void => {
      redraws.frames = redraws.frames + 1
    },
  })

  return { fields, corners, active, written, redraws }
}

void describe('the fields of the uv mapper', () => {
  void it('puts the typed uv on the corner the fields show', async () => {
    const { fields, corners, written, redraws } = fieldsOf()

    fields.fieldU.value = '0.25'
    fields.fieldV.value = '0.75'
    fields.onFieldInput('u')
    await nextTick()

    assert.deepEqual(corners.value[0], { u: 0.25, v: 0.75 })
    assert.equal(written.length, 2)
    assert.deepEqual(written[0]?.uvs[0], { u: 0.25, v: 0.75 })
    assert.deepEqual([written[0]?.face, written[1]?.face], [3, 7])
    assert.equal(redraws.reframe, 1)
    assert.equal(redraws.frames, 1)
  })

  void it('reads a comma as the decimal point', async () => {
    const { fields, corners } = fieldsOf()

    fields.fieldU.value = '0,5'
    fields.fieldV.value = '0,25'
    fields.onFieldInput('v')
    await nextTick()

    assert.deepEqual(corners.value[0], { u: 0.5, v: 0.25 })
  })

  void it('leaves the model alone while a field is half typed', async () => {
    const { fields, corners, written } = fieldsOf()

    // an empty field is not a zero: the corner would jump to the corner of the texture on the first keystroke
    fields.fieldU.value = ''
    fields.fieldV.value = '0.5'
    fields.onFieldInput('u')
    await nextTick()

    assert.deepEqual(corners.value[0], { u: 0, v: 0 })
    assert.equal(written.length, 0)
  })

  void it('writes nothing when the number did not change', async () => {
    const { fields, written } = fieldsOf()

    fields.fieldU.value = '0.000'
    fields.fieldV.value = '0.000'
    fields.onFieldInput('u')
    await nextTick()

    assert.equal(written.length, 0)
  })

  void it('follows the corner under the eye', async () => {
    const { fields, corners, active } = fieldsOf()

    active.value = 2
    await nextTick()

    assert.equal(fields.fieldU.value, '0.000')
    assert.equal(fields.fieldV.value, '1.000')

    corners.value = quad().map((corner) => {
      return { u: corner.u / 2, v: corner.v / 2 }
    })
    await nextTick()

    assert.equal(fields.fieldU.value, '0.000')
    assert.equal(fields.fieldV.value, '0.500')
  })

  void it('keeps the text of the field the user is typing into', async () => {
    const { fields, corners } = fieldsOf()

    fields.onFieldInput('u')

    assert.equal(fields.focusedField.value, 'u')

    fields.fieldU.value = '0.'
    corners.value = quad().map((corner) => {
      return { u: corner.u / 4, v: corner.v / 4 }
    })
    await nextTick()

    // the u stays as it was typed, the v follows the model
    assert.equal(fields.fieldU.value, '0.')
    assert.equal(fields.fieldV.value, '0.000')
  })
})
