import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLightingCalculatorMode, lightingCalculatorModes } from '../../src/generator/types.ts'

void describe('lightingCalculatorModes', () => {
  void it('lists the five modes in the order the select shows them', () => {
    assert.deepEqual(lightingCalculatorModes, [
      'Arx',
      'Realistic',
      'TextureRainbow',
      'MaxBrightness',
      'CompleteDarkness',
    ])
  })
})

void describe('isLightingCalculatorMode', () => {
  void it('accepts every mode of the list', () => {
    assert.equal(isLightingCalculatorMode('Arx'), true)
    assert.equal(isLightingCalculatorMode('Realistic'), true)
    assert.equal(isLightingCalculatorMode('TextureRainbow'), true)
    assert.equal(isLightingCalculatorMode('MaxBrightness'), true)
    assert.equal(isLightingCalculatorMode('CompleteDarkness'), true)
  })

  void it('rejects everything else', () => {
    assert.equal(isLightingCalculatorMode('arx'), false)
    assert.equal(isLightingCalculatorMode('Dynamic'), false)
    assert.equal(isLightingCalculatorMode(''), false)
  })
})
