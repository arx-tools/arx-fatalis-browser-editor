import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { history, metadataCommandOf, type HistoryCommand } from '../../history/history.ts'
import { historyOfMap, rememberMapHistory, type HistorySnapshot } from '../../history/mapHistory.ts'
import { dropStoredHistory, readStoredHistory } from '../../history/mapHistoryStorage.ts'
import { commandOf } from '../../history/commands.ts'
import { createDeleteFacesRecord } from '../../history/records/faces.ts'
import type { SetLightRecord } from '../../history/records/types.ts'
import { onKeyboardAction } from '../../keyboard/keyboard.ts'
import { bumpPortalRevision } from '../../rooms/portalSync.ts'
import { selectionStore } from '../../selection/selectionStore.ts'
import { refreshLightPalette, refreshLightPaletteOfFaces, type LightPaletteChange } from './lightPalette.ts'
import { bumpLightingCacheVersion } from './lightingCache.ts'
import { touchLights } from './lightEditing.ts'
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
 * Tells the paint of the level that its groups are stale.
 *
 * @remarks
 * A change that takes faces out or puts them in drops the groups of the geometry (`refillGeometry`: a group is a root of
 * the BVH), so the paint has to build them again, or the solid mesh draws nothing. The steps do it themselves
 * (`withRevision`), and a change that is not a step of the history — an insert of a level, a spike — calls this.
 */
export function bumpTextureRevision(): void {
  textureRevision.value = textureRevision.value + 1
}

/**
 * Bakes the light of the faces that moved, with the profile of the level.
 *
 * @param faces The indices of the faces that moved.
 */
function refreshLightPaletteOfFacesOf(faces: readonly number[]): void {
  const map = levelStore.map.value

  if (map !== undefined) {
    refreshLightPaletteOfFaces(map, faces)
  }
}

/**
 * Bakes the palette of the level again where a light edit changed the light of its corners.
 *
 * @remarks
 * The step carries the two states of every light it touched, and those are the spheres the partial bake needs: the
 * palette follows the light on the undo and the redo, which do not run the live write of the widget.
 *
 * @param record The record of the step.
 */
