import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  type LineBasicMaterial,
  type LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
} from 'three'
import { Color } from '../../../../../src/generator/Color.ts'
import { accelerateRaycast, arxPolygonsToGeometry } from '../../../../../src/generator/meshes.ts'
import { triangleToPolygonMap, usedVerticesOf } from '../../../../../src/generator/polygons.ts'
import {
  createPolygonSelectionOverlay,
  faceToSweep,
  pickPolygon,
  pickPolygons,
  polygonFillGeometry,
  polygonOutlineGeometry,
} from '../../../../../src/editor/components/widgets/View3DWidget/polygonSelection.ts'

/**
 * A flat polygon of the test, lying in the `XZ` plane, facing up.
 *
 * @param isQuad `true` for a quad, `false` for a triangle.
 *
 * @returns Four vertices in the order the game stores them, and the quad flag when it is one.
 */
function polygon(isQuad: boolean): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (isQuad) {
    flags = ArxPolygonFlags.Quad
  }

  const normal: ArxVector3 = { x: 0, y: 1, z: 0 }

  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 10, y: 0, z: 0, u: 1, v: 0 },
      { x: 10, y: 0, z: 10, u: 1, v: 1 },
      { x: 0, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId: 1,
    norm: normal,
    norm2: normal,
    transval: 0,
    area: 100,
    flags,
    room: 1,
  }
}

/**
 * A quad of the test, moved along `x`.
 *
 * @param x Where the left edge of the quad sits.
 *
 * @returns The same square, with its left edge on `x`.
 */
function quadAt(x: number): ArxPolygon {
  const base = polygon(true)

  return {
    ...base,
    vertices: [
      { ...base.vertices[0], x: base.vertices[0].x + x },
      { ...base.vertices[1], x: base.vertices[1].x + x },
      { ...base.vertices[2], x: base.vertices[2].x + x },
      { ...base.vertices[3], x: base.vertices[3].x + x },
    ],
  }
}

/**
 * The vertices of a geometry, as a flat list.
 *
 * @param geometry The geometry to read.
 *
 * @returns Every coordinate of every point, three per point.
 */
function coordinates(geometry: BufferGeometry): number[] {
  return [...((geometry.getAttribute('position').array as Float32Array) ?? [])]
}

void describe('polygonOutlineGeometry', () => {
  void it('gives the perimeter of a quad: four segments', () => {
    const geometry = polygonOutlineGeometry(polygon(true), new Vector3(0, 0, 0))

    // four edges, two points each
    assert.equal(geometry.getAttribute('position').count, 8)
  })

  void it('gives the perimeter of a triangle: three segments', () => {
    const geometry = polygonOutlineGeometry(polygon(false), new Vector3(0, 0, 0))

    assert.equal(geometry.getAttribute('position').count, 6)
  })

  void it('shifts the outline by the scene position, like the mesh', () => {
    const geometry = polygonOutlineGeometry(polygon(true), new Vector3(1, 2, 3))

    assert.deepEqual(coordinates(geometry).slice(0, 3), [-1, -2, -3])
  })
})

void describe('polygonFillGeometry', () => {
  void it('covers a quad with two triangles', () => {
    const geometry = polygonFillGeometry([polygon(true)], new Vector3(0, 0, 0))

    // two triangles, three points each
    assert.equal(geometry.getAttribute('position').count, 6)
  })

  void it('covers nothing without a polygon', () => {
    const geometry = polygonFillGeometry([], new Vector3(0, 0, 0))

    assert.equal(geometry.getAttribute('position').count, 0)
  })
})

/**
 * Builds a camera under a floor, looking up at it.
 *
 * @remarks
 * The floor is built the way the level builds its geometry (the polygons through `arxPolygonsToGeometry`,
 * then the BVH), so the picking walks the same path: a plain `PlaneGeometry` has an index of its own and the
 * test would not see the reordering the BVH does.
 *
 * @returns The camera, the mesh of the floor and the triangle map of its polygon.
 */
function sceneLookingAtTheFloor(): { camera: PerspectiveCamera; meshes: Mesh[]; triangleToPolygon: number[] } {
  const floor = polygon(true)
  const geometry = arxPolygonsToGeometry([floor], new Vector3(0, 0, 0))
  const mesh = new Mesh(geometry, new MeshBasicMaterial())

  accelerateRaycast(mesh)
  mesh.updateMatrixWorld()

  // the geometry mirrors the game's axes, so the quad spans `x` from -10 to 0, and the game's normal points
  // down: the front of the floor is the side the camera of the walkable view stands on, above it
  const camera = new PerspectiveCamera(75, 1, 0.1, 1000)
  camera.position.set(-5, 5, 5)
  camera.lookAt(-5, 0, 5)
  camera.updateProjectionMatrix()

  return { camera, meshes: [mesh], triangleToPolygon: triangleToPolygonMap([floor]) }
}

