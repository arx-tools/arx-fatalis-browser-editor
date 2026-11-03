import { shallowRef, type ShallowRef } from 'vue'
import { formatCount, formatSize } from '../../modules/format.ts'

/**
 * The window the frame rate is measured over, in milliseconds.
 */
export const FRAME_WINDOW_MS = 1000

/**
 * How often the rows of the widget are rebuilt, in milliseconds.
 *
 * @remarks
 * The loop samples every animation frame, but the numbers move slowly: rewriting the rows of a Vue widget sixty times
 * a second would cost more than the readout is worth.
 */
export const ROWS_INTERVAL_MS = 250

/**
 * The value a row shows while the renderer is not there (no walkable view on the dock yet).
 */
const PENDING_VALUE = '…'

/**
 * One row of the performance readout.
 */
export interface RenderPerformanceRow {
  /**
   * The name shown on the left.
   */
  readonly label: string
  /**
   * The number shown on the right, already formatted.
   */
  readonly value: string
}

/**
 * The counters of the last frame a renderer drew.
 */
export interface RenderCounters {
  /**
   * The draw calls of the last frame.
   */
  readonly calls: number
  /**
   * The triangles of the last frame.
   */
  readonly triangles: number
  /**
   * How many frames the renderer drew since it was made (three's `info.render.frame`, a counter that is never reset).
   */
  readonly frames: number
}

/**
 * The members of a renderer the readout asks.
 *
 * @remarks
 * Only these three are needed, so the module does not depend on the whole `WebGLRenderer` of three (and a test can
 * hand it a plain object). The walkable view passes its real renderer.
 */
export interface RendererReadout {
  /**
   * The counters of the renderer: `render.calls` and `render.triangles` belong to the last frame, `render.frame` is
   * the number of the frames it drew since it was made.
   */
  readonly info: { readonly render: { readonly calls: number; readonly triangles: number; readonly frame: number } }
  /**
   * The canvas the renderer draws into; its width and height are the drawing buffer, in pixels.
   */
  readonly domElement: { readonly width: number; readonly height: number }
  /**
   * The ratio the renderer draws at, so a scaled display shows the buffer it fills.
   *
   * @returns The pixel ratio of the renderer.
   */
  readonly getPixelRatio: () => number
}

/**
 * The renderer the readout asks.
 *
 * @remarks
 * The walkable view owns the renderer, and the widget is its own Vue app, so the view **registers** the renderer here
 * the way it registers the camera driver: the two widgets can not reach each other through a component tree (see
 * `cameraStore`).
 */
export interface RenderPerformanceStore {
  /**
   * The renderer of the walkable view, or `undefined` while there is none.
   */
  readonly renderer: ShallowRef<RendererReadout | undefined>
  /**
   * Registers the renderer of a view, or drops it when the view goes away.
   *
   * @param renderer The renderer, or `undefined` to drop the one that is there.
   */
  readonly setRenderer: (renderer: RendererReadout | undefined) => void
}

/**
 * Builds the store the readout reads.
 *
 * @returns The store, with no renderer.
 */
export function createRenderPerformanceStore(): RenderPerformanceStore {
  const renderer = shallowRef<RendererReadout>()

  return {
    renderer,
    setRenderer: (next: RendererReadout | undefined): void => {
      renderer.value = next
    },
  }
}

/**
 * The renderer of the editor.
 *
 * @remarks
 * A module level singleton, for the same reason as the camera store: a dock widget is its own Vue app.
 */
export const renderPerformanceStore: RenderPerformanceStore = createRenderPerformanceStore()

/**
 * The rate of the frames the browser presents.
 */
export interface FrameRate {
  /**
   * The frames per second.
   */
  readonly fps: number
  /**
   * The time between two frames, in milliseconds.
   */
  readonly frameTimeMs: number
}

/**
 * Reads the frame rate of a window of animation frame timestamps.
 *
 * @remarks
 * The timestamps are the `now` of the animation frame callbacks, in order. The rate is the count of the intervals
 * over their total length, so a window that holds two frames gives the same number as a long one — only the measured
 * span has to be non-zero. This is the rate the browser presents at: the walkable view draws on demand, so the rate
 * of the *drawn* frames is a separate number ({@link drawnPerSecondOf}).
 *
 * @param timestamps The timestamps of the frames, oldest first.
 *
 * @returns The rate, zero when the window holds less than two frames.
 */
