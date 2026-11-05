import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import {
  createFrameLoop,
  type FrameLoopContext,
} from '../../../../../src/editor/components/widgets/View3DWidget/frameLoop.ts'

/**
 * The animation frames the test hands out: the browser's are asynchronous, and the loop is only worth testing when the
 * test decides when a frame runs.
 */
const frames = new Map<number, (now: number) => void>()
let nextHandle = 1

const realRequestAnimationFrame = globalThis.requestAnimationFrame
const realCancelAnimationFrame = globalThis.cancelAnimationFrame

Object.defineProperties(globalThis, {
  requestAnimationFrame: {
    value: (callback: (now: number) => void): number => {
      const handle = nextHandle

      nextHandle = nextHandle + 1
      frames.set(handle, callback)

      return handle
    },
    configurable: true,
    writable: true,
  },
  cancelAnimationFrame: {
    value: (handle: number): void => {
      frames.delete(handle)
    },
    configurable: true,
    writable: true,
  },
})

// a test that leaves a frame queued would run it in the next one
beforeEach(() => {
  frames.clear()
})

// the browser's frames go back for the specs that come after this file
after(() => {
  Object.defineProperties(globalThis, {
    requestAnimationFrame: { value: realRequestAnimationFrame, configurable: true, writable: true },
    cancelAnimationFrame: { value: realCancelAnimationFrame, configurable: true, writable: true },
  })
})

/**
 * Runs the frame the loop is waiting for.
 *
 * @param now The timestamp of the frame.
 */
function nextFrame(now: number): void {
  const [handle, callback] = frames.entries().next().value ?? []

  if (handle === undefined || callback === undefined) {
    return
  }

  frames.delete(handle)
  callback(now)
}

/**
 * What the test counts of the loop's work.
 */
interface Counts {
  draws: number
  picks: number
  drags: number
  gizmos: number
}

/**
 * Builds a loop over a fake view.
 *
 * @param locked Whether the pointer is locked (the camera moves every frame).
 *
 * @returns The loop, its counts and the fake scene.
 */
function loopOf(locked = false): {
  loop: ReturnType<typeof createFrameLoop>
  counts: Counts
  scene: {
    camera: {
      position: { x: number; y: number; z: number }
      quaternion: { x: number; y: number; z: number; w: number }
    }
  }
} {
  const counts: Counts = { draws: 0, picks: 0, drags: 0, gizmos: 0 }
  const scene = {
    camera: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
    renderer: {
      render: (): void => {
        counts.draws = counts.draws + 1
      },
    },
    scene: {},
  }

  const context = {
    view: () => {
      return scene
    },
    controls: () => {
      return {
        isLocked: locked,
        update: (): void => {
          // the camera does not move: the loop can not draw on its own
        },
      }
    },
    pick: (): void => {
      counts.picks = counts.picks + 1
    },
    updateDrag: (): void => {
      counts.drags = counts.drags + 1
    },
    gizmo: () => {
      return {
        render: (): void => {
          counts.gizmos = counts.gizmos + 1
        },
      }
    },
  } as unknown as FrameLoopContext

  return { loop: createFrameLoop(context), counts, scene }
}

void describe('the frame loop of the walkable view', () => {
  void it('draws a frame when something asks for it', () => {
    const { loop, counts } = loopOf()

    loop.requestRender()

    assert.equal(frames.size, 1)

    nextFrame(16)

    assert.equal(counts.draws, 1)
    assert.equal(counts.gizmos, 1)
    assert.equal(frames.size, 0)
  })

  void it('draws one frame however many changes ask for it', () => {
    const { loop, counts } = loopOf()

    loop.requestRender()
    loop.requestRender()
    loop.requestRender()

    assert.equal(frames.size, 1)

    nextFrame(16)

    assert.equal(counts.draws, 1)
  })

  void it('asks for nothing while the camera stands still', () => {
    const { loop, counts } = loopOf()

    loop.requestRender()
    nextFrame(16)

    // the loop is not running: nothing queues the next frame
    assert.equal(frames.size, 0)
    assert.equal(counts.draws, 1)
  })

  void it('keeps the frames going under the pointer lock', () => {
    const { loop } = loopOf(true)

    loop.startLoop()
    nextFrame(16)

    assert.equal(frames.size, 1)
  })

  void it('draws a standing camera again only when a pick is due', () => {
    const { loop, counts } = loopOf(true)

    loop.startLoop()

    // the first frame draws, but the pick is held back: the interval is counted from the start, not from a pick
    nextFrame(16)

    assert.equal(counts.draws, 1)
    assert.equal(counts.picks, 0)

    // inside the interval the standing camera draws nothing
    nextFrame(32)

    assert.equal(counts.draws, 1)

    // the interval is over: the held back pick asks for the frame, so the outline follows the keys
    nextFrame(80)

    assert.equal(counts.draws, 2)
    assert.equal(counts.picks, 1)
  })

  void it('picks once when the modifier keys ask for it', () => {
    const { loop, counts } = loopOf()

    loop.requestRender()
    nextFrame(16)

    assert.equal(counts.picks, 1)

    // a modifier changed under a standing camera: the outline has to be red before the click
    loop.holdPick()
    nextFrame(20)

    assert.equal(counts.picks, 2)
  })

  void it('stops the loop and drops the frame it was waiting for', () => {
    const { loop, counts } = loopOf(true)

    loop.startLoop()

    assert.equal(loop.isRunning, true)

    loop.stop()

    assert.equal(loop.isRunning, false)
    assert.equal(frames.size, 0)

    // the frame was cancelled: a stale timestamp does not draw anything
    assert.equal(counts.draws, 0)
  })
})
