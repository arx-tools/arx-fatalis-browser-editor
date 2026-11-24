import type { ArxLight, ArxVector3 } from 'arx-convert/types'
import { Object3D, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { watch } from 'vue'
import { MIN_SCALE_FACTOR } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetLightRecord } from '../../../modules/history/records/lights.ts'
import type { SetLightEdit } from '../../../modules/history/records/types.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { cloneLightOf, lightsRevision, touchLights } from '../../../modules/level/edit/lightEditing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { refreshLightPalette, type LightPaletteChange } from '../../../modules/level/edit/lightPalette.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { scaleVisible, transformVisible } from '../shared/editModes.ts'
import { GAME_TURN, LOCK_GUARD_MS } from './selectionGizmo.ts'

/**
 * The place of a light in the space of the scene.
 *
 * @remarks
 * The renderer mirrors the two first axes of the game, the way the mesh does: the game's X and Y point the other way
 * in three's world, and the Z is the same. The lights of the LLF are relative to the scene, so no offset comes in.
 *
 * @param position The position of the light, in the game's coordinates.
 *
 * @returns The same place, in the world of the view.
 */
export function worldPositionOf(position: ArxVector3): Vector3 {
  return arxVector3toVector3(position)
}

/**
 * The place of a light in the game's coordinates, from a point of the world.
 *
 * @param world The point of the world.
 *
 * @returns The place, in the game's coordinates.
 */
export function gamePositionOf(world: Vector3): ArxVector3 {
  return { x: -world.x, y: -world.y, z: world.z }
}

/**
 * The place a light takes when the gizmo moves it by an offset of the world.
 *
 * @remarks
 * The offset is the one of the drag in the world of the view, and the game's axes are the mirrored ones: a move of +X
 * on the screen takes the game's X the other way, and the Z is the same.
 *
 * @param position The place of the light before the move, in the game's coordinates.
 * @param offset The offset of the drag, in the world of the view.
 *
 * @returns The place after the move, in the game's coordinates.
 */
export function movedGamePositionOf(position: ArxVector3, offset: ArxVector3): ArxVector3 {
  return { x: position.x - offset.x, y: position.y - offset.y, z: position.z + offset.z }
}

/**
 * The factor of a drag of the scale gizmo.
 *
 * @remarks
 * The scale gizmo of three gives three factors, one per axis, and a light has one: the falloff is a sphere. The factor
 * of the drag is the one of the axis that moved the most, so a drag of any handle scales the two radii together. A
 * drag of the middle handle moves all three of them the same way, and the factor is that one.
 *
 * @param scale The scale the proxy of the gizmo has taken.
 *
 * @returns The factor of the two radii, 1 for a drag that did not move.
 */
export function scaleFactorOf(scale: Vector3): number {
  let factor = 1

  for (const axis of [scale.x, scale.y, scale.z]) {
    if (Math.abs(axis - 1) > Math.abs(factor - 1)) {
      factor = axis
    }
  }

  return factor
}

/**
 * The two radii of a light, scaled by one factor.
 *
 * @remarks
 * The two radii scale together, so the shape of the falloff is the one the light had, only bigger or smaller. A factor
 * below {@link MIN_SCALE_FACTOR} keeps the smallest radius the level takes, the way a scale of faces does: a light does
 * not turn inside out.
 *
 * @param fallStart The start of the falloff of the light.
 * @param fallEnd The end of it.
 * @param factor The factor of the drag.
 *
 * @returns The two radii after the drag.
 */
export function scaledRadiiOf(
  fallStart: number,
  fallEnd: number,
  factor: number,
): { readonly fallEnd: number; readonly fallStart: number } {
  const clamped = Math.max(MIN_SCALE_FACTOR, factor)

  return { fallEnd: fallEnd * clamped, fallStart: fallStart * clamped }
}

/**
 * What the light gizmo reads from the widget.
 */
export type LightGizmoOptions = {
  /**
   * The scene the gizmo and its proxy go into.
   */
  readonly scene: Scene
  /**
   * The camera the gizmo is drawn through.
   */
  readonly camera: Camera
  /**
   * The canvas the pointer events of the gizmo come from.
   */
  readonly canvas: HTMLCanvasElement
  /**
   * Asks the view for a frame, so a moved light or gizmo is drawn.
   */
  readonly onRender: () => void
}

/**
 * The move gizmo of the selected lights.
 */
