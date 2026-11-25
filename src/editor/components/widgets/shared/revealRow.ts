import { nextTick } from 'vue'

/**
 * How much room a sticky head takes at the top of a box, in css pixels.
 */
const DEFAULT_INSET = 0

/**
 * Where the reveal of a selection is worked out, per widget.
 *
 * @remarks
 * The list the author clicks in does not move: the row is already under the pointer, and a list that jumps on every
 * click is a list that fights the author (2026-11-25, the owner). The reveal is for a pick that comes from **outside**
 * the list (the walkable view, the Selection Inspector), so the widget marks its own writes with
 * {@link RevealGate.suppress} and the watcher skips the first reveal it sees.
 */
export type RevealGate = {
  /**
   * Tells the next reveal that the pick came from the widget itself.
   */
  readonly suppress: () => void
  /**
   * Reads the mark of the next reveal, and clears it.
   *
   * @returns True when the next reveal belongs to the widget's own click.
   */
  readonly take: () => boolean
}

/**
 * Builds a gate for the reveal of a widget.
 *
 * @returns The gate, with an open door.
 */
export function createRevealGate(): RevealGate {
  let suppressed = false

  return {
    suppress: (): void => {
      suppressed = true

      // the store may not change at all (a click on the tile that is already picked), and the mark must not stay for the
      // next pick: the flush of the framework takes the reveal, and the tick after it clears the mark
      nextTick(() => {
        suppressed = false
      }).catch(() => {
        // a tick that never runs has nothing to clear
      })
    },
    take: (): boolean => {
      const value = suppressed

      suppressed = false

      return value
    },
  }
}

/**
 * Scrolls a box to put one of its rows in the middle, under a sticky head if there is one.
 *
 * @remarks
 * The rows live in a box of their own, so the scroll is written on that box and not through `scrollIntoView`: the call
 * would also move the dock and the page around a widget that the author did not touch. The owner asked for a picked
 * light, entity or texture to land **near the middle of the widget** (2026-11-25): the edge of the box is on the screen,
 * but it is the worst place to read the row from. A box that does not have the room (the first or the last rows) clamps
 * the scroll, and the row lands as close to the middle as the list lets it.
 *
 * @param container The scroll box of the rows.
 * @param row The line to show.
 * @param inset How much of the top of the box a sticky head covers, in css pixels.
 */
export function revealRowIn(container: HTMLElement | null, row: HTMLElement | null, inset = DEFAULT_INSET): void {
  if (container === null || row === null || container.clientHeight === 0) {
    return
  }

  const box = container.getBoundingClientRect()
  const rect = row.getBoundingClientRect()
  const room = box.height - inset
  const offset = (room - rect.height) / 2
  const middle = rect.top - (box.top + inset) - offset

  container.scrollTop = Math.max(0, container.scrollTop + middle)
}
