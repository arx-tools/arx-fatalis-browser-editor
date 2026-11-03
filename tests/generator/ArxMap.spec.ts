import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getBVHExtremes } from 'three-mesh-bvh'
import { createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { Settings } from '../../src/generator/Settings.ts'

/**
 * Builds a level of one flat floor, the smallest map with more than one polygon.
 *
 * @returns The map, with its meshes and the tree of its picking.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

void describe('ArxMap', () => {
  void describe('deletePolygons', () => {
    void it('builds the tree of the picking with one root, whatever groups the paint left behind', () => {
      const map = flatMap()
      const mesh = map.solidMeshes[0]
      const { geometry } = mesh
      const index = geometry.getIndex()

      assert.notEqual(index, null)

      if (index === null) {
        return
      }

      // the paint puts one group per run of faces that share a texture, and a delete happens after a paint: the
      // geometry carries those groups into the edit
      const triangles = index.count / 3
      const half = Math.floor(triangles / 2) * 3

      geometry.addGroup(0, half, 0)
      geometry.addGroup(half, index.count - half, 1)

      assert.equal(geometry.groups.length, 2)

      map.deletePolygons([0])

      // a group is a range of the index, and `MeshBVH` builds a root per material range: tens of thousands of texture
      // runs would be tens of thousands of roots, and every ray walks all of them (measured on level 11: a pick of
      // 6.5 s after one delete). The groups are for the renderer only: the paint rebuilds them after the edit.
      assert.equal(geometry.groups.length, 0)
      assert.notEqual(geometry.boundsTree, undefined)

      if (geometry.boundsTree === undefined) {
        return
      }

      assert.equal(getBVHExtremes(geometry.boundsTree).length, 1)
    })
  })
})
