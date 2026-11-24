/**
 * The dynamic light layer of a level, by the part of the frame it serves.
 *
 * @remarks
 * The types live in `model/types.ts`, the bake of the pairs in `model/build.ts`, the refresh of a built model in
 * `model/refresh.ts`, the lights that moved after the bake in `model/live.ts`, and the frame itself in
 * `model/apply.ts`. This module is the one the editor imports, and it names what the layer offers: a part of the folder
 * can move without a change outside it, and the surface stays the one the editor reads.
 */

export type {
  BaseLight,
  DynamicLightColor,
  DynamicLightModel,
  LightWeightSnapshot,
  LiveLayer,
  LiveLight,
} from './model/types.ts'
export { createDynamicLightModel, isBurningLight } from './model/build.ts'
export {
  changedWeightLightsOf,
  isDynamicLightModelStale,
  refreshDynamicLightBaseColors,
  refreshDynamicLightLights,
} from './model/refresh.ts'
export { setDynamicLightWeightsLive } from './model/live.ts'
export { applyDynamicLightModel, blackenDynamicLightModel, flickerColorOf } from './model/apply.ts'
