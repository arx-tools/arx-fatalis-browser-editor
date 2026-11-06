import { commandOf } from '../history/commands.ts'
import { createSetTextureRecord } from '../history/records.ts'
import { runStep } from '../level/edit/editing.ts'
import { registerLevelTexture } from '../level/edit/levelTextures.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { bytesOf } from './textureCatalog.ts'
import type { TextureEntry } from './textureEntry.ts'

/**
 * Paints the selected faces with a texture.
 *
 * @remarks
 * The texture of a face is the **container** it points at, so a paint is two things: the level has to have a container
 * for the texture (it is added when the level does not have one), and the faces take its id. Both are one step of the
 * history (`setTexture`), so the undo puts every face back on the container it had and takes the added container out of
 * the level — a level that is painted with a dropped texture and then undone is the level it was.
 *
 * The **bytes** of the texture are registered into the paint of the level before the step runs, so the level draws with
 * the texture right away: the paint of an edit (`levelRevision`) builds the material of the new container, and a face
 * whose texture the browser can not decode falls back to the placeholder of the level.
 *
 * @param entry The texture to paint the faces with.
 *
 * @returns True when the step ran, false when there is nothing to paint (no level, or no selected face).
 */
export async function paintSelectedFaces(entry: TextureEntry): Promise<boolean> {
  const map = levelStore.map.value
  const faces = [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })

  if (map === undefined || faces.length === 0) {
    return false
  }

  const bytes = await bytesOf(entry)

  if (bytes !== undefined) {
    await registerLevelTexture(entry.name, bytes)
  }

  // the container of the texture, or a new one: the ids of the game are the hashes of the file names, so a name is what
  // says whether the level has the texture already
  const existing = map.textureContainerIdOfName(entry.name)
  const to = { id: existing ?? map.nextTextureContainerId(), name: entry.name }

  const changes = faces.map((index) => {
    return { index, from: map.polygons[index]?.textureContainerId ?? 0 }
  })
  const command = commandOf(createSetTextureRecord(changes, to, existing === undefined), map)

  if (command === undefined) {
    return false
  }

  runStep(command)

  return true
}
