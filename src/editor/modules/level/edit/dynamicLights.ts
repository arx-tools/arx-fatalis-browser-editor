import { Frustum, Matrix4, type BufferGeometry, type Camera } from 'three'
import { watch } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { persistedRef } from '../../persistedRef/persistedRef.ts'
import { levelRevision } from './editing.ts'
import { lightsRevision } from './lightEditing.ts'
import { lightingProfile, readsPalette } from './lightingProfile.ts'
import { levelStore } from './levelStore.ts'
import { writeBakedColors } from './levelTextures/bakedColors.ts'
import { applyDynamicLightModel, blackenDynamicLightModel } from './dynamicLights/model/apply.ts'
import { createDynamicLightModel } from './dynamicLights/model/build.ts'
import { setDynamicLightWeightsLive } from './dynamicLights/model/live.ts'
import {
  changedWeightLightsOf,
  isDynamicLightModelStale,
  refreshDynamicLightBaseColors,
} from './dynamicLights/model/refresh.ts'
import type { DynamicLightModel } from './dynamicLights/model/types.ts'

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
 * How often the flicker takes a frame, in milliseconds.
 *
 * @remarks
 * The game lights its torches on every frame it draws, and the editor drew the flicker on every frame of the browser too:
 * a quarter of a core on a big level, all the time, for a light that a film would show at fifteen frames a second. Twenty
 * is smooth enough for a torch and leaves the frames of the browser to the camera (2026-11-18, the owner).
 */
const FLICKER_INTERVAL_IN_MS = 50

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
 * Whether the baked light of the level is on the corners, whatever the static switch says.
 *
 * @remarks
 * The static switch takes the palette of the level away, and the palette is what the profiles that read the lights
 * baked. The `Flat` and the `Texture Rainbow` profiles read no light: their color is the light of the map, and there is
 * nothing under it to take away, so the level keeps its light while one of them is on (2026-11-22, the owner).
 *
 * @returns True when the palette of the profile lights the level.
 */
export function isStaticLightOn(): boolean {
  return isStaticLightsVisible.value || !readsPalette(lightingProfile.value)
}

/**
 * What draws the layer: the render of a view that registered itself, and the camera it draws with.
 *
 * @remarks
 * The camera is what the cull of a frame reads: a walkable view that looks at a room without a burning light has nothing
 * to draw of the layer, and its frames are the expensive part (2026-11-18, the owner).
 */
const views = new Map<() => void, () => Camera | undefined>()

/**
 * The model of the level on the screen, or `undefined` before a level arrives.
 */
let model: DynamicLightModel | undefined

/**
 * Whether the level is dark under the layer: the static switch is off, and the color attribute is zero.
 *
 * @remarks
 * The attribute has to go back to the baked palette when the switch goes on, and the store may hold no map to restore
 * it from: the flag says whether the controller wrote the darkness.
 */
let isBlackened = false

/**
 * Whether the light of the layer is on the color attribute right now.
 */
let isApplied = false

/**
 * The animation frame the layer waits for, or `0` when it is not running.
 */
let frame = 0

/**
 * When the flicker took its last frame, in the milliseconds of the animation frames.
 */
let lastFrameAt = Number.NEGATIVE_INFINITY

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
  if (!isStaticLightOn()) {
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
  for (const render of views.keys()) {
    render()
  }
}

/**
 * Puts the static light of the level on the color attribute, or takes it away.
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

  if (isStaticLightOn()) {
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
 * Tells whether the layer has a color of its own to draw.
 *
 * @remarks
 * A layer with no burning light, or with lights that reached no corner of the level, has no table to write: the baked
 * colors of the level are the picture, and the layer writes nothing over them.
 *
 * @returns True when the model has a corner, or a light of a drag, to draw.
 */
function hasDrawnColors(): boolean {
  if (model === undefined) {
    return false
  }

  return model.vertices.length > 0 || (model.live !== undefined && model.live.actives.length > 0)
}

/**
 * Draws the baked light of the level back, when the layer has no color of its own to draw.
 *
 * @remarks
 * The layer writes its own colors over the baked ones while a light of it burns, and a layer whose lights all went out
 * has no table to write: the colors of the last lit frame would stay on the level (2026-11-26, the owner: a light that
 * `starts extinguished` kept lighting the level). The baked colors come back, or the black of the static switch when it
 * is off, the way the switches of the layer leave the level.
 */
function restoreBakedFrame(): void {
  const map = levelStore.map.value
  let geometry: BufferGeometry | undefined

  if (map !== undefined) {
    geometry = solidGeometryOf(map)
  }

  if (map === undefined || geometry === undefined) {
    isApplied = false
    isBlackened = false

    return
  }

  if (isStaticLightOn()) {
    writeBakedColors(map)
    isBlackened = false
  } else {
    isBlackened = blackenDynamicLightModel(geometry)
  }

  isApplied = false
}

/**
 * Draws a frame of the layer, when the model still belongs to the geometry.
 *
 * @returns True when the color attribute was written.
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

  if (!hasDrawnColors()) {
    restoreBakedFrame()

    return true
  }

  const applied = applyDynamicLightModel(model, geometry, Math.random, isStaticLightOn())

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
 * Tells whether the page is hidden: a browser tab in the background draws no frame of its own.
 *
 * @returns True when the document says it is hidden.
 */
function isPageHidden(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  return document.visibilityState === 'hidden'
}

/**
 * The model of the layer, when it still belongs to the geometry of the level.
 *
 * @returns The model, or `undefined` when there is none to draw.
 */