function refreshLightPaletteOf(record: SetLightRecord): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const changed: LightPaletteChange[] = []

  for (const at of record.indices.keys()) {
    const before = record.before[at]
    const after = record.after[at]

    if (before !== undefined && after !== undefined) {
      changed.push({ before, after })
    }
  }

  refreshLightPalette(map, changed)
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
   * @param applied Whether the step ran forward: the colors of a paste are baked on the apply, not on the undo.
   */
  function bump(step: HistoryCommand, applied: boolean): void {
    bumpLevelRevision()
    bumpLightingCacheVersion()

    // a uv edit keeps the triangles, their order and their materials: the paint of the level is not stale
    if (step.record.kind !== 'setUv') {
      textureRevision.value = textureRevision.value + 1
    }

    switch (step.record.kind) {
      // a tunnel brings its portals and takes them out with itself: the outline and the room warnings follow them
      case 'buildTunnel': {
        bumpPortalRevision()
        break
      }

      // a light edit moves the markers and their shapes with the fields of the light, and the palette of the level with
      // the light itself (the undo and the redo take the palette back the same way the live edit moved it)
      case 'setLight': {
        touchLights()
        refreshLightPaletteOf(step.record)
        break
      }

      // a face that moves takes the light of its new place: the corners it owns are baked again, so a pasted or a
      // dragged face does not keep the color of the place it came from
      case 'rotateFaces':
      case 'scaleFaces':
      case 'translateFaces': {
        refreshLightPaletteOfFacesOf(step.record.faces)
        break
      }

      // the pasted faces get their own colors when they go in: their bake happens on the apply, not on the undo
      case 'pasteFaces': {
        if (!applied) {
          break
        }

        const map = levelStore.map.value

        if (map === undefined) {
          break
        }

        const count = step.record.polygons.length

        refreshLightPaletteOfFaces(
          map,
          Array.from({ length: count }, (_, position) => {
            return map.polygons.length - count + position
          }),
        )
        break
      }

      // the steps that keep the colors of their faces: a group, a room, a texture or a uv changes no light
      case 'createFaceGroup':
      case 'deleteFaceGroups':
      case 'deleteFaces':
      case 'deleteRooms':
      case 'renameFaceGroup':
      case 'setRoom':
      case 'setRoomName':
      case 'setTexture':
      case 'setUv': {
        break
      }
    }
  }

  return {
    label: command.label,
    record: command.record,
    apply: (): void => {
      command.apply()
      bump(command, true)
    },
    revert: (): void => {
      command.revert()
      bump(command, false)
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
  bumpLightingCacheVersion()

  if (step?.record.kind === 'deleteFaces' || step?.record.kind === 'pasteFaces') {
    selectionStore.clear()
  }
}

/**
 * Makes the last undone step again.
 */
export function redoLastStep(): void {
  const step = history.redoStack.value.at(-1)

  history.redo()
  bumpLightingCacheVersion()

  if (step?.record.kind === 'deleteFaces' || step?.record.kind === 'pasteFaces') {
    selectionStore.clear()
  }
}

/**
 * Takes every step of the history back, so the level is the one of its files again.
 *
 * @remarks
 * The steps stay in the history: the author can walk them again with the redo, or with the buttons of the help. It is
 * the reset of the level without the loss of the work, and it is the same walk the undo takes one step at a time, so
 * the selection follows it the same way.
 */
export function resetHistorySteps(): void {
  while (history.canUndo.value) {
    undoLastStep()
  }
}

/**
 * The steps of the history as a snapshot: the line of the steps, and how many of them are on the level.
 *
 * @remarks
 * The undone steps are part of the line: a reload may only keep the position, and the steps after it are the redo of
 * the author. A line of steps that is entirely taken back is still a line.
 *
 * @returns The steps of the editor, oldest first, and the length of the applied part.
 */
export function snapshotOfHistory(): HistorySnapshot {
  const applied = history.undoStack.value
  const undone = history.redoStack.value

  return {
    records: [
      ...applied.map((command) => {
        return command.record
      }),
      ...undone.map((command) => {
        return command.record
      }),
    ],
    position: applied.length,
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
  rememberMapHistory(id, snapshotOfHistory())
}

/**
 * Reads the steps of a map: the ones of the session first, the stored ones after a reload.
 *
 * @remarks
 * The steps of the session are the true ones (they carry the polygons the editor holds), so they win. The stored ones
 * are the same steps written down, and they may only be replayed on the file they were made on: the fingerprint of the
 * map says whether the file is the same, and the steps of another build of the level are dropped, not guessed at. The
 * dropped ones would change other faces than the ones the author picked, which is worse than losing them.
 *
 * @param id The value of the map in the list.
 * @param map The map that was just loaded.
 *
 * @returns The steps of the map and how many of them are on it, or `undefined` when the map has none.
 */
function storedSnapshotOf(id: string, map: ArxMap): HistorySnapshot | undefined {
  const memory = historyOfMap(id)

  if (memory !== undefined) {
    return memory
  }

  const stored = readStoredHistory(id)

  if (stored === undefined) {
    return undefined
  }

  if (stored.fingerprint !== map.fingerprint) {
    dropStoredHistory(id)
    console.warn(`[history] the stored steps of ${id} were made on another version of the level, they were dropped.`)

    return undefined
  }

  return { records: stored.records, position: stored.position }
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
  const snapshot = storedSnapshotOf(id, map)
  const records = snapshot?.records ?? []
  const position = snapshot?.position ?? 0
  let applied = 0

  for (const record of records.slice(0, position)) {
    // a metadata step is not replayed: its store comes back from the browser or the zip, and applying the step again
    // would repeat the rename. It goes back on the stack, and its halves run when the author undoes or redoes it.
    const metadata = metadataCommandOf(record)

    if (metadata !== undefined) {
      history.restoreApplied(metadata)
      applied = applied + 1

      continue
    }

    const command = commandOf(record, map)

    if (command !== undefined) {
      history.run(withRevision(command))
      applied = applied + 1
    }
  }

  // the steps the author took back before the reload are still theirs to make again: they go on the redo stack, built
  // from the state the replay left behind (the state they were taken back from)
  let undone = 0

  for (const record of records.slice(position)) {
    const metadata = metadataCommandOf(record)

    if (metadata !== undefined) {
      history.restoreUndone(metadata)
      undone = undone + 1

      continue
    }

    const command = commandOf(record, map)

    if (command !== undefined) {
      history.restoreUndone(withRevision(command))
      undone = undone + 1
    }
  }

  const skipped = records.length - applied - undone

  if (skipped > 0) {
    // a step of another build (an unknown kind or version) can not be replayed: the rest is on the level, and the
    // author is told instead of the step being lost silently (the toast of the editor is TODO 66)
    console.warn(`[history] ${String(skipped)} stored steps of ${id} could not be applied.`)
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
  // the `Delete` is bound by the selection context (`deleteSelection.ts`): it takes the picked rooms or groups when an
  // inspector holds the keyboard, and the faces otherwise
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
