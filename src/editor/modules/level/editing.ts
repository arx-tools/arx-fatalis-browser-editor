import { shallowRef, type ShallowRef } from 'vue'
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
 * Takes the selected polygons out of the level.
 *
 * @remarks
 * The selection is the input and it is dropped at the end: the polygons after a removal are numbered
 * differently, so keeping the old indices would point at other faces.
 */
export function deleteSelectedPolygons(): void {
  const map = levelStore.map.value
  const selectedPolygons = [...selectionStore.polygons.value]

  if (map === undefined || selectedPolygons.length === 0) {
    return
  }

  map.deletePolygons(selectedPolygons)
  selectionStore.clear()
  levelRevision.value = levelRevision.value + 1
}

/**
 * Binds the editing keys of the editor.
 *
 * @remarks
 * `Delete` takes the selection away; the adding and the moving of polygons come with their own rounds.
 */
export function startLevelEditing(): void {
  onKeyboardAction('deleteSelectedPolygons', deleteSelectedPolygons)
}
