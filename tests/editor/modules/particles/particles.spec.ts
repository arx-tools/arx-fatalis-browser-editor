import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import {
  advanceParticles,
  createFlameClock,
  isFireLight,
  PARTICLE_FIRE_TO_SMOKE,
  PARTICLE_GRAVITY,
  PARTICLE_ROTATING,
  seededRandom,
  spawnFireOf,
  type Particle,
  type ParticleRandom,
} from '../../../../src/editor/modules/particles/particles.ts'

/**
 * A light of a level with the fire of a fireplace, unless a test says otherwise.
 *
 * @param over The fields the test changes.
 *
 * @returns The light, with a fire of a fireplace unless the test changed its flags.
 */
function fireLightOf(over: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 10, y: 20, z: 30 },
    color: { r: 255, g: 128, b: 0, a: 255 },
    fallStart: 10,
    fallEnd: 100,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 255 },
    exRadius: 100,
    exFrequency: 1,
    exSize: 10,
    exSpeed: 1,
    exFlareSize: 0,
    flags: ArxLightFlags.SemiDynamic | ArxLightFlags.SpawnFire,
    ...over,
  }
}

/**
 * Builds a particle of its own, so a test of the life does not need the spawn.
 *
 * @param over The fields the test changes.
 *
 * @returns A particle at the origin, unless the test moved it.
 */
function particleOf(over: Partial<Particle> = {}): Particle {
  return {
    position: { x: 0, y: 0, z: 0 },
    move: { x: 1, y: 2, z: 3 },
    size: 10,
    scale: -8,
    rotationSpeed: 0.1,
    created: 0,
    tolive: 1000,
    color: { r: 1, g: 1, b: 1 },
    texture: 'fire',
    flags: PARTICLE_ROTATING,
    ...over,
  }
}

/**
 * A random that gives the given numbers again and again.
 *
 * @param values The numbers of the sequence.
 *
 * @returns The random of the sequence.
 */
function sequenceOf(...values: number[]): ParticleRandom {
  let index = 0

  return (): number => {
    const value = values[index % values.length] ?? 0

    index = index + 1

    return value
  }
}

void describe('isFireLight', () => {
  void it('takes a light with the flag of the fire', () => {
    assert.equal(isFireLight(fireLightOf()), true)
  })

  void it('takes a light with the flag of the smoke', () => {
    assert.equal(isFireLight(fireLightOf({ flags: ArxLightFlags.SpawnSmoke })), true)
  })

  void it('leaves a light of no frequency out', () => {
    assert.equal(isFireLight(fireLightOf({ exFrequency: 0 })), false)
  })

  void it('leaves a light that starts extinguished out', () => {
    const light = fireLightOf({
      flags: ArxLightFlags.SpawnFire | ArxLightFlags.StartExtinguished,
    })

    assert.equal(isFireLight(light), false)
  })

  void it('leaves a light of no fire and no smoke flag out', () => {
    assert.equal(isFireLight(fireLightOf({ flags: ArxLightFlags.SemiDynamic })), false)
  })
})

void describe('seededRandom', () => {
  void it('gives the same numbers again', () => {
    const one = seededRandom(7)
    const other = seededRandom(7)

    assert.deepEqual(
      Array.from({ length: 20 }, () => {
        return one()
      }),
      Array.from({ length: 20 }, () => {
        return other()
      }),
    )
  })

  void it('gives numbers from zero up to one', () => {
    const random = seededRandom(3)
    const numbers = Array.from({ length: 100 }, () => {
      return random()
    })

    assert.ok(
      numbers.every((value) => {
        return value >= 0
      }),
    )
    assert.ok(
      numbers.every((value) => {
        return value < 1
      }),
    )
  })
})

