import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { syncGeneratedPortals } from '../level/edit/generatedPortals.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { roomRevision } from './roomRevision.ts'

/**
 * How many times the portals of the level moved, so the views that draw them have a signal to follow.
 *
 * @remarks
 * The portals are not reactive data of the map: they live in the `fts` of it, which is a plain object. The room revision
 * says the rooms moved; this one says the portals were rebuilt from them, which is what the outline of the view, the
 * numbers of the statistics and the warnings of the room inspector follow.
 */
export const portalRevision: ShallowRef<number> = shallowRef(0)

let started = false

/**
 * Rebuilds the portals of the level on the screen, and tells the views when they moved.
 *
 * @remarks
 * The generator only touches a flat level, and it leaves the portals a level brought with it alone (see
 * {@link syncGeneratedPortals}); this is the door of the editor to it, with the signal the views follow.
 *
 * @param map The level to read and write.
 *
 * @returns True when the portals of the map changed.
 */
export function updateGeneratedPortals(map: ArxMap): boolean {
  const changed = syncGeneratedPortals(map)

  if (changed) {
    portalRevision.value = portalRevision.value + 1
  }

  return changed
}

/**
 * Starts the automatic generation of the portals.
 *
 * @remarks
 * The level and the room revision are the input: a map that arrives is read once, and every write of the rooms (a step,
 * its undo, the replay of the stored steps) is followed by a new generation. A second start does nothing, so the editor
 * may call it from anywhere the parts of the shell are started.
 *
 * The generation is deferred to the end of the update (`flush: 'post'`), so the views see the same map the generation
 * read: a replay writes the rooms of the map that is already on the screen.
 */
export function startPortalGeneration(): void {
  if (started) {
    return
  }

  started = true

  watch(
    [
      (): ArxMap | undefined => {
        return levelStore.map.value
      },
      roomRevision,
    ],
    () => {
      const map = levelStore.map.value

      if (map !== undefined) {
        updateGeneratedPortals(map)
      }
    },
    { immediate: true, flush: 'post' },
  )
}
