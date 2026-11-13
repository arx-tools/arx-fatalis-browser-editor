import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isQuad } from 'arx-convert/utils'
import { getBVHExtremes } from 'three-mesh-bvh'
import { BufferAttribute, Raycaster, Triangle, Vector3 } from 'three'
import { createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../src/generator/meshes.ts'
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

    void it('puts a face back when the geometry carries an attribute of the editor', () => {
      // the area map writes its colours into a `color` attribute of the solid geometry, and the undo splices the kept
      // faces with the ones it rebuilds: the rebuilt ones bring only the attributes of the generator. An attribute the
      // slices can not provide is dropped instead of failing the step (the reader of it writes it back)
      const map = flatMap()
      const { geometry } = map.solidMeshes[0]
      const before = map.polygons.length
      const vertexCount = geometry.getAttribute('position').count

      geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertexCount * 3), 3))

      const polygon = map.polygons[0]

      map.deletePolygons([0])

      assert.equal(map.polygons.length, before - 1)

      map.insertPolygons([{ index: 0, polygon }])

      assert.equal(map.polygons.length, before)
      assert.equal(geometry.getAttribute('position').count, vertexCount)
      assert.equal(geometry.getAttribute('color'), undefined)
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

  void describe('the texture of the faces', () => {
    void it('adds a texture container the level does not have', () => {
      const map = flatMap()
      const id = map.nextTextureContainerId()

      assert.equal(map.textureNameOf(id), undefined)
      assert.equal(map.textureContainerIdOfName('dropped.png'), undefined)

      map.addTextureContainer(id, 'dropped.png')

      assert.equal(map.textureNameOf(id), 'dropped.png')
      assert.equal(map.textureContainerIdOfName('dropped.png'), id)
      // the ids of the game are the hashes of the file names, so the next one is above the biggest
      assert.equal(map.nextTextureContainerId(), id + 1)
      assert.equal(
        map.fts.textureContainers.filter((container) => {
          return container.id === id
        }).length,
        1,
      )
    })

    void it('leaves a container the level has already', () => {
      const map = flatMap()
      const id = map.nextTextureContainerId()

      map.addTextureContainer(id, 'dropped.png')
      map.addTextureContainer(id, 'other.png')

      // the step that adds a container may be replayed: the second call does not write another one
      assert.equal(map.textureNameOf(id), 'dropped.png')
      assert.equal(map.fts.textureContainers.at(-1)?.id, id)
    })

    void it('takes a container out of the level', () => {
      const map = flatMap()
      const id = map.nextTextureContainerId()

      map.addTextureContainer(id, 'dropped.png')
      map.removeTextureContainer(id)

      assert.equal(map.textureNameOf(id), undefined)
      assert.equal(map.textureContainerIdOfName('dropped.png'), undefined)
      assert.equal(
        map.fts.textureContainers.some((container) => {
          return container.id === id
        }),
        false,
      )
    })

    void it('paints the faces, and reads the runs of the texture again', () => {
      const map = flatMap()
      const { polygons } = map
      const first = polygons[0]

      assert.notEqual(first, undefined)

      if (first === undefined) {
        return
      }

      const id = map.nextTextureContainerId()

      map.addTextureContainer(id, 'dropped.png')
      map.setFaceTextures([{ index: 0, textureContainerId: id }])

      assert.equal(polygons[0]?.textureContainerId, id)

      const index = map.solidMeshes[0]?.geometry.getIndex()

      assert.notEqual(index, null)

      if (index === null) {
        return
      }

      // the first face is a quad: its two triangles are the first six indices of the plain order, and the runs are read
      // in the order of the index, so the face that changed is the first run of its new container
      assert.deepEqual(
        map.textureRuns.map((run) => {
          return { start: run.start, count: run.count, textureContainerId: run.textureContainerId }
        })[0],
        { start: 0, count: 6, textureContainerId: id },
      )

      // and the runs cover the whole index again, so the paint finds the blocks of the materials where they are
      assert.equal(
        map.textureRuns.reduce((sum, run) => {
          return sum + run.count
        }, 0),
        index.count,
      )
    })

    void it('leaves the runs alone when the faces keep their texture', () => {
      const map = flatMap()
      const runs = map.textureRuns

      map.setFaceTextures([{ index: 0, textureContainerId: map.polygons[0]?.textureContainerId ?? 0 }])

      assert.equal(map.textureRuns, runs)
    })
  })

  void describe('the uv of the faces', () => {
    void it('writes the corners into the polygon and into the geometry', () => {
      const map = flatMap()
      const polygon = map.polygons[0]
      const geometry = map.solidMeshes[0]?.geometry

      assert.notEqual(polygon, undefined)
      assert.notEqual(geometry, undefined)

      if (polygon === undefined || geometry === undefined) {
        return
      }

      const uvs = [
        { u: 0.1, v: 0.1 },
        { u: 0.9, v: 0.1 },
        { u: 0.9, v: 0.9 },
        { u: 0.1, v: 0.9 },
      ]

      map.setFaceUvs(0, uvs)

      // the model, which the export writes
      assert.deepEqual(
        polygon.vertices.slice(0, 4).map((vertex) => {
          return [vertex.u, vertex.v]
        }),
        [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.1, 0.9],
        ],
      )

      // the attribute of the mesh: the first face is the first six vertices, in the order `a, b, c, c, b, d`. The
      // attribute is a float32, so the numbers come back with the rounding of the type
      const attribute = geometry.getAttribute('uv')

      function rounded(value: number): number {
        return Math.round(value * 1e5) / 1e5
      }

      assert.deepEqual(
        Array.from({ length: 6 }, (_, slot) => {
          return [rounded(attribute.getX(slot)), rounded(attribute.getY(slot))]
        }),
        [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.9, 0.9],
          [0.9, 0.1],
          [0.1, 0.9],
        ],
      )
    })

    void it('writes the corners of a face that is not the first one', () => {
      const map = flatMap()
      const geometry = map.solidMeshes[0]?.geometry

      assert.notEqual(geometry, undefined)

      if (geometry === undefined) {
        return
      }

      const attribute = geometry.getAttribute('uv')

      function rounded(value: number): number {
        return Math.round(value * 1e5) / 1e5
      }

      const before = [rounded(attribute.getX(0)), rounded(attribute.getY(0))]

      // the blank level is a floor of quads: the second face starts at the seventh vertex
      map.setFaceUvs(1, [
        { u: 0.25, v: 0.25 },
        { u: 0.75, v: 0.25 },
        { u: 0.75, v: 0.75 },
        { u: 0.25, v: 0.75 },
      ])

      assert.deepEqual([rounded(attribute.getX(6)), rounded(attribute.getY(6))], [0.25, 0.25])
      assert.deepEqual([rounded(attribute.getX(8)), rounded(attribute.getY(8))], [0.75, 0.75])
      // and the face before it is untouched
      assert.deepEqual([rounded(attribute.getX(0)), rounded(attribute.getY(0))], before)
    })
  })
})

