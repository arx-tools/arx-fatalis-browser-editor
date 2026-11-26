import type { ArxColor, ArxPolygon } from 'arx-convert/types'
import { HISTORY_RECORD_VERSION, type ImportMeshRecord, type TextureReference } from './types.ts'

/**
 * Builds the record of an imported mesh, the way a step writes it down.
 *
 * @remarks
 * The polygons are copied the way the paste copies them: the map keeps the live faces (a later drag of a corner must not
 * reach back into the step), and the record replays on the level it was made on with the same shapes. The colors are
 * copied too when the import brings them.
 *
 * @param polygons The polygons of the mesh, with the room and the container they take.
 * @param texture The container the faces draw with.
 * @param addedTexture Whether the step adds the container to the level.
 * @param colors The colors of the corners, when the import brings them.
 *
 * @returns The record of the step.
 */
export function createImportMeshRecord(
  polygons: readonly ArxPolygon[],
  texture: TextureReference,
  addedTexture: boolean,
  colors?: readonly ArxColor[],
): ImportMeshRecord {
  const record: ImportMeshRecord = {
    version: HISTORY_RECORD_VERSION,
    kind: 'importMesh',
    polygons: polygons.map((polygon) => {
      return structuredClone(polygon)
    }),
    texture: { id: texture.id, name: texture.name },
    addedTexture,
  }

  if (colors === undefined) {
    return record
  }

  return {
    ...record,
    colors: colors.map((color) => {
      return { ...color }
    }),
  }
}