export function frameRateOf(timestamps: readonly number[]): FrameRate {
  const first = timestamps[0]
  const last = timestamps.at(-1)
  const intervals = timestamps.length - 1

  if (first === undefined || last === undefined || intervals < 1) {
    return { fps: 0, frameTimeMs: 0 }
  }

  const elapsed = last - first

  if (elapsed <= 0) {
    return { fps: 0, frameTimeMs: 0 }
  }

  return { fps: (intervals * 1000) / elapsed, frameTimeMs: elapsed / intervals }
}

/**
 * One sample of the frame counter of a renderer.
 */
export interface DrawSample {
  /**
   * The frame counter of the renderer at the sample.
   */
  readonly frames: number
  /**
   * The time of the sample, in milliseconds.
   */
  readonly at: number
}

/**
 * Reads how many frames a renderer drew per second between two samples.
 *
 * @remarks
 * The view draws on demand, so a standing camera draws nothing at all and the number is zero; while the camera moves
 * it follows the frame rate. A counter that went backwards (the renderer was made again) gives nothing rather than a
 * negative rate.
 *
 * @param previous The earlier sample.
 * @param next The later sample.
 *
 * @returns The drawn frames per second, zero when the samples do not make a rate.
 */
export function drawnPerSecondOf(previous: DrawSample, next: DrawSample): number {
  const elapsed = next.at - previous.at
  const drawn = next.frames - previous.frames

  if (elapsed <= 0 || drawn < 0) {
    return 0
  }

  return (drawn * 1000) / elapsed
}

/**
 * What the widget shows about one moment.
 */
export interface RenderPerformanceSample {
  /**
   * The frames per second the browser presents.
   */
  readonly fps: number
  /**
   * The time between two frames, in milliseconds.
   */
  readonly frameTimeMs: number
  /**
   * How many frames the walkable view drew in the last second.
   */
  readonly drawnPerSecond: number
  /**
   * The counters of the last drawn frame.
   */
  readonly counters: RenderCounters
  /**
   * The device pixel ratio the renderer draws at.
   */
  readonly pixelRatio: number
  /**
   * The width of the drawing buffer of the canvas, in pixels.
   */
  readonly width: number
  /**
   * The height of the drawing buffer of the canvas, in pixels.
   */
  readonly height: number
}

/**
 * Builds the rows of the readout.
 *
 * @remarks
 * The rows are the same before and after a view arrives, so the widget does not jump: without a renderer every value
 * is a single `…`. The **FPS** row is the rate the browser presents at, the **Drawn frames** row is what the view
 * actually drew — with a standing camera the first is the display rate and the second is zero, which is the point of
 * the two rows.
 *
 * @param sample The moment to show, or `undefined` while no walkable view is on the dock.
 *
 * @returns The rows, in the order the widget shows them.
 */
export function renderPerformanceRows(sample?: RenderPerformanceSample): RenderPerformanceRow[] {
  if (sample === undefined) {
    return [
      { label: 'FPS', value: PENDING_VALUE },
      { label: 'Frame time', value: PENDING_VALUE },
      { label: 'Drawn frames', value: PENDING_VALUE },
      { label: 'Draw calls', value: PENDING_VALUE },
      { label: 'Triangles', value: PENDING_VALUE },
      { label: 'Pixel ratio', value: PENDING_VALUE },
      { label: 'Canvas', value: PENDING_VALUE },
    ]
  }

  return [
    { label: 'FPS', value: sample.fps.toFixed(1) },
    { label: 'Frame time', value: `${sample.frameTimeMs.toFixed(2)} ms` },
    { label: 'Drawn frames', value: `${sample.drawnPerSecond.toFixed(1)} / s` },
    { label: 'Draw calls', value: formatCount(sample.counters.calls) },
    { label: 'Triangles', value: formatCount(sample.counters.triangles) },
    { label: 'Pixel ratio', value: sample.pixelRatio.toFixed(2) },
    { label: 'Canvas', value: formatSize(sample.width, sample.height) },
  ]
}
