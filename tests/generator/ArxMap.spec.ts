import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { ArxPolygon, ArxPortal } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { getBVHExtremes } from 'three-mesh-bvh'
import { BufferAttribute, Quaternion, Raycaster, Triangle, Vector3 } from 'three'
import { createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap, MIN_SCALE_FACTOR } from '../../src/generator/ArxMap.ts'
import { clearRegisteredFlatColors, registerFlatColor, wireframeLineColorOf } from '../../src/generator/flatColors.ts'
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

/**
 * Reads a coordinate scaled around a pivot, the way the step of a scale does it.
 *
 * @param value The coordinate to scale.
 * @param pivot The point it moves away from.
 * @param factor How far it moves.
 *
 * @returns The coordinate after the scale.
 */
function scaledAround(value: number, pivot: number, factor: number): number {
  const offset = value - pivot
  const scaled = offset * factor

  return pivot + scaled
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

void describe('rotatePolygons', () => {
  void it('turns the corners and the normals of the faces, and the buffers with them', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const solid = map.solidMeshes[0].geometry
    const positions = solid.getAttribute('position')
    const normals = solid.getAttribute('normal')
    const wireframe = map.wireframeGeometry.getAttribute('position')
    const corner = face.vertices[0]
    const pivot = { x: corner.x, y: corner.y, z: corner.z }
    const axis = { x: 1, y: 0, z: 0 }
    const angle = Math.PI / 2
    const turn = new Quaternion().setFromAxisAngle(new Vector3(axis.x, axis.y, axis.z), angle)
    const before = face.vertices[1]
    const expected = new Vector3(before.x - pivot.x, before.y - pivot.y, before.z - pivot.z)
      .applyQuaternion(turn)
      .add(new Vector3(pivot.x, pivot.y, pivot.z))
    const nextVertex = map.polygons[1]?.vertices[0]
    const beforeNext = { x: nextVertex?.x, y: nextVertex?.y, z: nextVertex?.z }
    const beforeNormal = { x: face.norm.x, y: face.norm.y, z: face.norm.z }
    const expectedNormal = new Vector3(beforeNormal.x, beforeNormal.y, beforeNormal.z).applyQuaternion(turn)
    const beforeSolidNormal = [normals.getX(0), normals.getY(0), normals.getZ(0)]

    map.rotatePolygons([0], pivot, axis, angle)

    // the corner the turn is around stays, the one beside it turns
    assert.ok(Math.abs(corner.x - pivot.x) < 1e-4)
    assert.ok(Math.abs(corner.y - pivot.y) < 1e-4)
    assert.ok(Math.abs(corner.z - pivot.z) < 1e-4)
    assert.ok(Math.abs(before.x - expected.x) < 1e-4)
    assert.ok(Math.abs(before.y - expected.y) < 1e-4)
    assert.ok(Math.abs(before.z - expected.z) < 1e-4)

    // the model and the buffer keep the normal of the face turned the same way
    assert.ok(Math.abs(face.norm.x - expectedNormal.x) < 1e-4)
    assert.ok(Math.abs(face.norm.y - expectedNormal.y) < 1e-4)
    assert.ok(Math.abs(face.norm.z - expectedNormal.z) < 1e-4)

    const solidNormal = [normals.getX(0), normals.getY(0), normals.getZ(0)]
    const mirrored = arxVector3toVector3({ x: expectedNormal.x, y: expectedNormal.y, z: expectedNormal.z })

    assert.ok(Math.abs(solidNormal[0] - mirrored.x) < 1e-4)
    assert.ok(Math.abs(solidNormal[1] - mirrored.y) < 1e-4)
    assert.ok(Math.abs(solidNormal[2] - mirrored.z) < 1e-4)
    assert.notDeepEqual([solidNormal[0], solidNormal[1], solidNormal[2]], beforeSolidNormal)
    assert.ok(positions.count > 0)
    assert.ok(wireframe.count > 0)

    // the face next to it stays where it was
    assert.deepEqual([nextVertex?.x, nextVertex?.y, nextVertex?.z], [beforeNext.x, beforeNext.y, beforeNext.z])
  })

  void it('leaves the level alone when there is nothing to turn', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const before = { x: face.vertices[0].x, y: face.vertices[0].y, z: face.vertices[0].z }

    map.rotatePolygons([], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI)
    map.rotatePolygons([0], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0)

    assert.deepEqual([face.vertices[0].x, face.vertices[0].y, face.vertices[0].z], [before.x, before.y, before.z])
  })
})

