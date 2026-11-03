import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRenderPerformanceStore,
  drawnPerSecondOf,
  frameRateOf,
  renderPerformanceRows,
  type RendererReadout,
  type RenderPerformanceSample,
} from '../../../../src/editor/components/widgets/renderPerformance.ts'

/**
 * A sample of the readout, with the counters of a big level.
 *
 * @param fps The frames per second to show.
 *
 * @returns The sample the rows are built from.
 */
function sampleOf(fps = 60): RenderPerformanceSample {
  return {
    fps,
    frameTimeMs: 16.67,
    drawnPerSecond: 42.5,
    counters: { calls: 46_590, triangles: 123_617, frames: 7 },
    pixelRatio: 1,
    width: 923,
    height: 765,
  }
}

void describe('frameRateOf', () => {
  void it('gives nothing for a window that is too small to hold a rate', () => {
    assert.deepEqual(frameRateOf([]), { fps: 0, frameTimeMs: 0 })
    assert.deepEqual(frameRateOf([1000]), { fps: 0, frameTimeMs: 0 })
  })

  void it('reads sixty frames a second from a second of animation frames', () => {
    const timestamps = Array.from({ length: 61 }, (_, index) => {
      return index * (1000 / 60)
    })
    const rate = frameRateOf(timestamps)
    const frameTime = 1000 / 60

    assert.ok(Math.abs(rate.fps - 60) < 0.01)
    assert.ok(Math.abs(rate.frameTimeMs - frameTime) < 0.01)
  })

  void it('gives nothing when the frames share a timestamp', () => {
    assert.deepEqual(frameRateOf([500, 500]), { fps: 0, frameTimeMs: 0 })
  })
})

void describe('drawnPerSecondOf', () => {
  void it('counts the frames the renderer drew between two samples', () => {
    assert.equal(drawnPerSecondOf({ frames: 100, at: 2000 }, { frames: 130, at: 2500 }), 60)
  })

  void it('gives nothing for a standing camera', () => {
    assert.equal(drawnPerSecondOf({ frames: 100, at: 2000 }, { frames: 100, at: 3000 }), 0)
  })

  void it('gives nothing when the samples make no rate', () => {
    assert.equal(drawnPerSecondOf({ frames: 100, at: 2000 }, { frames: 100, at: 2000 }), 0)
    assert.equal(drawnPerSecondOf({ frames: 100, at: 2000 }, { frames: 90, at: 3000 }), 0)
  })
})

void describe('renderPerformanceRows', () => {
  void it('shows the pending dots while there is no renderer', () => {
    const rows = renderPerformanceRows()

    assert.deepEqual(
      rows.map((row) => {
        return row.label
      }),
      ['FPS', 'Frame time', 'Drawn frames', 'Draw calls', 'Triangles', 'Pixel ratio', 'Canvas'],
    )
    assert.ok(
      rows.every((row) => {
        return row.value === '…'
      }),
    )
  })

  void it('writes the numbers of the sample', () => {
    const rows = renderPerformanceRows(sampleOf())

    assert.deepEqual(
      rows.map((row) => {
        return `${row.label}=${row.value}`
      }),
      [
        'FPS=60.0',
        'Frame time=16.67 ms',
        'Drawn frames=42.5 / s',
        'Draw calls=46 590',
        'Triangles=123 617',
        'Pixel ratio=1.00',
        'Canvas=923 × 765',
      ],
    )
  })

  void it('writes the pixel ratio of a scaled display', () => {
    const rows = renderPerformanceRows({ ...sampleOf(), pixelRatio: 1.5 })

    assert.equal(rows.at(5)?.value, '1.50')
  })
})

void describe('createRenderPerformanceStore', () => {
  void it('registers the renderer of a view and drops it again', () => {
    const store = createRenderPerformanceStore()
    const renderer: RendererReadout = {
      info: { render: { calls: 46_590, triangles: 123_617, frame: 7 } },
      domElement: { width: 923, height: 765 },
      getPixelRatio: () => {
        return 1
      },
    }

    assert.equal(store.renderer.value, undefined)

    store.setRenderer(renderer)
    assert.equal(store.renderer.value, renderer)

    store.setRenderer(undefined)
    assert.equal(store.renderer.value, undefined)
  })
})
