/**
 * A step of a level load: how far it is, and what the machine works on.
 *
 * @remarks
 * The cover over the editor reads the progress (see `LoadingOverlay`): the label says what the load is doing, and the
 * percent fills its bar. The steps are coarse on purpose: the load of a level is a few seconds, and a bar that jumps
 * with every file reads as uncertainty. The numbers follow the measured time of a level of the game (level 1,
 * 2026-11-27: 5.3 MB FTS, 1.3 s unpack, 119 ms parse, ~1 s textures, 3.5 s bake with the shadows), so a step that takes
 * longer also moves the bar more slowly.
 */
export type LoadProgress = {
  /**
   * The part of the load that is done, in percent, from 0 to 100.
   */
  readonly percent: number
  /**
   * What the load is doing, in the words of the cover.
   */
  readonly label: string
}

/**
 * Receives the progress of a load.
 *
 * @remarks
 * A step calls it as often as it can report: the reader of the progress keeps the last value and the highest percent,
 * so a step that reports many times is free to do so.
 */
export type LoadProgressHandler = (progress: LoadProgress) => void

/**
 * The steps of a load, and where each of them starts, in percent.
 *
 * @remarks
 * A level of the editor (the blank one) runs through them in a blink: the cover shows the same steps whatever the
 * level is, so the words do not tell a level of the game from a blank one before the level arrives.
 */
export const LOAD_STEPS = {
  start: { percent: 0, label: 'Preparing the level…' },
  source: { percent: 1, label: 'Reading the level files…' },
  description: { percent: 3, label: 'Unpacking the description…' },
  scene: { percent: 6, label: 'Unpacking the scene…' },
  lighting: { percent: 26, label: 'Unpacking the lighting…' },
  build: { percent: 30, label: 'Building the level…' },
  textures: { percent: 40, label: 'Reading the textures…' },
  paint: { percent: 55, label: 'Painting the level…' },
  bake: { percent: 56, label: 'Baking the lights…' },
  baked: { percent: 95, label: 'Applying the light…' },
  done: { percent: 100, label: 'Opening the level…' },
} as const

/**
 * The name of a step of {@link LOAD_STEPS}.
 */
export type LoadStep = keyof typeof LOAD_STEPS

/**
 * How long a step lets the page paint before the next one starts, in milliseconds.
 *
 * @remarks
 * A frame's worth of delay: the work of a step is synchronous (the unpack of the scene is 1.3 s), so the page can only
 * paint in the gaps between the steps. A `requestAnimationFrame` would be the natural way to wait for that frame, but a
 * hidden tab never fires one, and the load would wait forever: a macrotask does the same job and always runs (the
 * export dialog waits for its percentage the same way).
 */
const PAINT_PAUSE_IN_MS = 16

/**
 * The progress of a step, read from {@link LOAD_STEPS}.
 *
 * @param step The step the load is on.
 *
 * @returns The percent and the label of that step, as a copy the caller may keep.
 */
export function progressOfStep(step: LoadStep): LoadProgress {
  return { percent: LOAD_STEPS[step].percent, label: LOAD_STEPS[step].label }
}

/**
 * The progress between two steps, at a part of the way.
 *
 * @param label What the load is doing in between.
 * @param start Where the range starts, in percent.
 * @param end Where the range ends, in percent.
 * @param fraction How much of the range is done, from 0 to 1.
 *
 * @returns The percent of that part of the range, rounded, and the label.
 */
export function progressBetween(label: string, start: number, end: number, fraction: number): LoadProgress {
  const part = Math.min(Math.max(fraction, 0), 1)
  const span = (end - start) * part

  return { percent: Math.round(start + span), label }
}

/**
 * How much of a counted work is done.
 *
 * @param done The items that are done.
 * @param total The items to do, which may be zero.
 *
 * @returns The part of the work, from 0 to 1; a work of no items is done.
 */
function fractionOf(done: number, total: number): number {
  if (total <= 0) {
    return 1
  }

  return Math.min(done / total, 1)
}

/**
 * The progress of the textures: the reads, then the decodes.
 *
 * @param done The texture steps that are done (a read and a decode are a step each).
 * @param total The texture steps of the level.
 *
 * @returns The progress between the two steps of the paint.
 */
export function textureProgress(done: number, total: number): LoadProgress {
  return progressBetween(
    LOAD_STEPS.textures.label,
    LOAD_STEPS.textures.percent,
    LOAD_STEPS.paint.percent,
    fractionOf(done, total),
  )
}

/**
 * The progress of the bake of the palette.
 *
 * @param done The corners that are baked.
 * @param total The corners of the level.
 *
 * @returns The progress between the start and the end of the bake.
 */
export function bakeProgress(done: number, total: number): LoadProgress {
  return progressBetween(
    LOAD_STEPS.bake.label,
    LOAD_STEPS.bake.percent,
    LOAD_STEPS.baked.percent,
    fractionOf(done, total),
  )
}

/**
 * Keeps the furthest percent of two reports, with the label of the later one.
 *
 * @remarks
 * The load reports the steps in the order it runs them, but a step may report a smaller percent than the last one (a
 * counted work that ends early, a zip that falls back to a blank level): the bar must not walk back, while the label
 * still says what the load does now.
 *
 * @param previous The progress on the cover.
 * @param next The progress a step just reported.
 *
 * @returns The two, with the higher percent.
 */
export function laterOf(previous: LoadProgress, next: LoadProgress): LoadProgress {
  if (next.percent < previous.percent) {
    return { percent: previous.percent, label: next.label }
  }

  return next
}

/**
 * Gives the page a frame to paint the progress of the load.
 *
 * @returns A promise that settles after the pause.
 */
export async function letTheCoverPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, PAINT_PAUSE_IN_MS)
  })
}

/**
 * Reports a step of the load, and lets the page paint it before the work of the step starts.
 *
 * @remarks
 * A step that runs on the main thread (the unpack of the scene, the mesh of the level) freezes the page for as long as
 * it runs: the words of the cover are the only thing the author has, so they have to be on the screen **before** the
 * work starts. A caller without a reader (the tests, a load without a cover) waits for nothing.
 *
 * @param onProgress The reader of the progress, when there is one.
 * @param progress The step the load is on.
 */
export async function announceProgress(
  onProgress: LoadProgressHandler | undefined,
  progress: LoadProgress,
): Promise<void> {
  if (onProgress === undefined) {
    return
  }

  onProgress(progress)
  await letTheCoverPaint()
}