void describe('scalePolygons', () => {
  void it('scales the corners around the pivot, in the model and in the buffers', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const solid = map.solidMeshes[0].geometry
    const positions = solid.getAttribute('position')
    const corner = face.vertices[0]
    const pivot = { x: corner.x, y: corner.y, z: corner.z }
    const before = { x: face.vertices[1].x, y: face.vertices[1].y, z: face.vertices[1].z }
    const beforeSolid = [positions.getX(0), positions.getY(0), positions.getZ(0)]
    const nextVertex = map.polygons[1]?.vertices[0]
    const beforeNext = { x: nextVertex?.x, y: nextVertex?.y, z: nextVertex?.z }

    map.scalePolygons([0], pivot, { x: 2, y: 2, z: 2 })

    // the corner of the pivot stays, the one beside it is twice as far from it
    assert.ok(Math.abs(corner.x - pivot.x) < 1e-4)
    const expectedX = scaledAround(before.x, pivot.x, 2)
    const expectedY = scaledAround(before.y, pivot.y, 2)
    const expectedZ = scaledAround(before.z, pivot.z, 2)

    assert.ok(Math.abs(face.vertices[1].x - expectedX) < 1e-4)
    assert.ok(Math.abs(face.vertices[1].y - expectedY) < 1e-4)
    assert.ok(Math.abs(face.vertices[1].z - expectedZ) < 1e-4)

    // the buffer of the first corner stays too, since the pivot is the corner itself
    assert.ok(Math.abs(positions.getX(0) - beforeSolid[0]) < 1e-3)
    assert.ok(Math.abs(positions.getY(0) - beforeSolid[1]) < 1e-3)
    assert.ok(Math.abs(positions.getZ(0) - beforeSolid[2]) < 1e-3)

    // the face next to it stays where it was
    assert.deepEqual([nextVertex?.x, nextVertex?.y, nextVertex?.z], [beforeNext.x, beforeNext.y, beforeNext.z])
  })

  void it('holds a scale of zero at the smallest factor, so the faces can come back', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const corner = face.vertices[0]
    const pivot = { x: corner.x, y: corner.y, z: corner.z }
    const before = { x: face.vertices[1].x, y: face.vertices[1].y, z: face.vertices[1].z }

    map.scalePolygons([0], pivot, { x: 0, y: 0, z: 0 })

    // five percent of the way to the pivot, and not a line
    const expected = scaledAround(before.x, pivot.x, MIN_SCALE_FACTOR)

    assert.ok(Math.abs(face.vertices[1].x - expected) < 1e-4)
  })

  void it('leaves the level alone when there is nothing to scale', () => {
    const map = flatMap()
    const face = map.polygons[0]

    if (face === undefined) {
      throw new Error('the level has no face')
    }

    const before = { x: face.vertices[1].x, y: face.vertices[1].y, z: face.vertices[1].z }

    map.scalePolygons([], { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 })
    map.scalePolygons([0], { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })

    assert.deepEqual([face.vertices[1].x, face.vertices[1].y, face.vertices[1].z], [before.x, before.y, before.z])
  })
})