export type LightGizmo = {
  /**
   * Turns the pointer of the gizmo on or off.
   *
   * @param enabled False while the camera holds the pointer (the gizmo is drawn, but can not be grabbed).
   */
  readonly setEnabled: (enabled: boolean) => void
  /**
   * Whether a click of the canvas may lock the camera.
   *
   * @returns False just after a drag of the gizmo, so the click that ends it does not lock the camera.
   */
  readonly canLock: () => boolean
  /**
   * Frees the gizmo and takes it out of the scene.
   */
  readonly dispose: () => void
}

/**
 * Builds the gizmo that moves the selected lights in the 3D view.
 *
 * @remarks
 * The gizmo of three (`TransformControls`) is attached to a proxy at the **middle of the selected lights**; the drag
 * writes the position of every selected light from the offset of the proxy, so a group of lights moves together. The
 * proxy stands turned by {@link GAME_TURN}, so the arrows point where the compass of the corner shows the game's axes.
 *
 * The drag writes the lights on every frame (the markers follow them), and the step of the history goes on the stack
 * when the pointer is let go: the step holds the light of the press and the one of the release, so the undo puts both
 * the place and the other fields back. The palette of the level is baked on the step, the way the light editor does it.
 *
 * The gizmo is hidden while nothing is selected, and it can not be grabbed while the camera holds the pointer (Escape
 * releases it). A point light has no direction, so the gizmo has the translate mode only.
 *
 * @param options What the gizmo reads from the widget.
 *
 * @returns The handle of the gizmo: the lock switch, the lock guard and the dispose.
 */
