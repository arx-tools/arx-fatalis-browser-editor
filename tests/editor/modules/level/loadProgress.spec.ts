import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  announceProgress,
  bakeProgress,
  laterOf,
  LOAD_STEPS,
  progressBetween,
  progressOfStep,
  textureProgress,
  type LoadProgress,
} from '../../../../src/editor/modules/level/loadProgress.ts'

void describe('progressOfStep', () => {
  void it('gives the percent and the words of the step', () => {
    assert.deepEqual(progressOfStep('bake'), { percent: 56, label: 'Baking the lights…' })
  })

  void it('gives a copy, so a reader can keep it', () => {
    const progress = progressOfStep('source')

    assert.notEqual(progress, LOAD_STEPS.source)
    assert.deepEqual(progress, { percent: 1, label: 'Reading the level files…' })
  })
})

void describe('LOAD_STEPS', () => {
  void it('walks forward, so the bar never goes back on its own', () => {
    const percents = Object.values(LOAD_STEPS).map((step) => {
      return step.percent
    })

    assert.deepEqual(
      percents,
      percents.toSorted((left, right) => {
        return left - right
      }),
    )
  })

  void it('ends on the whole load', () => {
    assert.equal(LOAD_STEPS.done.percent, 100)
  })
})

void describe('progressBetween', () => {
  void it('keeps the percent between the two ends of the range', () => {
    assert.equal(progressBetween('Half', 40, 60, 0.5).percent, 50)
    assert.equal(progressBetween('None', 40, 60, 0).percent, 40)
    assert.equal(progressBetween('All', 40, 60, 1).percent, 60)
  })

  void it('clamps a fraction that runs off the range', () => {
    assert.equal(progressBetween('Below', 40, 60, -1).percent, 40)
    assert.equal(progressBetween('Above', 40, 60, 2).percent, 60)
  })

  void it('rounds the percent to a whole number', () => {
    assert.equal(progressBetween('Third', 0, 100, 1 / 3).percent, 33)
  })
})

void describe('textureProgress', () => {
  void it('fills the range between the reading and the paint', () => {
    assert.equal(textureProgress(0, 10).percent, 40)
    assert.equal(textureProgress(5, 10).percent, 48)
    assert.equal(textureProgress(10, 10).percent, 55)
  })

  void it('is done when the level has no texture', () => {
    assert.equal(textureProgress(0, 0).percent, 55)
  })

  void it('keeps the words of the reading', () => {
    assert.equal(textureProgress(3, 10).label, 'Reading the textures…')
  })
})

void describe('bakeProgress', () => {
  void it('fills the range between the bake and the light on the mesh', () => {
    assert.equal(bakeProgress(0, 10).percent, 56)
    assert.equal(bakeProgress(5, 10).percent, 76)
    assert.equal(bakeProgress(10, 10).percent, 95)
  })

  void it('keeps the words of the bake', () => {
    assert.equal(bakeProgress(1, 2).label, 'Baking the lights…')
  })
})

void describe('laterOf', () => {
  void it('keeps the further percent, and the later words', () => {
    const previous: LoadProgress = { percent: 56, label: 'Baking the lights…' }
    const next: LoadProgress = { percent: 40, label: 'Reading the textures…' }

    assert.deepEqual(laterOf(previous, next), { percent: 56, label: 'Reading the textures…' })
  })

  void it('takes the next step when it is further on', () => {
    const next: LoadProgress = { percent: 95, label: 'Applying the light…' }

    assert.deepEqual(laterOf({ percent: 56, label: 'Baking the lights…' }, next), next)
  })
})

void describe('announceProgress', () => {
  void it('reports the step of a load that has a cover', async () => {
    const seen: LoadProgress[] = []

    await announceProgress((progress) => {
      seen.push(progress)
    }, progressOfStep('build'))

    assert.deepEqual(seen, [{ percent: 30, label: 'Building the level…' }])
  })
})
