import { describe, it, type TestContext } from 'node:test'
import { registerShadowBake, requestShadowBake } from '../../../../../src/editor/modules/level/edit/shadowBake.ts'

void describe('requestShadowBake', () => {
  void it('runs the bake of the lighting once for a burst of steps', (t: TestContext) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let runs = 0

    registerShadowBake(() => {
      runs = runs + 1
    })

    requestShadowBake()
    requestShadowBake()
    requestShadowBake()

    // the steps of a burst wait for the last one: the bake reads the whole level
    t.assert.strictEqual(runs, 0)

    t.mock.timers.tick(300)

    t.assert.strictEqual(runs, 1)
  })
})
