import type { ArxRotation, ArxVector3 } from 'arx-convert/types'
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { arxVector3toVector3 } from '../../../generator/meshes.ts'
import { isKeyboardActionActive, setPointerLocked, startKeyboard } from '../keyboard/keyboard.ts'
import {
  applyGameAngle,
  gamePositionToWorld,
  isGameAngleInRange,
  readGameAngle,
  worldPositionToGame,
} from './cameraPose.ts'
import { cameraAngle, cameraPosition } from './cameraState.ts'

/**
 * How far the camera moves in one second, in the level's units.
 *
 * @remarks
 * The archived loop moved `10` units per frame with no delta: at the 60 fps it was tuned on, that is
 * this speed. The loop here multiplies it with the elapsed time, so a slow frame does not slow the
 * camera down (and a fast one does not speed it up).
 */
const CAMERA_SPEED = 600

/**
 * What the camera controls need from the widget.
 */
export interface CameraControlsOptions {
  /**
   * The element the pointer lock is requested on (the canvas of the view).
   */
  readonly canvas: HTMLCanvasElement
  /**
   * The camera to move.
   */
  readonly camera: PerspectiveCamera
  /**
   * The scene position of the level, for the game ↔ three conversions.
   */
  readonly scene: ArxVector3
  /**
   * Where the camera starts when the url does not name a pose.
   */
  readonly playerPosition: ArxVector3
  /**
   * The `angleEdit` of the level: the way the player faces when it enters it.
   */
  readonly playerOrientation: ArxRotation
  /**
   * Called when the pose of the camera changed, so the widget can draw its readout.
   */
  readonly onPoseChange?: () => void
  /**
   * Called when the pointer lock is taken or released.
   *
   * @param locked True while the pointer is locked.
   */
  readonly onLockChange?: (locked: boolean) => void
}

/**
 * The camera of the 3D view: the pointer lock look, the WASD movement and the url persistence.
 *
 * @remarks
 * - the pointer lock comes from three's `PointerLockControls`: a click on the canvas locks the pointer,
 * a lost focus releases it
 * - the movement reads the `moveForward` / `moveBackward` / `moveLeft` / `moveRight` / `moveSlower`
 * actions of the keyboard module, which are `hold` actions and only fire while the pointer is locked.
 * The side steps stay horizontal; walking forward follows the view, exactly like the archived editor
 * - the pose is written into the `positionAt` and `angle` refs (in the game's coordinates), so the url
 * carries the camera and a link can be shared
 */
export class CameraControls {
  private readonly options: CameraControlsOptions
  private readonly controls: PointerLockControls
  private readonly facing = new Vector3()
  private readonly direction = new Vector3()

  /**
   * Sets up the pointer lock and puts the camera to its starting pose.
   *
   * @param options The canvas, the camera and the level the camera works with.
   */
  constructor(options: CameraControlsOptions) {
    this.options = options
    this.controls = new PointerLockControls(options.camera, options.canvas)

    startKeyboard()
    options.canvas.addEventListener('click', this.handleCanvasClick)
    this.controls.addEventListener('change', this.handleCameraChange)
    this.controls.addEventListener('lock', this.handleLock)
    this.controls.addEventListener('unlock', this.handleUnlock)

    this.applyStoredPose()
  }

  /**
   * Tells whether the scene holds the pointer.
   *
   * @returns True while the pointer is locked.
   */
  get isLocked(): boolean {
    return this.controls.isLocked
  }

  /**
   * Takes the pointer, so the mouse looks around.
   */
  lock(): void {
    this.controls.lock()
  }

  /**
   * Gives the pointer back.
   */
  unlock(): void {
    this.controls.unlock()
  }

