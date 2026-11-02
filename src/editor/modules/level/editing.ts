import { shallowRef, watch, type ShallowRef } from 'vue'
import { history, type HistoryCommand } from '../history/history.ts'
import { commandOf, createDeleteFacesRecord } from '../history/records.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { levelStore } from './levelStore.ts'

/**
 * How many times the level has been edited.
 *
 * @remarks
 * The map is a plain object and the edits change it in place, so the views that draw it have nothing reactive
 * to follow: this counter is that signal. An edit bumps it, and the views that hold something *derived* from
 * the polygons (the wireframe, the statistics) read it and build theirs again.
 */
export const levelRevision: ShallowRef<number> = shallowRef(0)

/**
 * Wraps a step, so the views follow what it does.
 *
 * @remarks
 * The map is a plain object, so the views that draw something *derived* from it (the wireframe, the statistics, the
 * inspector) have nothing reactive to follow: {@link levelRevision} is that signal, and it is bumped here, in the one
 * place a step and its undo both pass through. It is the only reason a step is wrapped: the command itself knows
 * nothing about the views.
 *
 * @param command The step to wrap.
 *
 * @returns The same step, with the revision bumped on both halves.
 */
function withRevision(command: HistoryCommand): HistoryCommand {
  return {
    label: command.label,
    record: command.record,
    apply: (): void => {
      command.apply()
      levelRevision.value = levelRevision.value + 1
    },
    revert: (): void => {
      command.revert()
      levelRevision.value = levelRevision.value + 1
    },
  }
}

/**
 * Takes the selected polygons out of the level, through the history.
 *
 * @remarks
 * The selection is the input and it is dropped at the end: the polygons after a removal are numbered differently, so
 * keeping the old indices would point at other faces.
 */
export function deleteSelectedPolygons(): void {
  const map = levelStore.map.value
  const indices = [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })

  if (map === undefined || indices.length === 0) {
    return
  }

  const command = commandOf(createDeleteFacesRecord(indices), map)

  if (command === undefined) {
    return
  }

  history.run(withRevision(command))
  selectionStore.clear()
}

/**
 * Takes the last step of the history back.
 *
 * @remarks
 * The selection is dropped with it: a step moves the indices of the level (a delete takes faces out, an undo puts
 * them back), so the ones the selection holds would point at other faces.
 */
export function undoLastStep(): void {
  history.undo()
  selectionStore.clear()
}

/**
 * Makes the last undone step again.
 */
export function redoLastStep(): void {
  history.redo()
  selectionStore.clear()
}

/**
 * Binds the editing keys of the editor.
 *
 * @remarks
 * `Delete` takes the selection away, `undo` and `redo` walk the history of the level. The history is dropped when
 * another level is loaded: the steps of the previous one are not the steps of this one, and their polygons are not
 * in this map.
 */
export function startLevelEditing(): void {
  onKeyboardAction('deleteSelectedPolygons', deleteSelectedPolygons)
  onKeyboardAction('undo', undoLastStep)
  onKeyboardAction('redo', redoLastStep)

  watch(
    () => {
      return levelStore.map.value
    },
    () => {
      // the steps and the selection are indices of the old map: a new level makes both meaningless
      history.clear()
      selectionStore.clear()
    },
  )
}
