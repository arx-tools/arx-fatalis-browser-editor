import { ArxLightFlags, type ArxLight } from 'arx-convert/types'

/**
 * The most particles the field keeps.
 *
 * @remarks
 * The game caps its pool at 2200 (`ParticleEffects.cpp`): a level of many fireplaces never has more at once, and a
 * preview that does not stop is a preview that drags the editor down.
 */
export const MAX_PARTICLES = 2200

/**
 * The frame rate the game counts its spawn rate in.
 *
 * @remarks
 * The game's loop adds `amount * framedelay / (1000 / 61)` to the counter of a light, so the fire of a fireplace is a
 * rate of the game's 61 fps and not of the frame the editor happens to draw.
 */
const TARGET_FPS = 61

/**
 * The texture a particle draws with.
 */
export type ParticleTexture = 'fire' | 'smoke'

/**
 * The bit of a particle's flags: the game's Y grows by the drag of the fall.
 */
export const PARTICLE_GRAVITY = 1

/**
 * The bit of a particle's flags: its light grows in, then fades out.
 */
export const PARTICLE_FADE_IN_AND_OUT = 2

/**
 * The bit of a particle's flags: it turns into smoke when its life ends.
 */
export const PARTICLE_FIRE_TO_SMOKE = 4

/**
 * The bit of a particle's flags: its texture turns while it lives.
 */
export const PARTICLE_ROTATING = 8

/**
 * A color of a particle, from 0 to 1.
 */
export type ParticleColor = {
  readonly b: number
  readonly g: number
  readonly r: number
}

/**
 * One particle, as the game's `PARTICLE_DEF` holds it.
 *
 * @remarks
 * The place is in the game's coordinates, relative to the scene, the way the lights and the markers are: the view
 * mirrors it into the world. The `move` is the drag of the particle per 100 ms of its life, the way the game moves it
 * (`val = (tolive - framediff) * 0.01`).
 */
export type Particle = {
  color: ParticleColor
  created: number
  flags: number
  move: { x: number; y: number; z: number }
  position: { x: number; y: number; z: number }
  rotationSpeed: number
  /**
   * The size the particle loses over its life, in units: the game's `scale.x` of a fire is negative.
   */
  scale: number
  size: number
  texture: ParticleTexture
  tolive: number
}

/**
 * What the view draws of one particle in a frame.
 */
export type ParticleFrame = {
  readonly alpha: number
  readonly color: ParticleColor
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
  readonly rotation: number
  readonly size: number
  readonly texture: ParticleTexture
}

/**
 * The counter of the spawn of one light.
 *
 * @remarks
 * The game keeps a fractional counter on every light (`m_storedFlameTime`): a frame adds a part of a particle, and the
 * integer part is what the frame spawns. A light spawns the same number of particles whatever the frame rate of the
 * editor is.
 */
export type FlameClock = {
  stored: number
}

/**
 * The random of the spawn and the life of a particle.
 *
 * @returns A number from 0 up to, and not including, 1.
 */
export type ParticleRandom = () => number

/**
 * The white a particle of a light without the color flag has.
 */
const WHITE: ParticleColor = { r: 1, g: 1, b: 1 }

/**
 * The gray the smoke of a fire takes.
 */
const SMOKE_GRAY: ParticleColor = { r: 0.45, g: 0.45, b: 0.45 }

/**
 * Builds a counter of the spawn of one light.
 *
 * @returns The counter, at zero.
 */
export function createFlameClock(): FlameClock {
  return { stored: 0 }
}

/**
 * The color of a light, as the particles of its fire take it.
 *
 * @param light The light of the level.
 *
 * @returns The color of the light, or the white without the color flag.
 */
function particleColorOf(light: ArxLight): ParticleColor {
  if ((light.flags & ArxLightFlags.ColorLegacy) === 0) {
    return WHITE
  }

  return { b: light.color.b / 255, g: light.color.g / 255, r: light.color.r / 255 }
}

/**
 * Builds a random that gives the same sequence of numbers again.
 *
 * @remarks
 * The spawn of the game is a few random numbers per particle, and a test of it has to ask the same question twice.
 * The generator is the small `mulberry32`, which is enough for a preview and a test.
 *
 * @param seed The seed of the sequence.
 *
 * @returns The random of the sequence.
 */