  /**
   * Moves the camera with the held keys.
   *
   * @param deltaSeconds The time elapsed since the last update, in seconds.
   *
   * @returns True when the camera moved, so the caller can redraw.
   */
  update(deltaSeconds: number): boolean {
    if (!this.controls.isLocked) {
      return false
    }

    const { camera } = this.options

    camera.getWorldDirection(this.facing)
    this.direction.set(0, 0, 0)

    if (isKeyboardActionActive('moveLeft')) {
      this.addSideStep(90)
    }

    if (isKeyboardActionActive('moveRight')) {
      this.addSideStep(-90)
    }

    if (isKeyboardActionActive('moveForward')) {
      this.direction.add(this.facing)
    }

    if (isKeyboardActionActive('moveBackward')) {
      this.direction.add(this.facing.clone().negate())
    }

    if (this.direction.lengthSq() === 0) {
      return false
    }

    let speed = CAMERA_SPEED

    if (isKeyboardActionActive('moveSlower')) {
      speed = CAMERA_SPEED / 2
    }

    this.direction.normalize().multiplyScalar(speed * deltaSeconds)
    camera.position.add(this.direction)
    this.storePose()

    return true
  }

  /**
   * Reads the pose of the camera and hands it to the persisted refs.
   *
   * The refs write the url with a throttle, so this can be called on every frame.
   */
  storePose(): void {
    const { camera, scene } = this.options
    const position = worldPositionToGame(camera.position, scene)
    const { pitch, yaw } = readGameAngle(camera)

    cameraPosition.value = [position.x, position.y, position.z]
    cameraAngle.value = [pitch, yaw, 0]
    this.options.onPoseChange?.()
  }

  /**
   * Detaches every listener.
   */
  dispose(): void {
    this.options.canvas.removeEventListener('click', this.handleCanvasClick)
    this.controls.removeEventListener('change', this.handleCameraChange)
    this.controls.removeEventListener('lock', this.handleLock)
    this.controls.removeEventListener('unlock', this.handleUnlock)
    this.controls.disconnect()
    setPointerLocked(false)
  }

  /**
   * Puts the camera where the url asked for it, or to the player start of the level.
   */
  private applyStoredPose(): void {
    const { camera, scene, playerPosition, playerOrientation } = this.options
    const position = cameraPosition.value
    const angle = cameraAngle.value

    if (position === undefined) {
      // the player position of the DLF is already in the mesh's own space (the mesh is shifted by the
      // scene position, the spawn is not), so it only has to be mirrored - the archived editor did the
      // same, and subtracting the scene position would put the camera outside the level
      camera.position.copy(arxVector3toVector3(playerPosition))
      // The game puts the player to `pos_edit` (relative to the scene position) and turns it to
      // `angle_edit` on a level load, then zeroes the pitch, so only the yaw of the level survives
      // (`src/core/Core.cpp`: `player.angle.setPitch(0)`). The editor does the same.
      applyGameAngle(camera, { pitch: 0, yaw: playerOrientation.b })
    } else {
      const [x, y, z] = position

      camera.position.copy(gamePositionToWorld({ x, y, z }, scene))
    }

    if (angle !== undefined) {
      const [pitch, yaw] = angle
      const gameAngle = { pitch, yaw }

      if (isGameAngleInRange(gameAngle)) {
        applyGameAngle(camera, gameAngle)
      } else {
        console.warn(`[camera] ignoring the angle from the url: ${angle.join(',')}`)
      }
    }

    this.storePose()
  }

  /**
   * Adds a side step to the movement: the facing turned by the given degrees around the vertical axis.
   *
   * @param degrees The angle to turn the facing with, in degrees.
   */
  private addSideStep(degrees: number): void {
    const rotation = new Euler(0, MathUtils.degToRad(degrees), 0, 'XYZ')
    const side = this.facing.clone().applyEuler(rotation)
    side.y = 0
    this.direction.add(side)
  }

  /**
   * Follows the camera when the mouse turned it.
   *
   * @remarks
   * `PointerLockControls` moves the camera itself and fires `change` on every mouse move, so the readout
   * and the url follow the look, not just the keys.
   */
  private readonly handleCameraChange = (): void => {
    this.storePose()
  }

  /**
   * Locks the pointer when the canvas is clicked.
   */
  private readonly handleCanvasClick = (): void => {
    this.lock()
  }

  /**
   * Tells the keyboard module that the movement is allowed now.
   */
  private readonly handleLock = (): void => {
    setPointerLocked(true)
    this.storePose()
    this.options.onLockChange?.(true)
  }

  /**
   * Tells the keyboard module that the pointer is free again.
   */
  private readonly handleUnlock = (): void => {
    setPointerLocked(false)
    this.storePose()
    this.options.onLockChange?.(false)
  }
}