void describe('spawnFireOf', () => {
  void it('counts the spawns in the frame rate of the game', () => {
    const light = fireLightOf()
    const clock = createFlameClock()
    const oneFrame = 1000 / 61

    // one unit of the count per frame: the counter of the light takes one particle a frame
    const first = spawnFireOf(light, clock, oneFrame, 1, 0, sequenceOf(0.5))

    assert.equal(first.length, 2)
  })

  void it('keeps the fraction of a spawn for the next frame', () => {
    const light = fireLightOf({ exFrequency: 0.5 })
    const clock = createFlameClock()
    const random = seededRandom(11)
    let count = 0

    // a half chance: the spawn of the two kinds over ten frames is about the half of the twenty chances
    for (let frame = 0; frame < 10; frame = frame + 1) {
      count = count + spawnFireOf(light, clock, 1000 / 61, 1, frame * 16, random).length
    }

    assert.ok(count > 0)
    assert.ok(count < 20)
  })

  void it('spawns on the half curve of the game, the bug of the 301', () => {
    const light = fireLightOf()
    const clock = createFlameClock()
    const random = seededRandom(5)
    const particles = spawnFireOf(light, clock, 1000 / 61, 1, 0, random)

    // the flame: the two first axes of the offset are the same sine of an angle in 0..π, so both are never negative
    const flame = particles[0]

    assert.notStrictEqual(flame, undefined)
    // the two additions are the same number, and the sum of the floats is a hair apart
    assert.ok(Math.abs(flame.position.x - light.position.x - (flame.position.y - light.position.y)) < 1e-9)
    assert.ok(flame.position.x >= light.position.x)

    // the spark has the whole turn, so the two axes are the same number, but not always positive
    const spark = particles[1]

    assert.notStrictEqual(spark, undefined)
    assert.ok(Math.abs(spark.position.x - light.position.x - (spark.position.y - light.position.y)) < 1e-9)
  })

  void it('gives the flame the size, the life and the flags of the game', () => {
    const light = fireLightOf()
    const clock = createFlameClock()
    const particles = spawnFireOf(light, clock, 1000 / 61, 1, 0, sequenceOf(0))
    const flame = particles[0]

    assert.notStrictEqual(flame, undefined)
    assert.equal(flame.size, 70)
    assert.equal(flame.tolive, 500)
    assert.equal(flame.texture, 'fire')
    assert.equal(flame.flags & PARTICLE_ROTATING, PARTICLE_ROTATING)
    assert.equal(flame.flags & PARTICLE_GRAVITY, 0)
  })

  void it('gives the spark the gravity and the smaller size', () => {
    const light = fireLightOf()
    const clock = createFlameClock()
    const particles = spawnFireOf(light, clock, 1000 / 61, 1, 0, sequenceOf(0))
    const spark = particles[1]

    assert.notStrictEqual(spark, undefined)
    assert.equal(spark.size, 12)
    assert.equal(spark.tolive, 1200)
    assert.equal(spark.flags & PARTICLE_GRAVITY, PARTICLE_GRAVITY)
  })

  void it('drags the flame up, the way the game does', () => {
    const light = fireLightOf()
    const random = seededRandom(13)
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []

    for (let frame = 0; frame < 40; frame = frame + 1) {
      for (const particle of spawnFireOf(light, createFlameClock(), 1000 / 61, 1, frame * 16, random)) {
        // the spark has a drag of its own, with the gravity: the test is about the flame
        if ((particle.flags & PARTICLE_GRAVITY) !== 0) {
          continue
        }

        xs.push(particle.move.x)
        ys.push(particle.move.y)
        zs.push(particle.move.z)
      }
    }

    // the 22 of the game's three drag numbers is the Y, which points down: the flame goes up and hardly sideways
    assert.ok(Math.min(...ys) < -10)
    assert.ok(Math.max(...xs) <= 2)
    assert.ok(Math.min(...xs) >= -2)
    assert.ok(Math.max(...zs) <= 2)
    assert.ok(Math.min(...zs) >= -2)
  })

  void it('takes the color of the light with the legacy flag, and the white without it', () => {
    const clock = createFlameClock()
    const legacy = spawnFireOf(
      fireLightOf({ flags: ArxLightFlags.SpawnFire | ArxLightFlags.ColorLegacy }),
      clock,
      1000 / 61,
      1,
      0,
      sequenceOf(0),
    )

    assert.deepEqual(legacy[0]?.color, { r: 1, g: 128 / 255, b: 0 })

    const white = spawnFireOf(fireLightOf(), createFlameClock(), 1000 / 61, 1, 0, sequenceOf(0))

    assert.deepEqual(white[0]?.color, { r: 1, g: 1, b: 1 })
  })

  void it('spawns the smoke texture on a light of the smoke', () => {
    const light = fireLightOf({ flags: ArxLightFlags.SpawnSmoke })
    const particles = spawnFireOf(light, createFlameClock(), 1000 / 61, 1, 0, seededRandom(2))

    assert.equal(particles.length, 1)
    assert.equal(particles[0]?.texture, 'smoke')
  })
})

void describe('advanceParticles', () => {
  void it('takes a particle that lived its life out of the pool', () => {
    const pool = [particleOf({ created: 0, tolive: 1000 })]

    advanceParticles(pool, 2000, sequenceOf(0.9))

    assert.equal(pool.length, 0)
  })

  void it('moves the particle along its drag', () => {
    const pool = [particleOf({ created: 0, tolive: 1000, move: { x: 1, y: 2, z: 3 } })]
    const frames = advanceParticles(pool, 500, sequenceOf(0.9))

    assert.equal(frames.length, 1)
    assert.equal(frames[0]?.position.x, 5)
    assert.equal(frames[0]?.position.y, 10)
    assert.equal(frames[0]?.position.z, 15)
  })

  void it('adds the fall of the gravity in the game', () => {
    const pool = [particleOf({ created: 0, tolive: 1000, move: { x: 0, y: 0, z: 0 }, flags: PARTICLE_GRAVITY })]
    const frames = advanceParticles(pool, 500, sequenceOf(0.9))

    // val = (1000 - 500) * 0.01 = 5; the fall of the game adds 1.47 * 25
    assert.equal(frames[0]?.position.y, 36.75)
  })

  void it('shrinks the size over the life', () => {
    const pool = [particleOf({ created: 0, tolive: 1000, size: 10, scale: -8 })]
    const frames = advanceParticles(pool, 500, sequenceOf(0.9))

    assert.equal(frames[0]?.size, 6)
    assert.equal(frames[0]?.alpha, 0.5)
  })

  void it('turns the fire into its smoke at the end of the life', () => {
    const pool = [particleOf({ created: 0, tolive: 1000, flags: PARTICLE_FIRE_TO_SMOKE, color: { r: 1, g: 1, b: 1 } })]
    const frames = advanceParticles(pool, 1000, sequenceOf(0.8))

    assert.equal(pool.length, 1)

    const smoke = frames[0]

    assert.notStrictEqual(smoke, undefined)
    assert.equal(smoke.texture, 'smoke')
    assert.equal(smoke.color.r, 0.45)
  })

  void it('ends the fire that does not turn into smoke', () => {
    const pool = [particleOf({ created: 0, tolive: 1000, flags: PARTICLE_FIRE_TO_SMOKE })]

    advanceParticles(pool, 1000, sequenceOf(0.5))

    assert.equal(pool.length, 0)
  })
})
