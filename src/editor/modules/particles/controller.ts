import type { ArxLight } from 'arx-convert/types'
import type { Vector3 } from 'three'
import { watch } from 'vue'
import { arxVector3toVector3 } from '../../../generator/meshes.ts'
import { persistedRef } from '../persistedRef/persistedRef.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import {
  advanceParticles,
  createFlameClock,
  isFireLight,
  MAX_PARTICLES,
  spawnFireOf,
  type FlameClock,
  type Particle,
  type ParticleFrame,
} from './particles.ts'

/**
 * Whether the particles of the level are on.
 *
 * @remarks
 * The fire of a fireplace, the smoke of a fire and the fog of a level are a layer of their own: the author turns it on
 * to see the level the way the game draws it. It is a view preference in the browser, like the profile of the light
 * controls; the default is off, the way the dynamic layer's is (a level of many fireplaces asks the CPU of the machine
 * for its particles).
 */
export const particlesVisible = persistedRef<boolean>({
  key: 'particlesVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * What a view draws of the particles, and how the layer asks it for a frame.
 */
export type ParticleView = {
  /**
   * The place of the camera of the view, in the world of the view.
   *
   * @returns The place, or `undefined` before the view is built.
   */
  readonly cameraPositionOf: () => Vector3 | undefined
  /**
   * Asks the view for a frame, so the particles are drawn.
   */
  readonly render: () => void
  /**
   * Turns the particles on or off.
   *
   * @param visible Whether the particles of the level are on.
   */
  readonly setVisible: (visible: boolean) => void
  /**
   * Takes the particles of the frame.
   *
   * @param frames The particles of the moment.
   */
  readonly update: (frames: readonly ParticleFrame[]) => void
}

/**
 * The far plane of the walkable view, which the game moves the count of the fire of a light with.
 *
 * @remarks
 * The game counts more particles of a light the closer the camera is to it (`amount` of the `TreatBackgroundActions`):
 * 3 within a sixth of the depth of the view, 2.5 within a third, and 2 behind.
 */
const VIEW_DEPTH = 10_000

/**
 * The particles of the level, and the counter of the spawn of every light.
 */
const pool: Particle[] = []
const clocks = new Map<ArxLight, FlameClock>()
const views = new Set<ParticleView>()

/**
 * The last frame the ticker drew, in milliseconds.
 */
let lastFrame = 0

/**
 * The handle of the animation frame of the ticker.
 */
let ticker: number | undefined

/**
 * The map the counters of the spawn belong to.
 */
let loadedMap: unknown

/**
 * Tells whether the page is in the background.
 *
 * @returns True while the page is hidden.
 */
function isPageHidden(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  return document.visibilityState === 'hidden'
}

/**
 * Tells whether the layer has a view to draw into.
 *
 * @returns True when a view of the walkable view is on the screen.
 */
function isOn(): boolean {
  return particlesVisible.value && views.size > 0 && levelStore.map.value !== undefined && !isPageHidden()
}

/**
 * The count of the fire of a light, from the distance of the camera.
 *
 * @param light The light of the level.
 * @param camera The place of the camera, or `undefined` without a view.
 *
 * @returns How many particles the frame of the light counts.
 */
function amountOf(light: ArxLight, camera: Vector3 | undefined): number {
  if (camera === undefined) {
    return 2
  }

  const distance = camera.distanceToSquared(arxVector3toVector3(light.position))
  const sixth = VIEW_DEPTH / 6
  const third = VIEW_DEPTH / 3

  if (distance < sixth * sixth) {
    return 3
  }

  if (distance < third * third) {
    return 2.5
  }

  return 2
}

/**
 * Spawns the fire of the lights of the level, and moves the particles to the frame.
 *
 * @param now The time of the frame, in milliseconds.
 */
function step(now: number): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  if (loadedMap !== map) {
    loadedMap = map
    clocks.clear()
    pool.length = 0
  }

  // a tab that comes back from the background, or a long frame, does not spawn a second of the fire at once
  let framedelay = 16

  if (lastFrame !== 0) {
    framedelay = Math.min(now - lastFrame, 100)
  }

  lastFrame = now

  let camera: Vector3 | undefined

  for (const view of views) {
    camera = view.cameraPositionOf()

    if (camera !== undefined) {
      break
    }
  }

  for (const light of map.lights) {
    if (!isFireLight(light) || pool.length >= MAX_PARTICLES) {
      continue
    }

    const clock = clocks.get(light) ?? createFlameClock()

    clocks.set(light, clock)

    for (const particle of spawnFireOf(light, clock, framedelay, amountOf(light, camera), now, Math.random)) {
      if (pool.length >= MAX_PARTICLES) {
        break
      }

      pool.push(particle)
    }
  }

  const frames = advanceParticles(pool, now, Math.random)

  for (const view of views) {
    view.update(frames)
    view.render()
  }
}

/**
 * Draws one frame of the particles, and asks for the next one.
 */
function tick(): void {
  ticker = requestAnimationFrame(tick)

  if (!isOn()) {
    return
  }

  step(performance.now())
}

/**
 * Starts or stops the ticker, and hides or shows the particles.
 */
function sync(): void {
  const on = isOn()

  for (const view of views) {
    view.setVisible(particlesVisible.value)
  }

  if (on && ticker === undefined) {
    lastFrame = 0
    ticker = requestAnimationFrame(tick)
  }

  if (!on && ticker !== undefined) {
    cancelAnimationFrame(ticker)
    ticker = undefined
  }

  if (!on) {
    // the field of the view is emptied while the layer is off, so a frame after it does not draw the particles of a
    // level that is not on the screen any more
    for (const view of views) {
      view.update([])
      view.render()
    }
  }
}

/**
 * Takes a view into the layer of the particles.
 *
 * @param view What the view draws and how the layer asks it for a frame.
 *
 * @returns The function that takes the view out of the layer.
 */
export function registerParticlesView(view: ParticleView): () => void {
  views.add(view)
  sync()

  return (): void => {
    views.delete(view)
  }
}

/**
 * Starts the layer of the particles: the switch, the map and the views follow it.
 *
 * @remarks
 * The starts are safe to call twice: the watches are set up once. The layer spawns the fire of every light of the level
 * that has the flag of the fire or the smoke (`isFireLight`), with the game's numbers, and the particles of the moment
 * go to every view that took part in the layer.
 */
export function startParticles(): void {
  watch([particlesVisible, levelStore.map], sync, { immediate: true })

  // a browser tab in the background draws nothing the author can see: the fire stops with the tab, and comes back with it
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', sync)
  }
}