void describe('pickPolygon', () => {
  void it('reads the polygon of the face under the middle of the canvas', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()

    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), 0)
  })

  void it('reads nothing from a back face', () => {
    // the level is single sided: from the other side of the floor only the back of its triangles is there,
    // and three skips them, so nothing can be selected from the wrong side
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()
    camera.position.set(-5, -5, 5)
    camera.lookAt(-5, 0, 5)
    camera.updateMatrixWorld()

    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), undefined)
  })

  void it('reads nothing when the ray hits nothing', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()
    camera.lookAt(1000, 0, 1000)
    camera.updateMatrixWorld()

    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), undefined)
  })

  void it('reads the polygon of both triangles of a quad', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()

    // the two triangles of the quad are the same polygon
    assert.equal(triangleToPolygon.length, 2)
    assert.deepEqual([...new Set(triangleToPolygon)], [0])
    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), 0)
  })

  void it('walks the same path as the level, with the BVH on the mesh', () => {
    // the level puts a BVH on its geometry, and the BVH reorders the triangles: the index an intersection
    // reports follows the reordered buffer, so the pick reads the real vertex instead. This mesh is built
    // with the pipeline of the level, so the test walks that path.
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()

    assert.notStrictEqual(meshes[0].geometry.boundsTree, undefined)
    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), 0)
  })

  void it('reads the polygon of a later mesh of the level', () => {
    // the level is more than one mesh: the invisible walls have their own, and the triangle map runs over all
    // of them, so a hit on the second mesh has to carry the triangles of the first one
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()
    const first = meshes[0]

    // the first mesh is moved out of the way: the ray finds the second one
    first.position.set(0, 1000, 0)
    first.updateMatrixWorld()

    const second = new Mesh(arxPolygonsToGeometry([polygon(true)], new Vector3(0, 0, 0)), new MeshBasicMaterial())
    second.updateMatrixWorld()

    // the map of the first mesh is the helper's, the second mesh carries the polygon 1
    assert.equal(pickPolygon(camera, [first, second], [...triangleToPolygon, 1, 1]), 1)
  })

  void it('reads more than one face of the ray, nearest first', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()
    const first = meshes[0]

    // a second floor over the first: the ray meets the nearer one first
    const second = new Mesh(arxPolygonsToGeometry([polygon(true)], new Vector3(0, 0, 0)), new MeshBasicMaterial())

    second.position.set(0, 2, 0)
    second.updateMatrixWorld()

    const polygons = pickPolygons(
      camera,
      [first, second],
      [
        ...triangleToPolygon,
        ...triangleToPolygon.map(() => {
          return 1
        }),
      ],
      2,
    )

    assert.deepEqual(polygons, [1, 0])
  })

  void it('gives the nearest face only by default', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()

    assert.deepEqual(pickPolygons(camera, meshes, triangleToPolygon), [0])
    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), 0)
  })

  void it('reads nothing beyond the far plane of the camera', () => {
    const { camera, meshes, triangleToPolygon } = sceneLookingAtTheFloor()
    camera.far = 1
    camera.updateProjectionMatrix()

    assert.equal(pickPolygon(camera, meshes, triangleToPolygon), undefined)
  })
})

void describe('createPolygonSelectionOverlay', () => {
  void it('shows the outline of the polygon under the crosshair, and hides it again', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setCursor(polygon(true), 'replace')
    assert.equal(scene.children.length, 1)

    overlay.setCursor(undefined, 'replace')
    assert.equal(scene.children.length, 0)
  })

  void it('colours the outline red when the click would remove the polygon', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setCursor(polygon(true), 'add')

    // the colour is read out at the moment of the call: the overlay keeps one material and repaints it
    const [outline] = scene.children as Array<LineSegments<BufferGeometry, LineBasicMaterial>>
    const { material } = outline
    const green = material.color.getHex()

    overlay.setCursor(polygon(true), 'remove')
    const red = material.color.getHex()

    assert.equal(green, Color.green.getHex())
    assert.equal(red, Color.red.getHex())
  })

  void it('fills the selected polygons, and empties the fill', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    assert.equal(scene.children.length, 1)

    overlay.setHighlight([])
    assert.equal(scene.children.length, 0)
  })

  void it('draws the fill under the outline', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    overlay.setCursor(polygon(true), 'replace')

    const orders = scene.children.map((child) => {
      return child.renderOrder
    })

    // the fill (7) first, then the outline of the cursor (9), with the wireframe of the level between them (8)
    assert.deepEqual(orders, [7, 9])
  })

  void it('takes both out of the scene on dispose', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    overlay.setCursor(polygon(true), 'replace')
    overlay.dispose()

    assert.equal(scene.children.length, 0)
  })
})

void describe('faceToSweep', () => {
  void it('takes the nearest face when nothing is selected yet', () => {
    const polygons = [quadAt(0), quadAt(10)]

    const chosen = faceToSweep({
      candidates: [1, 0],
      polygons,
      selected: new Set<number>(),
      vertices: [],
      mode: 'replace',
    })

    // nothing is selected, so nothing has to touch: the nearest face is the one the drag starts on
    assert.equal(chosen, 1)
  })

  void it('skips a nearer face that does not touch the drag', () => {
    // the ray meets the far quad 1 first, but only quad 0 (already in the drag) touches quad 3
    const polygons = [quadAt(0), quadAt(10), quadAt(20), quadAt(10)]

    const chosen = faceToSweep({
      candidates: [2, 3],
      polygons,
      selected: new Set<number>(),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'add',
    })

    assert.equal(chosen, 3)
  })

  void it('takes nothing when no face touches the drag', () => {
    const polygons = [quadAt(0), quadAt(40)]

    const chosen = faceToSweep({
      candidates: [1],
      polygons,
      selected: new Set<number>(),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'add',
    })

    assert.equal(chosen, undefined)
  })

  void it('skips the faces that are selected already', () => {
    const polygons = [quadAt(0)]

    const chosen = faceToSweep({
      candidates: [0],
      polygons,
      selected: new Set([0]),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'add',
    })

    assert.equal(chosen, undefined)
  })

  void it('takes the nearest face to remove, touching or not', () => {
    const polygons = [quadAt(0), quadAt(40)]

    const chosen = faceToSweep({
      candidates: [1],
      polygons,
      selected: new Set([1]),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'remove',
    })

    assert.equal(chosen, 1)
  })
})