export function createLightGizmo(options: LightGizmoOptions): LightGizmo {
  const controls = new TransformControls(options.camera, options.canvas)
  const proxy = new Object3D()
  const helper = controls.getHelper()

  controls.setMode('translate')
  // the proxy carries the frame of the game, so the arrows point the way the compass and the readout do
  controls.setSpace('local')

  options.scene.add(helper)
  options.scene.add(proxy)

  let dragging = false
  let lastPress = Number.NEGATIVE_INFINITY
  /**
   * What the gizmo does now: the place of the lights, or the two radii of their falloff.
   *
   * @remarks
   * The modes are the switches of the edit (`1`, `2`, `3`), the same ones the gizmo of the selection reads: a light
   * moves with the transform mode and grows with the scale. The rotate has nothing to turn on a point light, so it puts
   * the gizmo away (the direction of the particles may come later).
   */
  let mode: 'scale' | 'translate' | undefined
  const startWorld = new Vector3()
  /**
   * The offset of the drag so far, in the world of the view.
   */
  const applied = { x: 0, y: 0, z: 0 }
  /**
   * The lights of the press, with vectors of their own: the live write moves the level, and the step needs the light
   * the press found.
   */
  let startLights: Array<{ readonly index: number; readonly light: ArxLight }> = []

  /**
   * The mode the gizmo takes from the switches of the edit, or `undefined` when none of them is on.
   *
   * @returns The mode of the gizmo.
   */
  function wantedMode(): 'scale' | 'translate' | undefined {
    if (scaleVisible.value) {
      return 'scale'
    }

    if (transformVisible.value) {
      return 'translate'
    }

    return undefined
  }

  /**
   * Puts the gizmo on the middle of the selected lights, or takes it away when nothing is selected.
   */
  function sync(): void {
    if (dragging) {
      return
    }

    const map = levelStore.map.value
    const middle = new Vector3()
    let count = 0

    if (map !== undefined) {
      for (const index of lightSelectionStore.lights.value) {
        const light = map.lights[index]

        if (light !== undefined) {
          middle.add(worldPositionOf(light.position))
          count = count + 1
        }
      }
    }

    const wanted = wantedMode()

    if (count === 0 || wanted === undefined) {
      controls.detach()

      return
    }

    if (mode !== wanted) {
      controls.setMode(wanted)
      mode = wanted
    }

    middle.divideScalar(count)
    proxy.position.copy(middle)
    // the frame of the game is the same on every light: the gizmo reads it between two drags
    proxy.quaternion.copy(GAME_TURN)
    proxy.scale.set(1, 1, 1)

    if (controls.object !== proxy) {
      controls.attach(proxy)
    }

    options.onRender()
  }

  /**
   * Starts a drag: the lights, and the point of the world the gizmo stood on.
   */
  function onMouseDown(): void {
    const map = levelStore.map.value

    if (map === undefined) {
      return
    }

    const lights: Array<{ readonly index: number; readonly light: ArxLight }> = []

    for (const index of lightSelectionStore.lights.value) {
      const light = map.lights[index]

      if (light !== undefined) {
        lights.push({ index, light: cloneLightOf(light) })
      }
    }

    if (lights.length === 0) {
      return
    }

    dragging = true
    startLights = lights
    startWorld.copy(proxy.position)
    applied.x = 0
    applied.y = 0
    applied.z = 0
  }

  /**
   * Writes the lights on every frame of the drag, and bakes the palette of their old and new places with them.
   *
   * @remarks
   * The palette follows the drag, not only its release: the author sees the light walk on the level while the pointer
   * holds it. The bake is the partial one of the light editor (the corners of the two spheres of each frame), and the
   * light of the previous frame is the `before` of the palette: the corners it lit go back to the other lights when it
   * moves away. The dynamic layer follows the revision of the lights, the way it does an edit of the fields.
   */
  function onObjectChange(): void {
    const map = levelStore.map.value

    if (!dragging || map === undefined) {
      return
    }

    const changes: LightPaletteChange[] = []

    if (mode === 'scale') {
      const factor = scaleFactorOf(proxy.scale)

      for (const entry of startLights) {
        const light = map.lights[entry.index]

        if (light === undefined) {
          continue
        }

        const before = cloneLightOf(light)
        const radii = scaledRadiiOf(entry.light.fallStart, entry.light.fallEnd, factor)

        light.fallStart = radii.fallStart
        light.fallEnd = radii.fallEnd
        changes.push({ before, after: light })
      }
    } else {
      applied.x = proxy.position.x - startWorld.x
      applied.y = proxy.position.y - startWorld.y
      applied.z = proxy.position.z - startWorld.z

      for (const entry of startLights) {
        const light = map.lights[entry.index]

        if (light === undefined) {
          continue
        }

        const before = cloneLightOf(light)

        light.position = movedGamePositionOf(entry.light.position, applied)
        changes.push({ before, after: light })
      }
    }

    if (changes.length > 0) {
      refreshLightPalette(map, changes)
    }

    touchLights()
    options.onRender()
  }

  /**
   * Ends a drag: the lights stay where it left them, and one step holds the whole move.
   *
   * @remarks
   * The step is the two snapshots of every light, so it puts back the fields the light editor changed before the drag as
   * well: the light of the press is the one the map held, not only its place. A drag that moved nothing is a click of
   * the view.
   */
  function onMouseUp(): void {
    lastPress = performance.now()

    if (!dragging) {
      return
    }

    dragging = false

    const map = levelStore.map.value
    const lights = startLights
    startLights = []

    if (map === undefined) {
      sync()

      return
    }

    let moved = Math.abs(applied.x) + Math.abs(applied.y) + Math.abs(applied.z) > 1e-6

    if (mode === 'scale') {
      moved = Math.abs(scaleFactorOf(proxy.scale) - 1) > 1e-6
    }

    if (moved) {
      lastPress = performance.now()

      const edits: SetLightEdit[] = []

      for (const entry of lights) {
        const light = map.lights[entry.index]

        if (light !== undefined) {
          edits.push({ index: entry.index, before: entry.light, after: light })
        }
      }

      if (edits.length > 0) {
        const command = commandOf(createSetLightRecord(edits), map)

        if (command !== undefined) {
          runStep(command)
        }
      }
    }

    applied.x = 0
    applied.y = 0
    applied.z = 0
    sync()
  }

  const stop = watch(
    [levelStore.map, lightSelectionStore.lights, lightsRevision, transformVisible, scaleVisible],
    sync,
    { immediate: true },
  )

  controls.addEventListener('change', options.onRender)
  controls.addEventListener('objectChange', onObjectChange)
  controls.addEventListener('mouseDown', onMouseDown)
  controls.addEventListener('mouseUp', onMouseUp)

  return {
    setEnabled: (enabled: boolean): void => {
      controls.enabled = enabled
    },
    canLock: (): boolean => {
      return performance.now() - lastPress > LOCK_GUARD_MS
    },
    dispose: (): void => {
      stop()
      controls.removeEventListener('change', options.onRender)
      controls.removeEventListener('objectChange', onObjectChange)
      controls.removeEventListener('mouseDown', onMouseDown)
      controls.removeEventListener('mouseUp', onMouseUp)
      controls.detach()
      controls.dispose()
      options.scene.remove(helper)
      options.scene.remove(proxy)
    },
  }
}
