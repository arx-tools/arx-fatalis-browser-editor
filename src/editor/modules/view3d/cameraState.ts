import type { TripleOf } from 'arx-convert/utils'
import { parseNumberTriplet, roundTriplet } from '../functions.ts'
import { persistedRef } from '../persistedRef/persistedRef.ts'

/**
 * Rounds a triplet on its way into the url, and lets the missing one through.
 *
 * @param value The triplet to round, or `undefined` when the camera has no stored pose.
 *
 * @returns The rounded triplet, or `undefined`, which removes the parameter.
 */
function roundUrlTriplet(value: TripleOf<number> | undefined): TripleOf<number> | undefined {
  if (value === undefined) {
    return undefined
  }

  return roundTriplet(value)
}

/**
 * The camera position, in the game's coordinate system (`?position=x,y,z`).
 *
 * @remarks
 * - the game's coordinates, not the three.js ones: a link can be compared with the game's own debug
 * hud, and the conversion needs the scene position of the level, which the url does not carry
 * - the values are rounded to two decimals in the url and written with a throttle, so a camera move
 * does not flood the history (`replaceState` only, no new entry)
 * - the default is `undefined`, so "no position in the url" stays distinguishable from `0,0,0`
 */
export const cameraPosition = persistedRef<TripleOf<number> | undefined>({
  key: 'position',
  persistInUrl: true,
  throttle: 150,
  transformOutput: { url: roundUrlTriplet },
  urlDeserialize: (raw: string) => {
    return parseNumberTriplet(raw)
  },
})

/**
 * The camera rotation, in the game's angles (`?rotation=pitch,yaw,roll`).
 *
 * @remarks
 * The roll is always `0`: the editor's camera has no roll. A broken value is dropped by the parser, so
 * the camera keeps its own pose instead of jumping somewhere invalid.
 */
export const cameraAngle = persistedRef<TripleOf<number> | undefined>({
  key: 'rotation',
  persistInUrl: true,
  throttle: 150,
  transformOutput: { url: roundUrlTriplet },
  urlDeserialize: (raw: string) => {
    return parseNumberTriplet(raw)
  },
})