export function seededRandom(seed = 1): ParticleRandom {
  let state = seed >>> 0

  return (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0

    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ 0

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Tells whether the light burns fire particles.
 *
 * @param light The light of the level.
 *
 * @returns True when the light has the fire or the smoke flag, its frequency is above zero, and it does not start
 * extinguished.
 */
export function isFireLight(light: ArxLight): boolean {
  if ((light.flags & (ArxLightFlags.SpawnFire | ArxLightFlags.SpawnSmoke)) === 0) {
    return false
  }

  if (light.exFrequency <= 0) {
    return false
  }

  return (light.flags & ArxLightFlags.StartExtinguished) === 0
}

/**
 * The offset of a spawn around the light.
 *
 * @remarks
 * This is the **bug of the game** (measured on 1.2.1, and the PR `arx/ArxLibertatis#301` fixes it): the two first
 * axes of the offset are the same sine, and the angle of the fire particle is in the 0..π range, so the two of them
 * are never negative. The particles are not around the light, they are on a half of the curve `(sin t, sin t, cos t)`.
 * The preview has to show the game as it is, so the editor models the same offset.
 *
 * @param random The sequence the spawn takes its numbers from.
 * @param fullTurn Whether the angle takes the whole turn (the spark of the fire) or the half of it (the flame).
 *
 * @returns The offset, before the radius of the light.
 */
function spawnOffsetOf(random: ParticleRandom, fullTurn: boolean): { x: number; y: number; z: number } {
  let t = random() * Math.PI

  if (fullTurn) {
    const fullTurnAngle = random() * (Math.PI * 2)

    t = fullTurnAngle - Math.PI
  }

  const scale = random()
  const side = Math.sin(t) * scale

  return { x: side, y: side, z: Math.cos(t) * scale }
}

/**
 * Spawns the particles of one light in a frame.
 *
 * @remarks
 * The rules are the game's `TreatBackgroundActions`: the counter of the light takes `amount * framedelay / (1000 / 61)`
 * and the integer part is the number of spawns of the frame. A spawn is the chance of `exFrequency` for the flame, and
 * a second, smaller spark with the gravity of the fire. The size, the life, the drag and the turn are the game's
 * numbers, and so is the half of the offset that is the bug of the 301.
 *
 * @param light The light of the level.
 * @param clock The counter of the light.
 * @param framedelay The time since the last frame, in milliseconds.
 * @param amount How many particles the frame of the light counts (the game moves it by the distance of the camera).
 * @param now The time of the frame, in milliseconds.
 * @param random The sequence the spawn takes its numbers from.
 *
 * @returns The particles of the frame, or none.
 */
export function spawnFireOf(
  light: ArxLight,
  clock: FlameClock,
  framedelay: number,
  amount: number,
  now: number,
  random: ParticleRandom,
): Particle[] {
  const particles: Particle[] = []

  if (!isFireLight(light)) {
    return particles
  }

  const targetDelay = 1000 / TARGET_FPS

  const added = (amount * framedelay) / targetDelay

  clock.stored = clock.stored + added

  const count = Math.floor(clock.stored)

  clock.stored = clock.stored - count

  const color = particleColorOf(light)
  const fireplace = (light.flags & ArxLightFlags.Fireplace) !== 0
  const smokeOnly = (light.flags & ArxLightFlags.SpawnFire) === 0
  let flameTexture: ParticleTexture = 'fire'

  if (smokeOnly) {
    flameTexture = 'smoke'
  }

  for (let index = 0; index < count; index = index + 1) {
    if (random() < light.exFrequency) {
      const offset = spawnOffsetOf(random, false)
      const reachX = offset.x * light.exRadius
      const reachY = offset.y * light.exRadius
      const reachZ = offset.z * light.exRadius
      const dragX = 4 * random()
      // the game's flame drags up the most: the 22 of the three numbers is the game's Y, which points down
      const dragY = 22 * random()
      const dragZ = 4 * random()
      // the game draws the life of the particle before the turn of its texture: the two randoms are in that order
      const tolive = 500 + Math.floor(random() * (1000 * light.exSpeed))
      const spin = random() * 0.2 * light.exSpeed

      particles.push({
        position: {
          x: light.position.x + reachX,
          y: light.position.y + reachY,
          z: light.position.z + reachZ,
        },
        move: {
          x: (2 - dragX) * light.exSpeed,
          y: (2 - dragY) * light.exSpeed,
          z: (2 - dragZ) * light.exSpeed,
        },
        size: 7 * light.exSize,
        created: now,
        tolive,
        rotationSpeed: 0.1 - spin,
        scale: -8,
        color,
        texture: flameTexture,
        flags: PARTICLE_ROTATING,
      })
    }

    if (smokeOnly || random() > 0.95) {
      continue
    }

    if (random() >= light.exFrequency) {
      continue
    }

    const offset = spawnOffsetOf(random, true)
    const sparkX = offset.x * light.exRadius
    const sparkY = offset.y * light.exRadius
    const sparkZ = offset.z * light.exRadius
    const reach = Math.hypot(offset.x, offset.y, offset.z)
    const fallDistance = 8 * random()
    const fall = -18 + fallDistance
    const tolive = 1200 + Math.floor(random() * (500 * light.exSpeed))
    const spin = random() * 0.2 * light.exSpeed
    let distance = 4

    if (fireplace) {
      distance = 6
    }

    let side = 0

    if (reach !== 0) {
      side = distance / reach
    }

    particles.push({
      position: {
        x: light.position.x + sparkX,
        y: light.position.y + sparkY,
        z: light.position.z + sparkZ,
      },
      move: {
        x: offset.x * side * light.exSpeed,
        y: fall * light.exSpeed,
        z: offset.z * side * light.exSpeed,
      },
      size: 4 * light.exSize * 0.3,
      created: now,
      tolive,
      rotationSpeed: 0.1 - spin,
      scale: -3,
      color,
      texture: 'fire',
      flags: PARTICLE_ROTATING | PARTICLE_GRAVITY,
    })
  }

  return particles
}

/**
 * The life of a particle as the frame shows it.
 *
 * @param part The particle.
 * @param now The time of the frame, in milliseconds.
 *
 * @returns The place, the size, the color, the alpha and the turn of the particle, or `undefined` when the frame of
 * the life is over and the particle is gone.
 */
function frameOf(part: Particle, now: number): ParticleFrame | undefined {
  const framediff = part.created + part.tolive - now
  const framediff2 = now - part.created

  if (framediff2 < 0) {
    return undefined
  }

  if (framediff <= 0) {
    return undefined
  }

  const val = (part.tolive - framediff) * 0.01
  const dragX = part.move.x * val
  const dragY = part.move.y * val
  const dragZ = part.move.z * val
  const position = {
    x: part.position.x + dragX,
    y: part.position.y + dragY,
    z: part.position.z + dragZ,
  }

  if ((part.flags & PARTICLE_GRAVITY) !== 0) {
    const fall = 1.47 * val * val

    position.y = position.y + fall
  }

  const fd = framediff2 / part.tolive
  let alpha = 1 - fd

  if ((part.flags & PARTICLE_FADE_IN_AND_OUT) !== 0) {
    const half = part.tolive / 2

    if (framediff2 <= half) {
      alpha = framediff2 / half
    } else {
      const rest = (framediff2 - half) / half

      alpha = 1 - rest
    }
  }

  const grown = part.scale * fd
  const size = part.size + grown

  if (alpha <= 0 || size <= 0) {
    return undefined
  }

  // the game turns the texture by the frame's time and the height of the particle's life
  const rotation = (now + framediff2) * part.rotationSpeed

  return { position, size, alpha, rotation, color: part.color, texture: part.texture }
}

/**
 * Turns the life of a particle into the smoke of its fire, or ends it.
 *
 * @remarks
 * The game keeps the last 30% of the fires: the particle grows, goes gray, halves its speed and lives a little longer
 * as the smoke of the fireplace. The rest of the particles are gone at the end of their life.
 *
 * @param part The particle.
 * @param now The time of the frame, in milliseconds.
 * @param random The sequence the smoke takes its chance from.
 *
 * @returns True when the particle goes on as smoke.
 */
function endOfLifeOf(part: Particle, now: number, random: ParticleRandom): boolean {
  if ((part.flags & PARTICLE_FIRE_TO_SMOKE) === 0 || random() <= 0.7) {
    return false
  }

  part.position.x = part.position.x + part.move.x
  part.position.y = part.position.y + part.move.y
  part.position.z = part.position.z + part.move.z
  part.tolive = Math.floor(part.tolive * 1.375)
  part.flags = part.flags & ~PARTICLE_FIRE_TO_SMOKE
  part.texture = 'smoke'
  part.scale = Math.abs(part.scale * 2.4)
  part.color = SMOKE_GRAY
  part.move = { x: part.move.x * 0.5, y: part.move.y * 0.5, z: part.move.z * 0.5 }
  part.size = part.size / 3
  part.created = now

  return true
}

/**
 * Moves the particles of the field to the time of the frame.
 *
 * @remarks
 * The particles that are gone leave the pool, and the ones of a fire that ended go on as its smoke. The frames are
 * what the view draws: the place, the size, the color, the alpha and the turn of every particle of the moment.
 *
 * @param pool The particles of the field; the ones that are gone are taken out of it.
 * @param now The time of the frame, in milliseconds.
 * @param random The sequence the smoke of a fire takes its chance from.
 *
 * @returns The frames of the moment.
 */
export function advanceParticles(pool: Particle[], now: number, random: ParticleRandom): ParticleFrame[] {
  const frames: ParticleFrame[] = []
  let kept = 0

  for (const part of pool) {
    const framediff = part.created + part.tolive - now

    if (framediff <= 0 && !endOfLifeOf(part, now, random)) {
      continue
    }

    const frame = frameOf(part, now)

    if (frame !== undefined) {
      frames.push(frame)
    }

    pool[kept] = part
    kept = kept + 1
  }

  pool.length = kept

  return frames
}
