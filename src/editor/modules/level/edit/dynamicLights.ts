import type { BufferGeometry } from 'three'
import { watch } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { persistedRef } from '../../persistedRef/persistedRef.ts'
import { levelRevision } from './editing.ts'
import { lightsRevision } from './lightEditing.ts'
import { levelStore } from './levelStore.ts'
import { writeBakedColors } from './levelTextures/bakedColors.ts'
import {
  applyDynamicLightModel,
  blackenDynamicLightModel,
  createDynamicLightModel,
  isDynamicLightModelStale,
  refreshDynamicLightBaseColors,
  refreshDynamicLightLights,
  type DynamicLightModel,
} from './dynamicLights/model.ts'

/**
 * The delay of a rebuild after a change of the level or of its lights, in milliseconds.
 *
 * @remarks
 * A drag writes the level on every frame (a moved face, a turned light), and the build of the layer walks every corner
 * of the level for every light: a good part of a frame on a big one. The rebuild waits for the gesture to settle, so
 * the layer follows it a moment after the last frame instead of holding the drag back.
 */
const REBUILD_DELAY_IN_MS = 150

/**
 * Whether the baked light of the level is on the corners.
 *
 * @remarks
 * The palette of the level is the light the game's own editor baked (`writeBakedColors`), and it is the base the
 * dynamic layer adds to. This switch takes it away: the level goes dark, and only the dynamic layer lights it. It is
 * a view preference in the browser, like the profile; the default is on.
 */
export const isStaticLightsVisible = persistedRef<boolean>({
  key: 'staticLightsVisible',
  defaultValue: true,
  persistInLocalStorage: true,
})

/**
 * Whether the semi-dynamic lights of the level light the surfaces of the walkable view.
 *
 * @remarks
 * The baked palette of the level holds the static lights only: the game lights a torch at runtime, with a flicker of
 * its own. This switch puts that layer on top of the baked light, so the author sees the level the way the game will.
 * It is a view preference in the browser, like the profile; the default is off.
 */
