import type { PerspectiveCamera } from 'three'
import type { ViewScene } from '../shared/viewScene.ts'
import type { CameraControls } from './cameraControls.ts'
import type { OrientationGizmo } from './orientationGizmo.ts'
import { isPickDue } from './pickInterval.ts'

/**
 * The frame loop of the walkable view: when it draws, and how often it picks.
 *
 * @remarks
 * The view draws **on demand**: outside the pointer lock nothing moves the camera, so a frame is only asked for when
 * something changes (the level arrived, the widget was resized, the selection moved). Under the lock the camera moves
 * every frame, and a frame costs a raycast and a render — on a big level a real part of a frame's time — so a view that
 * stands still draws nothing, even while the loop runs.
 *
 * The pick of the crosshair is part of the same economy: a ray through the level runs at most every
 * {@link isPickDue}'s interval, and the frame it was held back on asks for one more when the interval is over — so a
 * camera that stops still outlines the face it stopped on.
 */

/**
 * What the loop reads from the view.
 */
export type FrameLoopContext = {
  /**
   * The scene of the view, when it is built.
   *
   * @returns The scene, or `undefined` before the widget made it.
   */
  readonly view: () => ViewScene<PerspectiveCamera> | undefined
  /**
   * The camera controls of the view, when they listen for the pointer.
   *
   * @returns The controls, or `undefined` before the level arrived.
   */
  readonly controls: () => CameraControls | undefined
  /**
   * Reads the face under the crosshair and tells the outline and the inspector about it.
   */
  readonly pick: () => void
  /**
   * Sweeps the faces under the crosshair into the selection while a drag is on.
   */
  readonly updateDrag: () => void
  /**
   * The compass in the corner of the view.
   *
   * @returns The gizmo, or `undefined` before the widget made it.
   */
  readonly gizmo: () => OrientationGizmo | undefined
  /**
   * Draws the overlays that come after the scene on the same canvas, like the contour of the crosshair.
   */
  readonly afterRender?: () => void
  /**
   * Follows the camera of the frame, before it is drawn.
   *
   * @remarks
   * A handle of the view that stands on the screen (the gizmo of the selection) has to be put on its place again when the
   * camera moves: the place is read through the camera, and a camera that turned leaves the last place behind. The loop
   * runs on every frame of the lock, and the call is a projection of one point.
   */
  readonly follow?: () => void
}

/**
 * The handle of a running frame loop.
 */
export type FrameLoop = {
  /**
   * Whether a frame is waiting for the browser right now.
   */
  readonly isRunning: boolean
  /**
   * Asks for one frame, at most once per animation frame.
   */
  readonly requestRender: () => void
  /**
   * Starts the loop for the movement of the pointer lock, if it is not running already.
   */
  readonly startLoop: () => void
  /**
   * Stops the loop, and drops the frame it was waiting for.
   */
  readonly stop: () => void
  /**
   * Asks for a pick on the next frame: a modifier changed under a standing camera.
   */
  readonly holdPick: () => void
  /**
   * Starts a new pick sequence: the level or its textures changed under the crosshair.
   */
  readonly resetPick: () => void
}

/**
 * Builds the frame loop of a view.
 *
 * @param context What the loop reads from the view.
 *
 * @returns The handle of the loop.
 */