void describe('the wireframe colours of the map', () => {
  void it('takes the flat colour of the texture of every face', () => {
    const map = flatMap()
    const colors = map.wireframeGeometry.getAttribute('color')

    // the blank level's own texture is not in the table of the flat colours: its faces take the white line of the
    // textures the table does not know
    assert.deepEqual([colors.getX(0), colors.getY(0), colors.getZ(0)], [1, 1, 1])
  })

  void it('writes the colours again when a face takes another texture', () => {
    const map = flatMap()

    map.addTextureContainer(7, '(fabric)_gobelin_bed.bmp')
    map.setFaceTextures([{ index: 0, textureContainerId: 7 }])

    const dark = map.wireframeGeometry.getAttribute('color')
    const [darkRed, darkGreen, darkBlue] = wireframeLineColorOf('(fabric)_gobelin_bed.bmp')

    // 53, 33, 20: a dark cloth, so the line is its light inverse (the buffer holds the numbers as float32)
    assert.deepEqual(
      [dark.getX(0), dark.getY(0), dark.getZ(0)],
      [Math.fround(darkRed), Math.fround(darkGreen), Math.fround(darkBlue)],
    )

    map.addTextureContainer(8, '[fabric]_human_observatory1.bmp')
    map.setFaceTextures([{ index: 0, textureContainerId: 8 }])

    const light = map.wireframeGeometry.getAttribute('color')
    const [lightRed, lightGreen, lightBlue] = wireframeLineColorOf('[fabric]_human_observatory1.bmp')

    // 163, 148, 126: a light cloth, so the line turns its dark inverse without the geometry being built again
    assert.deepEqual(
      [light.getX(0), light.getY(0), light.getZ(0)],
      [Math.fround(lightRed), Math.fround(lightGreen), Math.fround(lightBlue)],
    )
  })
})

void describe('refreshWireframeColors', () => {
  afterEach(() => {
    clearRegisteredFlatColors()
  })

  void it('writes the colours again when a custom flat colour arrives', () => {
    const map = flatMap()
    const before = map.wireframeGeometry.getAttribute('color')

    // the blank level's texture is not in the table of the game: its line is the white of the dark faces
    assert.deepEqual([before.getX(0), before.getY(0), before.getZ(0)], [1, 1, 1])

    // the texture of the level is decoded after the level was built: its average arrives later
    registerFlatColor('jorge-[stone].jpg', [200, 120, 40])
    map.refreshWireframeColors()

    const after = map.wireframeGeometry.getAttribute('color')
    const [red, green, blue] = wireframeLineColorOf('jorge-[stone].jpg')

    // the buffer holds the numbers as float32
    assert.deepEqual(
      [after.getX(0), after.getY(0), after.getZ(0)],
      [Math.fround(red), Math.fround(green), Math.fround(blue)],
    )
    assert.notDeepEqual([after.getX(0), after.getY(0), after.getZ(0)], [1, 1, 1])
  })
})

/**
 * A portal of the test, between two rooms.
 *
 * @param room1 One side of the portal.
 * @param room2 The other side.
 *
 * @returns The portal, with four corners around a square.
 */
function portalOfTest(room1: number, room2: number): ArxPortal {
  const corners = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
  ]
  const vertices = corners.map((position, index) => {
    let rhw = 0

    if (index === 0) {
      rhw = 1
    }

    return { position, rhw }
  }) as ArxPortal['polygon']['vertices']

  return {
    polygon: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 0 },
      norm: { x: 0, y: 0, z: 1 },
      norm2: { x: 2, y: 0, z: 0 },
      vertices,
      center: { x: 0.5, y: 0.5, z: 0 },
    },
    room1,
    room2,
    usePortal: 0,
  }
}

void describe('setPortals', () => {
  void it('grows the list of the rooms so a portal to a new room is in both lists', () => {
    const map = flatMap()

    map.setPortals([portalOfTest(1, 5)])

    assert.equal(map.portals.length, 1)
    assert.equal(map.fts.rooms.length, 6)
    assert.deepEqual(map.fts.rooms[1]?.portals, [0])
    assert.deepEqual(map.fts.rooms[5]?.portals, [0])
  })
})