void describe('translatePolygons', () => {
  void it('moves the vertices of the faces, and the buffers with them', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const quad = isQuad(face)
    let solidCount = 3
    let wireCount = 6

    if (quad) {
      solidCount = 6
      wireCount = 8
    }

    const positions = map.solidMeshes[0].geometry.getAttribute('position')
    const wireframe = map.wireframeGeometry.getAttribute('position')
    const delta = { x: 10, y: -5, z: 2 }
    const sceneDelta = arxVector3toVector3(delta)
    const vertex = face.vertices[0]
    const nextVertex = map.polygons[1]?.vertices[0]
    const beforeVertex = { x: vertex.x, y: vertex.y, z: vertex.z }
    let beforeNext: { x: number; y: number; z: number } | undefined

    if (nextVertex !== undefined) {
      beforeNext = { x: nextVertex.x, y: nextVertex.y, z: nextVertex.z }
    }

    const beforeSolid = [positions.getX(0), positions.getY(0), positions.getZ(0)]
    const beforeWire = [wireframe.getX(0), wireframe.getY(0), wireframe.getZ(0)]
    const secondSolid = [positions.getX(solidCount), positions.getY(solidCount), positions.getZ(solidCount)]
    const secondWire = [wireframe.getX(wireCount), wireframe.getY(wireCount), wireframe.getZ(wireCount)]

    map.translatePolygons([0], delta)

    // the model takes the delta, the buffers the mirrored one
    assert.deepEqual(
      [vertex.x, vertex.y, vertex.z],
      [beforeVertex.x + delta.x, beforeVertex.y + delta.y, beforeVertex.z + delta.z],
    )
    assert.deepEqual(
      [positions.getX(0), positions.getY(0), positions.getZ(0)],
      [
        Math.fround(beforeSolid[0] + sceneDelta.x),
        Math.fround(beforeSolid[1] + sceneDelta.y),
        Math.fround(beforeSolid[2] + sceneDelta.z),
      ],
    )
    assert.deepEqual(
      [wireframe.getX(0), wireframe.getY(0), wireframe.getZ(0)],
      [
        Math.fround(beforeWire[0] + sceneDelta.x),
        Math.fround(beforeWire[1] + sceneDelta.y),
        Math.fround(beforeWire[2] + sceneDelta.z),
      ],
    )

    // the face next to it stays where it was
    assert.deepEqual([positions.getX(solidCount), positions.getY(solidCount), positions.getZ(solidCount)], secondSolid)
    assert.deepEqual([wireframe.getX(wireCount), wireframe.getY(wireCount), wireframe.getZ(wireCount)], secondWire)
    assert.deepEqual([nextVertex?.x, nextVertex?.y, nextVertex?.z], [beforeNext?.x, beforeNext?.y, beforeNext?.z])
  })
})