export const isDynamicLightsVisible = persistedRef<boolean>({
  key: 'dynamicLightsVisible',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * What draws the layer: the render of a view that registered itself.
 */
const views = new Set<() => void>()

/**
 * The model of the level on the screen, or `undefined` before a level arrives.
 */
let model: DynamicLightModel | undefined

/**
 * Whether the level is dark under the layer: the static switch is off, and the colour attribute is zero.
 *
 * @remarks
 * The attribute has to go back to the baked palette when the switch goes on, and the store may hold no map to restore
 * it from: the flag says whether the controller wrote the darkness.
 */
let isBlackened = false

/**
 * Whether the light of the layer is on the colour attribute right now.
 */
let isApplied = false

/**
 * The animation frame the layer waits for, or `0` when it is not running.
 */
let frame = 0

/**
 * The timer of a rebuild, or `undefined` when none is waiting.
 */
let rebuildTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Whether the watches of the layer are set up.
 */
let started = false

/**
 * Whether a switch of the layer is off its default: the static light is off, or the dynamic one is on.
 *
 * @returns True when the controller has to paint the light of the level.
 */
function isOverridden(): boolean {
  if (!isStaticLightsVisible.value) {
    return true
  }

  return isDynamicLightsVisible.value
}

/**
 * The geometry of the solid mesh of a level.
 *
 * @param map The level to read.
 *
 * @returns The geometry, or `undefined` when the level has no mesh.
 */
function solidGeometryOf(map: ArxMap): BufferGeometry | undefined {
  return map.solidMeshes[0]?.geometry
}

/**
 * Asks every registered view for a frame.
 */
function renderViews(): void {
  for (const render of views) {
    render()
  }
}

/**
 * Puts the static light of the level on the colour attribute, or takes it away.
 *
 * @remarks
 * With the switch on, the palette is the base of the layer, and the bake of the level writes it: the controller only
 * has to put it back when it blackened the level before. With the switch off, every corner goes to zero, and a bake
 * that writes the palette again (a profile change) is blackened again on the next step.
 */
function paintStaticLights(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const geometry = solidGeometryOf(map)

  if (geometry === undefined) {
    return
  }

  if (isStaticLightsVisible.value) {
    if (isBlackened) {
      writeBakedColors(map)
      isBlackened = false
    }

    return
  }

  isBlackened = blackenDynamicLightModel(geometry)
}

/**
 * Draws the baked light of the level back, when a switch of the layer had taken it away.
 */
function restoreStaticLights(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    isBlackened = false
    isApplied = false

    return
  }

  if (!isBlackened && !isApplied) {
    return
  }

  writeBakedColors(map)
  isBlackened = false
  isApplied = false
}

/**
 * Draws a frame of the layer, when the model still belongs to the geometry.
 *
 * @returns True when the colour attribute was written.
 */
function applyFrame(): boolean {
  const map = levelStore.map.value

  if (map === undefined || model === undefined) {
    return false
  }

  const geometry = solidGeometryOf(map)

  if (geometry === undefined || isDynamicLightModelStale(model, geometry)) {
    return false
  }

  const applied = applyDynamicLightModel(model, geometry, Math.random, isStaticLightsVisible.value)

  if (applied) {
    isApplied = true
  }

  return applied
}

/**
 * Builds the layer of the level on the screen.
 *
 * @remarks
 * The build is the expensive half of the layer, so only a change of the level, of its lights or of its palette calls it:
 * a frame of the flicker reads the model.
 */
function rebuild(): void {
  const map = levelStore.map.value

  model = undefined
  isApplied = false

  if (map === undefined) {
    return
  }

  model = createDynamicLightModel(map)
}

/**
 * Draws one frame of the layer, and asks the views for a frame.
 */
function step(): void {
  frame = 0

  if (!isDynamicLightsVisible.value || views.size === 0) {
    return
  }

  if (applyFrame()) {
    renderViews()
  }

  frame = requestAnimationFrame(step)
}

/**
 * Starts the animation frame chain of the layer, if it is not running already.
 */
function startTicker(): void {
  if (frame !== 0) {
    return
  }

  frame = requestAnimationFrame(step)
}

/**
 * Stops the animation frame chain, and drops the frame it was waiting for.
 */
function stopTicker(): void {
  if (frame === 0) {
    return
  }

  cancelAnimationFrame(frame)
  frame = 0
}

/**
 * Waits for the level to settle, then builds the layer again.
 */
function scheduleRebuild(): void {
  if (!isOverridden() || views.size === 0) {
    return
  }

  if (rebuildTimer !== undefined) {
    clearTimeout(rebuildTimer)
  }

  rebuildTimer = setTimeout(() => {
    rebuildTimer = undefined
    rebuild()

    if (model === undefined || !isOverridden() || views.size === 0) {
      return
    }

    paintStaticLights()

    if (applyFrame()) {
      renderViews()
      startTicker()
    }
  }, REBUILD_DELAY_IN_MS)
}

/**
 * Puts the state of the layer in line with the switches, the level and the views.
 *
 * @remarks
 * The layer runs only while a view is there to draw it. The static switch takes the baked light of the level away; the
 * dynamic one adds the torches and runs the flicker. With both switches off the baked palette comes back and the chain
 * stops. A level without a burning semi-dynamic light lights nothing either, so its chain does not start.
 */
function sync(): void {
  const map = levelStore.map.value

  if (map === undefined || views.size === 0) {
    stopTicker()

    return
  }

  if (!isOverridden()) {
    stopTicker()
    restoreStaticLights()
    renderViews()

    return
  }

  paintStaticLights()

  if (!isDynamicLightsVisible.value) {
    stopTicker()
    isApplied = false
    renderViews()

    return
  }

  if (model?.map !== map) {
    rebuild()
  }

  if (model === undefined || model.lights.length === 0 || model.vertices.length === 0) {
    stopTicker()
    renderViews()

    return
  }

  if (isStaticLightsVisible.value) {
    // the palette may have been baked again: the base of the layer follows it
    refreshDynamicLightBaseColors(model, map)
  }

  if (!applyFrame()) {
    scheduleRebuild()

    return
  }

  renderViews()
  startTicker()
}

/**
 * Registers the render of a view, so the layer can ask it for a frame.
 *
 * @param render What the view does to draw a frame.
 *
 * @returns The function that takes the view out of the layer.
 */
export function registerDynamicLightsView(render: () => void): () => void {
  views.add(render)

  if (isOverridden()) {
    sync()
  }

  return (): void => {
    views.delete(render)

    if (views.size === 0) {
      stopTicker()
    }
  }
}

/**
 * Starts the light layer: the switches, the level and the lights of the level follow it.
 *
 * @remarks
 * The module that owns a view registers its render (see {@link registerDynamicLightsView}), and the layer asks the views
 * for a frame on every step of the flicker. The starts are safe to call twice: the watches are set up once.
 */
export function startDynamicLights(): void {
  if (started) {
    return
  }

  started = true

  watch(
    [
      isStaticLightsVisible,
      isDynamicLightsVisible,
      (): ArxMap | undefined => {
        return levelStore.map.value
      },
    ],
    () => {
      sync()
    },
    { immediate: true },
  )

  watch(levelRevision, () => {
    if (!isOverridden() || views.size === 0) {
      return
    }

    const map = levelStore.map.value

    if (map === undefined) {
      return
    }

    const geometry = solidGeometryOf(map)

    if (geometry === undefined) {
      return
    }

    // the bake may have written the colour attribute again: the static base goes back on it
    paintStaticLights()

    if (!isDynamicLightsVisible.value) {
      renderViews()

      return
    }

    if (model === undefined || isDynamicLightModelStale(model, geometry)) {
      scheduleRebuild()

      return
    }

    if (isStaticLightsVisible.value) {
      // the palette may have been baked again with another profile: the base colours follow it, the weights do not
      refreshDynamicLightBaseColors(model, map)
    }

    if (applyFrame()) {
      renderViews()
    } else {
      scheduleRebuild()
    }
  })

  watch(lightsRevision, () => {
    const map = levelStore.map.value
    const geometry = map?.solidMeshes[0]?.geometry

    // a colour edit of a light keeps its weights: the layer takes the new light and draws it on the next frame, so the
    // drag of the light editor is live even with the layer on (a move, an intensity or a flag still needs the build)
    if (
      map !== undefined &&
      geometry !== undefined &&
      model?.map === map &&
      isDynamicLightsVisible.value &&
      !isDynamicLightModelStale(model, geometry) &&
      refreshDynamicLightLights(model, map)
    ) {
      if (applyFrame()) {
        renderViews()
      }

      return
    }

    scheduleRebuild()
  })
}