/**
 * A face of the level, with the assertion that it is there.
 *
 * @param map The level to read.
 * @param index Which face.
 *
 * @returns The face.
 *
 * @throws When the level has no such face.
 */
function polygonOf(map: ArxMap, index: number): ArxPolygon {
  const polygon = map.polygons[index]

  if (polygon === undefined) {
    throw new TypeError(`the level has no face ${String(index)}`)
  }

  return polygon
}

void describe('setHiddenPolygons', () => {
  void it('takes the faces out of the index of the mesh, and keeps them in the level', () => {
    const map = flatMap()
    const hidden = new Set([polygonOf(map, 0), polygonOf(map, 1)])
    const geometry = map.solidMeshes[0]?.geometry
    const corners = geometry?.getAttribute('position').count ?? 0
    const triangles = (geometry?.getIndex()?.count ?? 0) / 3
    const removed = [...hidden]
      .map((polygon) => {
        if (isQuad(polygon)) {
          return 2
        }

        return 1
      })
      .reduce((one, other) => {
        return one + other
      }, 0)

    const rebuilt = map.setHiddenPolygons(hidden)

    assert.equal(rebuilt, true)
    // the level and the vertices are whole, the index is not
    assert.equal(map.polygons.length, 121)
    assert.equal(map.visiblePolygons.length, 119)
    assert.equal(geometry?.getAttribute('position').count, corners)
    assert.equal((geometry?.getIndex()?.count ?? 0) / 3, triangles - removed)
    assert.equal(map.visiblePolygons[0], polygonOf(map, 2))
  })

  void it('puts the faces back into the index when the view is not hidden any more', () => {
    const map = flatMap()
    const geometry = map.solidMeshes[0]?.geometry
    const triangles = (geometry?.getIndex()?.count ?? 0) / 3

    map.setHiddenPolygons(new Set([polygonOf(map, 0)]))
    assert.ok((geometry?.getIndex()?.count ?? 0) / 3 < triangles)

    map.setHiddenPolygons(new Set())

    assert.equal(map.visiblePolygons.length, map.polygons.length)
    assert.equal((geometry?.getIndex()?.count ?? 0) / 3, triangles)
    // the wireframe draws every point again
    assert.equal(map.wireframeGeometry.getIndex(), null)
  })

  void it('leaves the triangles of the hidden faces out of the tree of the picking', () => {
    const map = flatMap()
    const mesh = map.solidMeshes[0]

    map.setHiddenPolygons(new Set([polygonOf(map, 0)]))

    // a ray from above the hidden face: the level under it is the face behind, or nothing
    const face = polygonOf(map, 0)
    const vertex = face.vertices[0]

    if (vertex === undefined) {
      throw new TypeError('the face has no corner')
    }

    const scene = map.scenePosition
    const from = new Vector3(-vertex.x + scene.x, -vertex.y + scene.y + 100, vertex.z - scene.z)
    const raycaster = new Raycaster(from, new Vector3(0, -1, 0))
    const hits = raycaster.intersectObject(mesh, false)

    // the hidden face is not a hit: the picking can not reach it
    const reachedTheHidden = hits.some((hit) => {
      const triangle = hit.faceIndex

      if (triangle === undefined || triangle === null) {
        return false
      }

      return map.triangleToPolygon[triangle] === 0
    })

    assert.equal(reachedTheHidden, false)
  })

  void it('keeps the welded vertices of the visible faces out of the hidden ones', () => {
    const map = flatMap()

    map.setHiddenPolygons(new Set([polygonOf(map, 0), polygonOf(map, 1)]))

    const touched = new Set(
      map.vertexToPolygons.values().flatMap((polygons) => {
        return polygons
      }),
    )

    assert.ok(!touched.has(0))
    assert.ok(!touched.has(1))
    assert.ok(touched.size > 0)
  })

  void it('moves the corners of a visible face, the hidden ones staying in their place in the buffers', () => {
    const map = flatMap()
    const delta = { x: 10, y: 20, z: 30 }
    const geometry = map.solidMeshes[0]?.geometry
    const positions = geometry?.getAttribute('position')

    if (!(positions instanceof BufferAttribute)) {
      throw new TypeError('the level has no position attribute')
    }

    // the face 1 owns the second range of the geometry: hiding the face 0 does not move it
    const first = polygonOf(map, 0)
    const corner = first.vertices[0]

    if (corner === undefined) {
      throw new TypeError('the face has no corner')
    }

    const quad = isQuad(first)
    let at = 0

    if (quad) {
      at = 6
    } else {
      at = 3
    }

    const before = [positions.getX(at), positions.getY(at), positions.getZ(at)]

    map.setHiddenPolygons(new Set([first]))

    assert.deepEqual([positions.getX(at), positions.getY(at), positions.getZ(at)], before)

    map.translatePolygons([1], delta)

    // the hidden face kept its place in the buffers: the move of the face 1 lands on its own vertices
    assert.deepEqual(
      [positions.getX(at), positions.getY(at), positions.getZ(at)],
      [before[0] - delta.x, before[1] - delta.y, before[2] + delta.z],
    )
  })

  void it('cuts a deleted face while a group is hidden, and keeps the index of the view', () => {
    const map = flatMap()
    const geometry = map.solidMeshes[0]?.geometry

    map.setHiddenPolygons(new Set([polygonOf(map, 0)]))

    map.deletePolygons([2])

    assert.equal(map.polygons.length, 120)
    assert.equal(map.visiblePolygons.length, 119)
    // the triangles are the visible faces: the deleted one went, the hidden one is out
    const visibleTriangles = map.visiblePolygons
      .map((polygon) => {
        if (isQuad(polygon)) {
          return 2
        }

        return 1
      })
      .reduce((one, other) => {
        return one + other
      }, 0)

    assert.equal((geometry?.getIndex()?.count ?? 0) / 3, visibleTriangles)
  })

  void it('empties the index when every face is hidden, and puts the level back', () => {
    const map = flatMap()
    const geometry = map.solidMeshes[0]?.geometry
    const triangles = (geometry?.getIndex()?.count ?? 0) / 3

    map.setHiddenPolygons(new Set(map.polygons))

    assert.equal(map.visiblePolygons.length, 0)
    assert.equal(geometry?.getIndex()?.count ?? 0, 0)
    // the vertices are the ones of the level: the index is what the views draw
    assert.equal((geometry?.getAttribute('position').count ?? 0) > 0, true)

    map.setHiddenPolygons(new Set())

    assert.equal(map.visiblePolygons.length, map.polygons.length)
    assert.equal((geometry?.getIndex()?.count ?? 0) / 3, triangles)
  })

  void it('hides every face of a painted level, whose groups are ranges of the old index', () => {
    const map = flatMap()
    const geometry = map.solidMeshes[0]?.geometry
    const index = geometry?.getIndex()

    if (geometry === undefined || index === null || index === undefined) {
      throw new TypeError('the level has no index')
    }

    // the paint leaves the groups of the texture runs on the geometry, and the tree of the picking reads them
    geometry.addGroup(0, index.count / 2, 0)
    geometry.addGroup(index.count / 2, index.count / 2, 1)

    map.setHiddenPolygons(new Set(map.polygons))

    assert.equal(geometry.getIndex()?.count ?? -1, 0)
    // the groups of the old index are gone with it
    assert.equal(geometry.groups.length, 0)
    assert.notEqual(geometry.boundsTree, undefined)
  })

  void it('counts the faces of the level in the statistics, not of the view', () => {
    const map = flatMap()
    const before = map.statistics.faceCount

    map.setHiddenPolygons(new Set([polygonOf(map, 0), polygonOf(map, 1)]))

    assert.equal(map.statistics.faceCount, before)
  })
})
