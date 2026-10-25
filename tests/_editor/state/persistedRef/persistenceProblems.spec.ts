import { describe, it, type TestContext } from 'node:test'
import {
  clearPersistenceProblems,
  persistenceProblems,
  reportProblem,
} from '../../../../src/_editor/state/persistedRef/persistenceProblems.ts'

/**
 * Starts a test from an empty problem list and records the warnings.
 *
 * @param t The context of the running test.
 * @returns The warnings which were written to the console.
 */
function collectWarnings(t: TestContext): string[] {
  const warnings: string[] = []

  t.mock.method(console, 'warn', (message: string) => {
    warnings.push(message)
  })
  clearPersistenceProblems()

  return warnings
}

void describe('reportProblem', () => {
  void it('adds the problem and warns once', (t: TestContext) => {
    const warnings = collectWarnings(t)

    reportProblem('camera', 'localStorage', 'the storage is full')

    t.assert.strictEqual(persistenceProblems.value.length, 1)
    t.assert.deepStrictEqual(persistenceProblems.value[0], {
      key: 'camera',
      target: 'localStorage',
      message: 'the storage is full',
    })
    t.assert.strictEqual(warnings.length, 1)
    t.assert.match(warnings[0] ?? '', /camera/u)
    t.assert.match(warnings[0] ?? '', /the storage is full/u)
  })

  void it('reports the same key and target only once', (t: TestContext) => {
    const warnings = collectWarnings(t)

    reportProblem('camera', 'localStorage', 'the storage is full')
    reportProblem('camera', 'localStorage', 'something else')

    t.assert.strictEqual(persistenceProblems.value.length, 1)
    t.assert.strictEqual(warnings.length, 1)
    // the first message is the one which stays
    t.assert.strictEqual(persistenceProblems.value[0]?.message, 'the storage is full')
  })

  void it('reports another key or another target', (t: TestContext) => {
    collectWarnings(t)

    reportProblem('camera', 'localStorage', 'one')
    reportProblem('shadows', 'localStorage', 'two')
    reportProblem('camera', 'url', 'three')

    t.assert.strictEqual(persistenceProblems.value.length, 3)
  })

  void it('keeps the earlier problems in the list', (t: TestContext) => {
    collectWarnings(t)

    reportProblem('camera', 'localStorage', 'one')
    reportProblem('shadows', 'url', 'two')

    t.assert.deepStrictEqual(
      persistenceProblems.value.map((problem) => {
        return problem.key
      }),
      ['camera', 'shadows'],
    )
  })
})

void describe('clearPersistenceProblems', () => {
  void it('empties the list and lets the same problem be reported again', (t: TestContext) => {
    const warnings = collectWarnings(t)

    reportProblem('camera', 'localStorage', 'one')
    clearPersistenceProblems()
    t.assert.strictEqual(persistenceProblems.value.length, 0)

    reportProblem('camera', 'localStorage', 'two')

    t.assert.strictEqual(persistenceProblems.value.length, 1)
    t.assert.strictEqual(warnings.length, 2)
  })
})
