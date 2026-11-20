import { shallowRef } from 'vue'
import type { ArxColor, ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { commandOf } from '../history/commands.ts'
import { createPasteFacesRecord } from '../history/records.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { runStep } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionStore } from './selectionStore.ts'

/**
 * The faces the last copy took, as the clipboard holds them.
 *
 * @remarks
 * The clipboard is the editor's own: the system clipboard of the browser would paste text, and the faces of a level
 * are polygons of this application. A copy takes the **snapshot** of the selected faces (they are copied, so a later
 * edit of the level does not change what the next paste puts in), and a paste reads this snapshot, not the selection:
 * a second `Ctrl+V` copies the same faces again, without a new `Ctrl+C`.
 */
const clipboard = shallowRef<{
  readonly polygons: readonly ArxPolygon[]
  readonly colors: readonly ArxColor[]
}>({ polygons: [], colors: [] })

/**
 * The colour a corner takes when the palette has none at its index.
 */
const WHITE: ArxColor = { r: 255, g: 255, b: 255, a: 255 }

/**
 * Copies the selected faces into the clipboard.
 *
 * @remarks
 * The copy is the deep clone of the polygons of the level: the vertices, the room, the texture, the uv, the flags and
 * the normals all travel with it. An empty selection leaves the clipboard alone, so a stray `Ctrl+C` does not throw
 * away what the author copied before.
 */
export function copySelectedPolygons(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const polygons: ArxPolygon[] = []
  const colors: ArxColor[] = []

  for (const index of [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    polygons.push(structuredClone(polygon))

    const base = polygon.vertices[0]?.llfColorIdx ?? 0
    let count = 3

    if (isQuad(polygon)) {
      count = 4
    }

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      colors.push({ ...(map.llf.colors[base + vertex] ?? WHITE) })
    }
  }

  if (polygons.length === 0) {
    return
  }

  clipboard.value = { polygons, colors }
}

/**
 * Pastes the faces of the clipboard at the end of the level, and selects them.
 *
 * @remarks
 * The step is a `pasteFaces` record, so the undo takes the pasted faces out and the redo puts them back. The pasted
 * faces go at the end of the polygon list, and the selection takes their indices: the author can move them with the
 * gizmo right after a paste.
 *
 * The faces keep the place they had in the level they were copied from (the first slice). A cross-level paste puts
 * them at the spawn, with no room and with the missing textures added; that is the next slice of the ticket.
 */
export function pasteSelectedPolygons(): void {
  const map = levelStore.map.value
  const { polygons, colors } = clipboard.value

  if (map === undefined || polygons.length === 0) {
    return
  }

  const first = map.polygons.length
  const command = commandOf(createPasteFacesRecord(polygons, colors), map)

  if (command === undefined) {
    return
  }

  runStep(command)
  selectionStore.selectMany(
    Array.from({ length: polygons.length }, (_, position) => {
      return first + position
    }),
    'replace',
  )
}

/**
 * Binds the copy and the paste of the faces to their keys.
 */
export function startClipboard(): void {
  onKeyboardAction('copySelection', copySelectedPolygons)
  onKeyboardAction('pasteSelection', pasteSelectedPolygons)
}
