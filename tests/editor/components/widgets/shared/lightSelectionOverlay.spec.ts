import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AdditiveBlending, NormalBlending, Sprite } from 'three'
import type { ArxLight } from 'arx-convert/types'
import { createLightSelectionOverlay } from '../../../../../src/editor/components/widgets/shared/lightSelectionOverlay.ts'

/**
 * Fills every field of an LLF light, so a test changes only what it needs.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The LLF light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 0, y: 0, z: 0 },
    color: { r: 255, g: 255, b: 255, a: 1 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 1,
    exSize: 0.1,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
    ...overrides,
  }
}

/**
 * Gives the overlay a canvas to draw its rings on: the test runner of the unit suite has no document.
 */
function stubCanvas(): void {
  const context = {
    beginPath: (): void => {
      // the canvas stub never paints: the test reads the sprites, not the picture
    },
    arc: (): void => {
      // the canvas stub never paints: the test reads the sprites, not the picture
    },
    stroke: (): void => {
      // the canvas stub never paints: the test reads the sprites, not the picture
    },
    fill: (): void => {
      // the canvas stub never paints: the test reads the sprites, not the picture
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (): unknown => {
        return {
          width: 0,
          height: 0,
          getContext: (): unknown => {
            return context
          },
        }
      },
    },
  })
}

void describe('createLightSelectionOverlay', () => {
  stubCanvas()

  void it('draws the focused lights with the yellow fill and the hovered one with the white ring', () => {
    const overlay = createLightSelectionOverlay()

    overlay.update([light(), light({ position: { x: 1, y: 2, z: 3 } })], new Set([0]), 1)

    const [focus, hover] = overlay.group.children

    assert.ok(focus instanceof Sprite)
    assert.ok(hover instanceof Sprite)
    assert.equal(focus.material.blending, NormalBlending)
    assert.equal(hover.material.blending, AdditiveBlending)
    assert.notEqual(focus.material.map, hover.material.map)

    overlay.dispose()
  })

  void it('keeps the focused ring when the light is both selected and hovered', () => {
    const overlay = createLightSelectionOverlay()

    overlay.update([light()], new Set([0]), 0)

    assert.equal(overlay.group.children.length, 1)

    const [only] = overlay.group.children

    assert.ok(only instanceof Sprite)
    assert.equal(only.material.blending, NormalBlending)

    overlay.dispose()
  })

  void it('draws nothing for an empty selection and no hover', () => {
    const overlay = createLightSelectionOverlay()

    overlay.update([light()], new Set(), undefined)

    assert.equal(overlay.group.children.length, 0)

    overlay.dispose()
  })
})
