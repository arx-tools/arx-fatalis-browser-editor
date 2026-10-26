import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deepEquals, isPrimitive, parseJson } from '../../../../src/_editor/modules/persistedRef/functions.ts'

void describe('isPrimitive', () => {
  void it('accepts a string, a number and a boolean', () => {
    assert.equal(isPrimitive('Arx'), true)
    assert.equal(isPrimitive(11), true)
    assert.equal(isPrimitive(false), true)
  })

  void it('rejects the rest of the json values', () => {
    assert.equal(isPrimitive(null), false)
    assert.equal(isPrimitive(undefined), false)
    assert.equal(isPrimitive([1]), false)
    assert.equal(isPrimitive({ a: 1 }), false)
  })
})

void describe('deepEquals', () => {
  void it('matches two missing values', () => {
    assert.equal(deepEquals(undefined, undefined), true)
  })

  void it('matches the same primitive', () => {
    assert.equal(deepEquals('a', 'a'), true)
    assert.equal(deepEquals(11, 11), true)
    assert.equal(deepEquals(false, false), true)
  })

  void it('matches two nan values, which a json comparison would not', () => {
    assert.equal(deepEquals(Number.NaN, Number.NaN), true)
  })

  void it('compares arrays item by item', () => {
    assert.equal(deepEquals([1, 2, 3], [1, 2, 3]), true)
    assert.equal(deepEquals([1, 2, 3], [3, 2, 1]), false)
    assert.equal(deepEquals([1, 2], [1, 2, 3]), false)
  })

  void it('goes into the nested values', () => {
    assert.equal(deepEquals({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true)
    assert.equal(deepEquals({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }), false)
  })

  void it('does not care about the key order', () => {
    assert.equal(deepEquals({ a: 1, b: 2 }, { b: 2, a: 1 }), true)
  })

  void it('needs the same keys', () => {
    assert.equal(deepEquals({ a: 1 }, { a: 1, b: 2 }), false)
    assert.equal(deepEquals({ a: 1 }, { b: 1 }), false)
  })

  void it('does not confuse similar looking values', () => {
    assert.equal(deepEquals(null, undefined), false)
    assert.equal(deepEquals(0, '0'), false)
    assert.equal(deepEquals(1, true), false)
    assert.equal(deepEquals([], {}), false)
    assert.equal(deepEquals({ 0: 'a' }, ['a']), false)
  })
})

void describe('parseJson', () => {
  void it('parses a value', () => {
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 })
    assert.deepEqual(parseJson('[1,2]'), [1, 2])
    assert.equal(parseJson('"text"'), 'text')
    assert.equal(parseJson('11'), 11)
    assert.equal(parseJson('null'), null)
  })

  void it('returns undefined instead of throwing', () => {
    // eslint-disable-next-line node-test/no-useless-assertion -- an explicit guard is wanted next to the undefined checks
    assert.doesNotThrow(() => {
      parseJson('not json')
      parseJson('')
      parseJson('{')
    })

    assert.equal(parseJson('not json'), undefined)
    assert.equal(parseJson(''), undefined)
    assert.equal(parseJson('{'), undefined)
  })
})
