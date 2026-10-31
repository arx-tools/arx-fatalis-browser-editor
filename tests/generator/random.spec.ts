import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRandomSeed,
  pickRandom,
  random,
  randomBetween,
  randomIntBetween,
  setSeed,
} from '../../src/generator/random.ts'

void describe('createRandomSeed', () => {
  void it('gives nine digits', () => {
    const seeds = Array.from({ length: 50 }, () => {
      return createRandomSeed()
    })

    assert.equal(
      seeds.every((seed) => {
        return /^\d{9}$/u.test(seed)
      }),
      true,
    )
  })
})

void describe('the seeded generator', () => {
  void it('gives the same numbers for the same seed', () => {
    setSeed('123456789')
    const first = [random(), random(), random(), random()]

    setSeed('123456789')
    const second = [random(), random(), random(), random()]

    assert.deepEqual(first, second)
  })

  void it('gives other numbers for another seed', () => {
    setSeed('123456789')
    const first = [random(), random(), random(), random()]

    setSeed('987654321')
    const second = [random(), random(), random(), random()]

    assert.notDeepEqual(first, second)
  })

  void it('keeps the numbers in their range', () => {
    setSeed('42')
    const numbers = Array.from({ length: 100 }, () => {
      return { unit: random(), integer: randomIntBetween(10, 12), between: randomBetween(-1, 1) }
    })

    assert.equal(
      numbers.every(({ unit, integer, between }) => {
        return unit >= 0 && unit < 1 && integer >= 10 && integer <= 12 && between >= -1 && between < 1
      }),
      true,
    )
  })

  void it('picks an item of the list', () => {
    setSeed('42')
    const items = ['a', 'b', 'c']

    assert.equal(items.includes(pickRandom(items)), true)
  })
})
