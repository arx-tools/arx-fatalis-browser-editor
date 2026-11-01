import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ArxMap, PolygonInsertion } from '../../../generator/ArxMap.ts'
import { history, type HistoryCommand } from '../history/history.ts'
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
 * Builds the step of a delete: the polygons go out on `apply`, and back at their places on `revert`.
 *
 * @remarks
 * The step takes the polygons **as they are now** (`{ index, polygon }` for every removed face), because the
 * indices of the level move with every removal: the polygon objects are what the level can be given back, and the
 * index is where they belong. It also bumps {@link levelRevision}, so the views rebuild what they derived from the
 * polygons — that is the one place an edit and its undo reach the views.
 *
 * @param map The level the step changes.
 * @param insertions The faces it takes out, with the indices they go back to.
 *
 * @returns The command to run through the history.
 */
function createDeleteCommand(map: ArxMap, insertions: readonly PolygonInsertion[]): HistoryCommand {
  return {
    label: `Delete ${String(insertions.length)} face(s)`,
    apply: (): void => {
      map.removePolygons(
        insertions.map((insertion) => {
          return insertion.polygon
        }),
      )
      levelRevision.value = levelRevision.value + 1
    },
    revert: (): void => {
      map.insertPolygons(insertions)
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

  const insertions: PolygonInsertion[] = []

  for (const index of indices) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      insertions.push({ index, polygon })
    }
  }

  if (insertions.length === 0) {
    return
  }

  history.run(createDeleteCommand(map, insertions))
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
      history.clear()
    },
  )
}
