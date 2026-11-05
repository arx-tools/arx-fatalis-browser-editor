import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { history, type HistoryCommand } from '../history/history.ts'
import { historyOfMap, rememberMapHistory } from '../history/mapHistory.ts'
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
 * How many times the **paint** of the level went stale.
 *
 * @remarks
 * The paint of the level (`levelTextures`) holds the materials of the containers and the **groups** of the geometry: a
 * step that paints faces needs a new material, and a step that takes faces out (or puts them back) needs the groups
 * again — a cut geometry carries no groups (`refillGeometry` drops them, they are the roots of the BVH otherwise), so a
 * delete without a paint would draw the whole level with one material.
 *
 * A step that only moves the uv of a face (`setUv`) changes neither: the triangles, their order and their materials are
 * the same, so the paint is not stale. That is the whole point of the counter: the paint of a big level is the expensive
 * half of an edit (it rebuilds the groups of 45 000 faces), and the drag of a uv corner writes the model on every frame.
 *
 * Every view follows the level itself ({@link levelRevision}); this counter is for the paint.
 */
export const textureRevision: ShallowRef<number> = shallowRef(0)

/**
 * Tells the views that the level changed under them.
 *
 * @remarks
 * The map is a plain object and the edits change it in place, so the views that draw something derived from it have
 * nothing reactive to follow: this is the signal, and a step and its undo both bump it. A module that changes the model
 * while a gesture runs (a uv dragged on the texture) bumps it on its own frames.
 */
export function bumpLevelRevision(): void {
  levelRevision.value = levelRevision.value + 1
}

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
  /**
   * Tells the views, and the paint when the step touched a material.
   *
   * @param step The step that ran.
   */
  function bump(step: HistoryCommand): void {
    bumpLevelRevision()

    // a uv edit keeps the triangles, their order and their materials: the paint of the level is not stale
    if (step.record.kind !== 'setUv') {
      textureRevision.value = textureRevision.value + 1
    }
  }

  return {
    label: command.label,
    record: command.record,
    apply: (): void => {
      command.apply()
      bump(command)
    },
    revert: (): void => {
      command.revert()
      bump(command)
    },
  }
}

/**
 * Runs a step of an edit, so the views follow what it does.
 *
 * @remarks
 * Every edit of the editor goes through the history ({@link history}); this is the door of a module outside this file
 * (a widget that paints faces with a texture), so the revision is bumped on both halves of the step the same way.
 *
 * @param command The step to run.
 */
export function runStep(command: HistoryCommand): void {
  history.run(withRevision(command))
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

  runStep(command)
  selectionStore.clear()
}

/**
 * Takes the last step of the history back.
 *
 * @remarks
 * The selection is dropped only with a step that **moves the indices** of the level: a delete takes faces out and its
 * undo puts them back, so the indices the selection holds would point at other faces. A step that changes a face in
 * place (a texture, a uv) leaves the indices alone, and the selection is what the widget of such a step edits — dropping
 * it would empty the texture list and the uv mapper after every undo.
 */
export function undoLastStep(): void {
  const step = history.undoStack.value.at(-1)

  history.undo()

  if (step?.record.kind === 'deleteFaces') {
    selectionStore.clear()
  }
}

/**
 * Makes the last undone step again.
 */
export function redoLastStep(): void {
  const step = history.redoStack.value.at(-1)

  history.redo()

  if (step?.record.kind === 'deleteFaces') {
    selectionStore.clear()
  }
}

/**
 * Writes down the steps of the map that is going away.
 *
 * @remarks
 * The history of the editor is the map's own: the steps of a level are indices and polygons of **that** level, so a
 * switch puts them away by the value of the map in the list (see `mapHistory`), and the map that comes back gets them
 * again ({@link restoreMapHistory}).
 *
 * @param id The value of the map in the list, like `arx:8`.
 */
export function saveMapHistory(id: string): void {
  rememberMapHistory(id, history.records.value)
}

/**
 * Puts the steps of a map back on it, after the map was loaded again.
 *
 * @remarks
 * A step is a pair of closures over the map it was made on, so the steps can not be carried from one load to the next:
 * the records are **replayed** onto the new map, in the order they were made. The indices of a record are the ones of
 * its moment, and the replay walks the same steps from the same level, so it finds the same faces (the ground
 * `records.ts` stands on). The selection is dropped with them: the replay moves the indices of the level.
 *
 * The map has to be on the store already: the replay goes through the same key-bound step the editor uses, so the
 * views follow it.
 *
 * @param id The value of the map in the list, like `arx:8`.
 * @param map The map that was just loaded.
 */
export function restoreMapHistory(id: string, map: ArxMap): void {
  for (const record of historyOfMap(id)) {
    const command = commandOf(record, map)

    if (command !== undefined) {
      history.run(withRevision(command))
    }
  }

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
