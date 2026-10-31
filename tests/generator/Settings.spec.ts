import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { random } from '../../src/generator/random.ts'
import { Settings } from '../../src/generator/Settings.ts'

/**
 * Reads three numbers of the generator the settings started.
 *
 * @param settings The settings to read behind.
 *
 * @returns The next three numbers.
 */
function readAfter(settings: Settings): number[] {
  assert.notEqual(settings.seed, '')

  return [random(), random(), random()]
}

void describe('Settings', () => {
  void it('keeps the seed it was handed', () => {
    const settings = new Settings({ seed: '123456789' })

    assert.equal(settings.seed, '123456789')
  })

  void it('makes a seed when it gets none', () => {
    const settings = new Settings()

    assert.match(settings.seed, /^\d{9}$/u)
  })

  void it('starts the generator from its seed, so the same settings give the same numbers', () => {
    const first = readAfter(new Settings({ seed: '123456789' }))
    const second = readAfter(new Settings({ seed: '123456789' }))

    assert.deepEqual(first, second)
  })

  void it('leaves another seed other numbers', () => {
    const first = readAfter(new Settings({ seed: '123456789' }))
    const second = readAfter(new Settings({ seed: '987654321' }))

    assert.notDeepEqual(first, second)
  })
})