function currentModel(): DynamicLightModel | undefined {
  const map = levelStore.map.value

  if (map === undefined || model === undefined) {
    return undefined
  }

  const geometry = solidGeometryOf(map)

  if (geometry === undefined || isDynamicLightModelStale(model, geometry)) {
    return undefined
  }

  return model
}

/**
 * Tells whether a view can see any of the corners the layer lights.
 *
 * @remarks
 * The layer writes the color of its corners on every frame, and that is worth doing only while one of them is in front
 * of a camera: a walkable view inside a room without a burning light sees the same picture, frame after frame. The box
 * of the lit corners is tested against the frustum of the first registered view (the views of the editor show the same
 * level from their own cameras; the walkable view is the one that draws the layer).
 *
 * @returns True when no camera is registered (the layer does not cull then), or when a camera sees the box.
 */
function isLayerInView(): boolean {
  const model = currentModel()

  if (model === undefined) {
    return false
  }

  let camera: Camera | undefined

  for (const cameraOf of views.values()) {
    camera = cameraOf()

    if (camera !== undefined) {
      break
    }
  }

  if (camera === undefined) {
    return true
  }

  camera.updateMatrixWorld()

  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  )

  if (frustum.intersectsSphere(model.bounds)) {
    return true
  }

  // a light of a drag may walk out of the box of the build: the frame draws it as long as one of the two boxes is seen
  return model.live !== undefined && frustum.intersectsSphere(model.live.bounds)
}

/**
 * Draws one frame of the layer, and asks the views for a frame.
 *
 * @param now The time of the animation frame, in milliseconds.
 */
function step(now: number): void {
  frame = 0

  if (!isDynamicLightsVisible.value || views.size === 0 || isPageHidden()) {
    return
  }

  frame = requestAnimationFrame(step)

  // the flicker of a torch is slower than the frame of a camera: a frame of the layer every fifty milliseconds is
  // smooth, and the browser keeps the rest
  if (now - lastFrameAt < FLICKER_INTERVAL_IN_MS) {
    return
  }

  lastFrameAt = now

  if (!isLayerInView()) {
    return
  }

  if (applyFrame()) {
    renderViews()
  }
}

/**
 * Starts the animation frame chain of the layer, if it is not running already.
 */
function startTicker(): void {
  // a layer with nothing to draw has no flicker to run
  if (frame !== 0 || !hasDrawnColors()) {
    return
  }

  lastFrameAt = Number.NEGATIVE_INFINITY
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
 * Builds the layer again, and draws it at once.
 *
 * @remarks
 * The palette and the layer are two halves of the same light: a light that turns semi-dynamic leaves the baked palette
 * on one frame, and the layer draws it on the next one. The rebuild of a light that **appears or goes out** is
 * therefore not waited for (the wait of {@link scheduleRebuild} is for a drag, which writes on every frame): the layer
 * takes the light in the frame of the palette, so the level does not flash (2026-11-26, the owner: the step of a
 * history, and the flags, turned the light off for a moment or lit it twice).
 */
function rebuildFrame(): void {
  rebuild()

  if (model === undefined || !isOverridden() || views.size === 0) {
    return
  }

  paintStaticLights()

  if (applyFrame()) {
    renderViews()

    if (model !== undefined && hasDrawnColors()) {
      startTicker()
    }
  }
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
    rebuildFrame()
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

  if (model === undefined || !hasDrawnColors()) {
    stopTicker()
    restoreBakedFrame()
    renderViews()

    return
  }

  if (isStaticLightOn()) {
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
 * The camera of a view that has none: the layer does not cull a frame for it.
 *
 * @returns Nothing.
 */
function noCamera(): Camera | undefined {
  return undefined
}

/**
 * Registers the render of a view, so the layer can ask it for a frame.
 *
 * @param render What the view does to draw a frame.
 * @param cameraOf The camera the view draws with, which the cull of a frame reads (nothing culls without it).
 *
 * @returns The function that takes the view out of the layer.
 */
export function registerDynamicLightsView(render: () => void, cameraOf?: () => Camera | undefined): () => void {
  const camera: () => Camera | undefined = cameraOf ?? noCamera

  views.set(render, camera)

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
      lightingProfile,
      (): ArxMap | undefined => {
        return levelStore.map.value
      },
    ],
    () => {
      sync()
    },
    { immediate: true },
  )

  // a browser tab in the background draws nothing the author can see: the flicker stops with the tab, and comes back
  // with it (the tab of the editor ran for hours in the background, and the layer took a quarter of a core all along)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (isPageHidden()) {
        stopTicker()

        return
      }

      sync()
    })
  }

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

    // the bake may have written the color attribute again: the static base goes back on it
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
      // the palette may have been baked again with another profile: the base colors follow it, the weights do not
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

    if (
      map === undefined ||
      geometry === undefined ||
      model?.map !== map ||
      !isDynamicLightsVisible.value ||
      isDynamicLightModelStale(model, geometry)
    ) {
      scheduleRebuild()

      return
    }

    const changed = changedWeightLightsOf(model, map)

    if (changed === undefined) {
      // a light appeared or went out: the palette and the layer change in the same frame, or the level flashes
      rebuildFrame()

      return
    }

    // a color edit of a light keeps its weights: the layer takes the new light and draws it on the next frame, so the
    // drag of the light editor is live even with the layer on
    if (changed.length > 0) {
      // a moved light is drawn over the table of the build, so the drag follows the pointer; the build takes the lights
      // in once the gesture settles (2026-11-24, the owner)
      setDynamicLightWeightsLive(model, changed)
      startTicker()
      scheduleRebuild()

      return
    }

    if (applyFrame()) {
      renderViews()
    }
  })
}
