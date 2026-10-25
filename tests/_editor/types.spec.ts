import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toDisplayLightingMode } from '../../src/_editor/types.ts'

void describe('toDisplayLightingMode', () => {
  void it('shows the game-like look for Arx', () => {
    assert.equal(toDisplayLightingMode('Arx'), 'dynamic')
  })

  void it('shows the game-like look for Realistic too', () => {
    assert.equal(toDisplayLightingMode('Realistic'), 'dynamic')
  })

  void it('shows the unlit white material for MaxBrightness', () => {
    assert.equal(toDisplayLightingMode('MaxBrightness'), 'maxBrightness')
  })

  void it('shows the unlit black material for CompleteDarkness', () => {
    assert.equal(toDisplayLightingMode('CompleteDarkness'), 'completeDarkness')
  })

  void it('shows the texture hues for TextureRainbow', () => {
    assert.equal(toDisplayLightingMode('TextureRainbow'), 'rainbow')
  })
})