export function createFrameLoop(context: FrameLoopContext): FrameLoop {
  const { view, controls, pick, updateDrag, gizmo } = context

  /**
   * The frame the loop waits for, or `0` when none is asked for.
   */
  /**
   * The frame of the locked loop: the chain that walks the camera while the pointer is locked.
   */
  let frame = 0

  /**
   * The frame of a one-shot request of an idle view.
   *
   * @remarks
   * The two are apart on purpose: a one-shot request replaces its own pending frame, and it must not touch the chain of
   * the loop, which is the movement of the camera (2026-11-19, the owner: the walk stopped under the lock).
   */
  let redrawFrame = 0

  /**
   * The timer that draws a requested frame the browser may have dropped.
   */
  let redrawTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * The timestamp of the last frame of the locked loop, in milliseconds, or `0` before the first one.
   */
  let lastFrameAt = 0

  /**
   * Whether the locked loop has a chain of animation frames of its own.
   *
   * @remarks
   * The chain keeps itself alive (`animate` schedules the next frame at its end), so it has to be watched on its own:
   * a second call of `startLoop` on a running chain used to add **another** chain, and the view drew twice as many
   * frames — the owner saw the drawn frames of the render readout climb without a bound (2026-11-09) while the camera
   * moved. The `frame` id alone can not tell the chain from a one-shot render, so the flag names it.
   */
  let looping = false

  /**
   * The pose of the camera of the last drawn frame, as a string: the locked loop draws only when the camera moved.
   */
  let lastDrawnPose = ''

  /**
   * Whether something else (the level, the selection, the size) asks for a frame of the locked loop.
   */
  let redrawNeeded = false

  /**
   * When the crosshair last picked a face, and whether a pick was held back by the interval.
   */
  let lastPickedAt = 0
  let pickPending = false

  /**
   * Reads the pose of the camera of the view, as one string.
   *
   * @remarks
   * The locked loop compares it with the pose of the last drawn frame: the crosshair pick and the render of a level cost
   * real time on a big level, and a view that stands still has nothing new to pick or to draw.
   *
   * @param viewScene The view to read the camera of.
   *
   * @returns The position and the rotation of the camera, as one string.
   */
  function poseOf(viewScene: ViewScene<PerspectiveCamera>): string {
    const { position, quaternion } = viewScene.camera

    return `${position.x.toFixed(3)},${position.y.toFixed(3)},${position.z.toFixed(3)}|${quaternion.x.toFixed(4)},${quaternion.y.toFixed(4)},${quaternion.z.toFixed(4)},${quaternion.w.toFixed(4)}`
  }

  /**
   * Draws one frame: the scene, then the orientation compass in its own corner.
   *
   * @remarks
   * The crosshair is the center of the canvas, so the pick runs here, on every frame that is drawn: a look around moves
   * the outline with the camera. The gizmo has a canvas of its own over the corner, so it draws after the scene and
   * never touches its frame.
   *
   * @param now The timestamp of the frame, in milliseconds.
   */
  function drawFrame(now: number): void {
    const viewScene = view()

    if (viewScene === undefined) {
      return
    }

    // a frame of the locked loop picks only when the interval is over, and the one that was held back asks for a frame
    // when it is not: a camera that stops still outlines the face under the crosshair
    if (controls()?.isLocked === true && !isPickDue(now, lastPickedAt)) {
      pickPending = true
    } else {
      lastPickedAt = now
      pickPending = false
      pick()
    }

    updateDrag()
    context.follow?.()

    viewScene.renderer.render(viewScene.scene, viewScene.camera)
    context.afterRender?.()
    gizmo()?.render()
  }

  /**
   * Draws the next frame, at most once per animation frame.
   */
  function requestRender(): void {
    redrawNeeded = true

    // the locked loop draws it on its next frame: the camera moves every frame, so there is no frame to ask for
    if (looping) {
      return
    }

    // a frame already asked for draws this state too, so the request waits for it: a caller that asks on every frame
    // (the particles of the level ask as long as their layer is on) would cancel the frame of the last ask over and
    // over, and the view would never draw a picture (2026-11-23, the owner: with the particles on the view stayed
    // blank until the pointer lock)
    if (redrawFrame !== 0) {
      return
    }

    redrawFrame = requestAnimationFrame((now) => {
      redrawFrame = 0
      redrawNeeded = false
      drawFrame(now)
    })

    // the browser may drop the frame it owes (a tab that was in the background, a restored session, a hard reload on a
    // slow level): the view would keep the picture it had, and only the loop of the pointer lock would draw again. The
    // timer draws what the frame did not, and the frame that does come cancels it (2026-11-23, the owner: the view
    // showed nothing until the first pointer lock)
    if (redrawTimer !== undefined) {
      clearTimeout(redrawTimer)
    }

    redrawTimer = setTimeout(() => {
      redrawTimer = undefined

      if (redrawFrame === 0) {
        return
      }

      cancelAnimationFrame(redrawFrame)
      redrawFrame = 0
      redrawNeeded = false
      drawFrame(performance.now())
    }, 500)
  }

  /**
   * Draws the frames for as long as the pointer is locked.
   *
   * @param now The timestamp the browser gave the frame.
   */
  function animate(now: number): void {
    let deltaSeconds = 0

    if (lastFrameAt !== 0) {
      deltaSeconds = (now - lastFrameAt) / 1000
    }

    lastFrameAt = now

    const cameraControls = controls()

    if (!looping || cameraControls?.isLocked !== true) {
      looping = false
      frame = 0
      lastFrameAt = 0

      return
    }

    cameraControls.update(deltaSeconds)

    // a frame costs a raycast and a render, and on a big level that is a real part of a frame's time: the pick only
    // changes when the camera moves (the crosshair is the center of the canvas) or when the level under it changes, so
    // a locked view that stands still draws nothing
    const viewScene = view()
    let pose = ''

    if (viewScene !== undefined) {
      pose = poseOf(viewScene)
    }

    if (pose !== lastDrawnPose || redrawNeeded || (pickPending && isPickDue(now, lastPickedAt))) {
      lastDrawnPose = pose
      redrawNeeded = false
      drawFrame(now)
    }

    frame = requestAnimationFrame(animate)
  }

  /**
   * Starts the locked movement loop, if it is not running already.
   */
  function startLoop(): void {
    // one chain, however often it is asked for: a second chain would keep drawing beside the first
    if (looping) {
      return
    }

    looping = true
    lastFrameAt = 0

    // the loop draws the frame a request of an idle view may have asked for
    if (redrawFrame !== 0) {
      cancelAnimationFrame(redrawFrame)
      redrawFrame = 0
    }

    frame = requestAnimationFrame(animate)
  }

  /**
   * Recolors the outline of the face under the crosshair after a modifier key went down or up.
   *
   * @remarks
   * The mode of the next click is read from the keys, and the keys change without a mouse move: a `Ctrl` pressed over a
   * view that stands still used to leave the outline green until the pointer moved again (2026-11-05, the owner's bug
   * report). The pick is taken again on the next frame — the held back pick is what a frame that stands still waits for
   * — so the outline is red before the click.
   */
  function holdPick(): void {
    lastPickedAt = 0
    pickPending = true
    requestRender()
  }

  /**
   * Starts a new pick sequence, without asking for a frame.
   */
  function resetPick(): void {
    lastPickedAt = 0
    pickPending = false
  }

  return {
    requestRender,
    startLoop,
    holdPick,
    resetPick,
    stop: (): void => {
      looping = false

      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }

      if (redrawFrame !== 0) {
        cancelAnimationFrame(redrawFrame)
        redrawFrame = 0
      }

      if (redrawTimer !== undefined) {
        clearTimeout(redrawTimer)
        redrawTimer = undefined
      }
    },
    get isRunning(): boolean {
      return frame !== 0 || redrawFrame !== 0
    },
  }
}
