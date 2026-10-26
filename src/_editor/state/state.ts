import { MathUtils } from 'three'
import { isLightingCalculatorMode, type LightingCalculatorMode } from '../../_generator/types.ts'
import { persistedRef } from './persistedRef/persistedRef.ts'

/**
 * The state of the editor: every value which survives a reload lives here, so the modules only ask
 * for the ref and never touch the url or the storage themselves.
 *
 * @remarks
 * - the persistence of a value is one config object: `persistInLocalStorage`, `persistInUrl`, the
 * default value and the optional `throttle`/`debounce`
 * - a value which is not persisted is a plain `ref()` and does not belong here
 */

/**
 * The minified state of the debug panel's payload (the `Minify`/`Format` button).
 */
export const debugPanelMinified = persistedRef({
  key: 'debugPanelMinified',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * The tab which is in front in the debug panel: `selection` or `anchor`.
 *
 * @remarks
 * - a plain string for now: the debug panel will be reworked, and only then will it get its own
 * `DebugTabId` type again
 */
export const debugPanelActiveTab = persistedRef({
  key: 'debugPanelActiveTab',
  defaultValue: 'selection',
  persistInLocalStorage: true,
})

/**
 * Whether the debug panel is shown: the floating window which collects the debug output of the
 * different tools (the selection payload and the anchor graph payload, one tab each).
 */
export const debugPanelVisible = persistedRef({
  key: 'debugPanelVisible',
  defaultValue: false,
  persistInUrl: true,
})

/**
 * Whether the `Realistic` bake casts shadows (the Fred `DistanceAngleShadowNoTransparency`
 * occlusion). Off = every light reaches every vertex it faces (the Danae-like look, the game's
 * original palette has no occlusion). `?shadowsRendering=false` in the url, on by default.
 */
export const shadowsRendering = persistedRef({
  key: 'shadowsRendering',
  defaultValue: true,
  persistInUrl: true,
})

/**
 * A **display only** ambient floor (0..127) for the `Realistic` palette: the baked palette has no
 * ambient (`ambient = 0` in `bakeLlfColors`, like Fred's `DistanceAngleShadowNoTransparency`), so
 * every surface that no light reaches is pitch black. The game's original (Danae) palette has an
 * ambient floor of 23 there, which is why the level never looks fully black in the game.
 *
 * `?ambientFloor=12` in the url; 0 (the default) keeps the exported palette untouched.
 */
export const ambientFloor = persistedRef({
  key: 'ambientFloor',
  defaultValue: 0,
  persistInUrl: true,
  transformOutput: {
    // the slider and the url stay in the range of the palette, even with a hand written url value
    value: (value: number): number => {
      return MathUtils.clamp(Math.round(value), 0, 127)
    },
  },
})

/**
 * The lighting mode of the editor (the select above the canvas): the value the generator's
 * calculator gets.
 *
 * @remarks
 * - `?lightingCalculatorMode=` in the url, the same key the generator's `.env` uses
 * - an unknown url value falls back to the default (`Arx`); the legacy `?lighting=flat` is gone
 */
export const lightingCalculatorMode = persistedRef<LightingCalculatorMode>({
  key: 'lightingCalculatorMode',
  defaultValue: 'Arx',
  persistInUrl: true,
  urlDeserialize: (raw: string): LightingCalculatorMode => {
    if (isLightingCalculatorMode(raw)) {
      return raw
    }

    return 'Arx'
  },
})

/**
 * The geometry itself (the `Mesh` switch): turning it off leaves only the overlays visible.
 */
export const meshVisible = persistedRef({
  key: 'meshVisible',
  defaultValue: true,
  persistInUrl: true,
})

export const wireframeVisible = persistedRef({
  key: 'wireframeVisible',
  defaultValue: false,
  persistInUrl: true,
})

export const anchorsVisible = persistedRef({
  key: 'anchorsVisible',
  defaultValue: false,
  persistInUrl: true,
})

export const portalsVisible = persistedRef({
  key: 'portalsVisible',
  defaultValue: false,
  persistInUrl: true,
})

export const lightsVisible = persistedRef({
  key: 'lightsVisible',
  defaultValue: false,
  persistInUrl: true,
})

/**
 * Show the file's anchor graph and the generated one at the same time (green + cyan).
 */
export const bothAnchorGraphsVisible = persistedRef({
  key: 'bothAnchorGraphsVisible',
  defaultValue: false,
  persistInUrl: true,
})

/**
 * Dots where the two anchor graphs differ (red: only in the file's graph, blue: only in the
 * generated one).
 */
export const anchorDiffVisible = persistedRef({
  key: 'anchorDiffVisible',
  defaultValue: false,
  persistInUrl: true,
})

/**
 * The links the generator repaired / filled in (yellow).
 */
export const rejectedLinksVisible = persistedRef({
  key: 'rejectedLinksVisible',
  defaultValue: false,
  persistInUrl: true,
})
