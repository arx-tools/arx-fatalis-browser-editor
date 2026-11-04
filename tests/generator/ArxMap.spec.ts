import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getBVHExtremes } from 'three-mesh-bvh'
import { Raycaster, Triangle, Vector3 } from 'three'
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

    void it('indexes the solid faces in the order of their texture containers', () => {
      const map = flatMap()
      const { polygons } = map

      // two containers, one after the other: the polygons of the level alternate, so a texture ordered index has to
      // gather the even faces first and the odd ones after them
      for (const [index, polygon] of polygons.entries()) {
        ;(polygon as { textureContainerId: number }).textureContainerId = index % 2
      }

      // an edit rebuilds the index (the containers were told apart after the build)
      map.deletePolygons([polygons.length - 1])

      const geometry = map.solidMeshes[0]?.geometry

      assert.notEqual(geometry, undefined)

      if (geometry === undefined) {
        return
      }

      const index = geometry.getIndex()

      assert.notEqual(index, null)

      if (index === null) {
        return
      }

      const triangles = index.count / 3
      const containers: number[] = []
      const seen = new Set<number>()

      for (let triangle = 0; triangle < triangles; triangle = triangle + 1) {
        const plain = Math.trunc(index.getX(triangle * 3) / 3)
        const polygon = polygons[map.triangleToPolygon[plain] ?? -1]

        containers.push(polygon?.textureContainerId ?? -1)
        seen.add(plain)
      }

      // every triangle is in the index exactly once, so the picking still reads `face.a` the way it does; and the order
      // survives the build of the tree, which means the tree did not write the index back into the polygon order
      assert.equal(seen.size, triangles)

      // the runs are the blocks of the index, and their containers are the ones the order has
      const runContainers: number[] = []
      const expectedContainers: number[] = []
      let runCount = 0

      for (const run of map.textureRuns) {
        runContainers.push(run.textureContainerId)
        runCount = runCount + run.count
      }

      for (const [position, container] of containers.entries()) {
        if (position === 0 || containers[position - 1] !== container) {
          expectedContainers.push(container)
        }
      }

      assert.equal(runCount, index.count)
      assert.deepEqual(runContainers, expectedContainers)
      assert.deepEqual(
        containers,
        containers.toSorted((left, right) => {
          return left - right
        }),
      )
    })

    void it('gives the two-sided faces a run of their own', () => {
      const map = flatMap()
      const { polygons } = map
      const first = polygons[0]

      assert.notEqual(first, undefined)

      if (first === undefined) {
        return
      }

      // the FTS marks the faces the game draws from behind with the `DoubleSided` bit (1 << 1)
      ;(first as { flags: number }).flags = first.flags | 2

      // an edit rebuilds the index and the runs (the flag was set after the build)
      map.deletePolygons([polygons.length - 1])

      const doubleSided = map.textureRuns.filter((run) => {
        return run.doubleSided
      })

      assert.equal(doubleSided.length, 1)
      assert.equal(doubleSided[0]?.count, 6)
      assert.equal(doubleSided[0]?.textureContainerId, first.textureContainerId)
      // the two-sided run closes the index: the faces of one container draw on both sides in two runs
      assert.equal(doubleSided[0]?.start, map.textureRuns.at(-1)?.start)
    })

    void it('gives a blended face a run of its own', () => {
      const map = flatMap()
      const { polygons } = map
      const first = polygons[0]

      assert.notEqual(first, undefined)

      if (first === undefined) {
        return
      }

      // the torch's flame: the transparent bit and a subtractive transval
      ;(first as { flags: number }).flags = first.flags | 4
      ;(first as { transval: number }).transval = -0.95
      map.deletePolygons([polygons.length - 1])

      const blended = map.textureRuns.filter((run) => {
        return run.blend !== 'opaque'
      })

      assert.equal(blended.length, 1)
      assert.equal(blended[0]?.blend, 'subtractive')
      assert.equal(blended[0]?.trans, 1.95)
      assert.equal(blended[0]?.count, 6)
      // the blended runs come after the opaque ones, so the wall behind them is drawn first
      assert.equal(blended[0]?.start, map.textureRuns.at(-1)?.start)
    })

    void it('picks the face the ray meets, with the index in the texture order', () => {
      const map = flatMap()
      const { polygons } = map

      for (const [index, polygon] of polygons.entries()) {
        ;(polygon as { textureContainerId: number }).textureContainerId = index % 2
      }

      map.deletePolygons([polygons.length - 1])

      const mesh = map.solidMeshes[0]
      const { geometry } = mesh

      geometry.computeBoundingBox()

      const { boundingBox: box } = geometry

      assert.notEqual(box, null)

      if (box === null) {
        return
      }

      const centre = box.getCenter(new Vector3())
      const raycaster = new Raycaster()

      raycaster.firstHitOnly = true
      raycaster.set(new Vector3(centre.x, box.max.y + 100, centre.z), new Vector3(0, -1, 0))

      const [hit] = raycaster.intersectObject(mesh, false)

      assert.notEqual(hit, undefined)

      if (hit === undefined) {
        return
      }

      const { face } = hit

      assert.notEqual(face, null)
      assert.notEqual(face, undefined)

      if (face === null || face === undefined) {
        return
      }

      const position = geometry.getAttribute('position')

      function corner(index: number): Vector3 {
        return new Vector3().fromBufferAttribute(position, index)
      }

      // the triangle the raycast reports holds the point it reports: the index and the tree are in one order, and the
      // indirect tree did not read the plain vertex of the triangle
      assert.equal(new Triangle(corner(face.a), corner(face.b), corner(face.c)).containsPoint(hit.point), true)

      // and the face it names is a polygon of the level
      const polygon = polygons[map.triangleToPolygon[Math.trunc(face.a / 3)] ?? -1]

      assert.notEqual(polygon, undefined)
    })
  })
})
