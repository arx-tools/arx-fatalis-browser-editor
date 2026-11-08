import { watch } from 'vue'
import { snapshotOfHistory } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { currentMapId } from '../level/source/maps.ts'
import { history } from './history.ts'
import { writeStoredHistory } from './mapHistoryStorage.ts'
import type { HistoryRecord } from './records.ts'

/**
 * How long a write waits after the last step.
 *
 * @remarks
 * A step is made by a click or a key, but the restore of a map runs a hundred of them in a row: the wait turns those
 * into one write, and a quick sequence of edits into one too. The wait is short enough that a reload right after a step
 * still finds it, and the page also writes what is pending when it goes away.
 */
const DEBOUNCE_MS = 150

/**
 * The write that is waiting for its moment.
 */
interface PendingWrite {
  /**
   * The value of the map in the list.
   */
  readonly id: string
  /**
   * The fingerprint of the level file the steps belong to.
   */
  readonly fingerprint: string
  /**
   * The steps, oldest first, the ones taken back included.
   */
  readonly records: readonly HistoryRecord[]
  /**
   * How many of the steps are on the level.
   */
  readonly position: number
}

/**
 * The write the debounce is holding.
 */
let pending: PendingWrite | undefined

/**
 * The timer of the debounce.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * The map whose steps were written last, and the file they belong to.
 *
 * @remarks
 * The history is cleared when another level is loaded, and that clear is not an empty history of the map on the screen:
 * the map id is still the one of the level that went away for a moment. The last write tells the two apart (the same
 * map and the same file: the author took every step back; another map or another file: the level changed).
 */
let lastWritten: { readonly id: string; readonly fingerprint: string } | undefined

/**
 * Writes what the debounce holds, if anything.
 */
function flush(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }

  const write = pending

  pending = undefined

  if (write === undefined) {
    return
  }

  writeStoredHistory(write.id, { fingerprint: write.fingerprint, records: write.records, position: write.position })
  lastWritten = { id: write.id, fingerprint: write.fingerprint }
}

/**
 * Puts a write in the debounce.
 *
 * @param write The steps and the map they belong to.
 */
function schedule(write: PendingWrite): void {
  pending = write

  if (timer !== undefined) {
    clearTimeout(timer)
  }

  timer = setTimeout(() => {
    flush()
  }, DEBOUNCE_MS)
}

/**
 * Keeps the steps of every map in the storage, so a reload does not lose the work.
 *
 * @remarks
 * The steps are written after every change of the history (the same signal the undo panel and the dots of the map list
 * read), with a short debounce. A level that is not the one the steps were made on is not written: the history is
 * cleared when another map is loaded, and those empty steps belong to no map.
 *
 * The page writes what is left when it goes away: a reload is the case this is for, and the write of the web storage is
 * synchronous, so the handler is enough.
 */
export function startMapHistoryPersistence(): void {
  // both stacks: the undone steps are the redo of the author, and a reload has to keep them
  watch([history.undoStack, history.redoStack], () => {
    const map = levelStore.map.value

    if (map === undefined) {
      return
    }

    const id = currentMapId.value
    const snapshot = snapshotOfHistory()

    if (snapshot.records.length === 0) {
      // a level change clears the history: the empty list is not the history of the map on the screen, and the map id
      // may still be the one of the level that went away
      if (lastWritten?.id === id && lastWritten.fingerprint === map.fingerprint) {
        schedule({ id, fingerprint: map.fingerprint, records: [], position: 0 })
      }

      return
    }

    schedule({ id, fingerprint: map.fingerprint, records: [...snapshot.records], position: snapshot.position })
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
  }
}
