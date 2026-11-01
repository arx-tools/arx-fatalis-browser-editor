import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import type { HistoryRecord } from './records.ts'

/**
 * How many steps the history keeps, the oldest falling out.
 *
 * @remarks
 * This is the one place to change it: the store trims itself to this depth, so a longer session does not grow
 * without a bound. A step stores **what changed**, not a snapshot of the level (a snapshot of level 11 is ~100 MB,
 * a delete of a few faces is a few kilobytes), so a hundred steps stay small.
 */
export const HISTORY_DEPTH = 100

/**
 * One step the history can take back.
 *
 * @remarks
 * A command holds the **inverse** of what it does, and both halves are the command's own business: it captures what
 * it needs when it is built (the polygons a delete takes out, the old value of a field a modify changes), so the
 * map is only touched through these two calls.
 *
 * That is the contract the editing rounds follow: **every** change of the level goes through a command, and the
 * editor calls {@link History.run} — never the map directly. A change that is not a command can not be undone, and
 * it would make the steps after it wrong.
 */
export interface HistoryCommand {
  /**
   * What the step is called, for the notes and a later panel: `Delete 3 face(s)`.
   */
  readonly label: string
  /**
   * The step the way a JSON can hold it, so the history can be written down later.
   *
   * @remarks
   * The two forms describe the same step and are made together ({@link commandOf} builds both from the record), so
   * what the editor can undo is exactly what it can store — a step that can not be written down would be lost on a
   * reload without anyone noticing.
   */
  readonly record: HistoryRecord
  /**
   * Does the change.
   *
   * @remarks
   * It is called once when the command is run, and again on every redo.
   */
  apply(): void
  /**
   * Takes the change back: the exact inverse of {@link apply}.
   */
  revert(): void
}

/**
 * The undo and redo stacks of the editor.
 */
export interface History {
  /**
   * The steps that can be taken back, the newest last.
   */
  readonly undoStack: ShallowRef<readonly HistoryCommand[]>
  /**
   * The steps that can be made again, the newest last.
   */
  readonly redoStack: ShallowRef<readonly HistoryCommand[]>
  /**
   * Whether there is a step to take back.
   */
  readonly canUndo: ComputedRef<boolean>
  /**
   * Whether there is a step to make again.
   */
  readonly canRedo: ComputedRef<boolean>
  /**
   * Every step that can be taken back, in the shape a JSON can hold.
   *
   * @remarks
   * The persistence reads this (and the compaction of it, if the stored form is the net result instead of the steps).
   */
  readonly records: ComputedRef<readonly HistoryRecord[]>
  /**
   * Whether the level differs from the one that was loaded.
   *
   * @remarks
   * It is worked out from the stack: all the steps taken back means the level is the one of the files again. It is
   * the signal of a later export (`Save` asks before it throws the work away), and the persistence can show "there is
   * something to keep" from the same place.
   *
   * A **save** would need a marker in the stack (the steps before the save are not unsaved work any more); there is
   * no save yet, so the simple form is enough.
   */
  readonly edited: ComputedRef<boolean>
  /**
   * Does a change and puts it on the stack.
   *
   * @param command The step to run.
   */
  readonly run: (command: HistoryCommand) => void
  /**
   * Takes the last step back.
   */
  readonly undo: () => void
  /**
   * Makes the last undone step again.
   */
  readonly redo: () => void
  /**
   * Drops every step, both ways.
   *
   * @remarks
   * The editor calls it when another level is loaded: the steps of the previous level are not the steps of this one.
   */
  readonly clear: () => void
}

/**
 * Builds the history of the editor.
 *
 * @returns The empty history, with {@link HISTORY_DEPTH} as its depth.
 */
export function createHistory(): History {
  const undoStack = shallowRef<readonly HistoryCommand[]>([])
  const redoStack = shallowRef<readonly HistoryCommand[]>([])

  return {
    undoStack,
    redoStack,
    canUndo: computed(() => {
      return undoStack.value.length > 0
    }),
    canRedo: computed(() => {
      return redoStack.value.length > 0
    }),
    records: computed(() => {
      return undoStack.value.map((command) => {
        return command.record
      })
    }),
    edited: computed(() => {
      return undoStack.value.length > 0
    }),
    run: (command: HistoryCommand): void => {
      command.apply()

      // the newest step is the last one, and the steps that were undone are gone: the branch they led to is not the
      // one the editor is on any more
      undoStack.value = [...undoStack.value, command].slice(-HISTORY_DEPTH)
      redoStack.value = []
    },
    undo: (): void => {
      const command = undoStack.value.at(-1)

      if (command === undefined) {
        return
      }

      command.revert()
      undoStack.value = undoStack.value.slice(0, -1)
      redoStack.value = [...redoStack.value, command]
    },
    redo: (): void => {
      const command = redoStack.value.at(-1)

      if (command === undefined) {
        return
      }

      command.apply()
      redoStack.value = redoStack.value.slice(0, -1)
      undoStack.value = [...undoStack.value, command].slice(-HISTORY_DEPTH)
    },
    clear: (): void => {
      undoStack.value = []
      redoStack.value = []
    },
  }
}

/**
 * The history of the editor: one store, shared by the keys, the help and the later panels.
 */
export const history = createHistory()
