import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  FrontSide,
  type LineBasicMaterial,
  type LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
} from 'three'
import { Color } from '../../../../../src/generator/Color.ts'
import { accelerateRaycast, arxPolygonsToGeometry } from '../../../../../src/generator/meshes.ts'
import { triangleToPolygonMap, usedVerticesOf } from '../../../../../src/generator/polygons.ts'
import {
  createPolygonSelectionOverlay,
  faceToSweep,
  pickPolygon,
  pickPolygonAt,
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

  void it('keeps a hint of the colour of the room under the yellow', () => {
    const inARoom = polygon(true)
    const withoutARoom = { ...polygon(true), room: -1 }

    const tinted = polygonFillGeometry([inARoom], new Vector3(0, 0, 0), () => {
      return '#0000ff'
    }).getAttribute('color') as BufferAttribute
    const plain = polygonFillGeometry([withoutARoom], new Vector3(0, 0, 0), () => {
      return '#0000ff'
    }).getAttribute('color') as BufferAttribute

    // the three vertices of the face share its mark: the yellow mixed with a hint of the blue of the room
    assert.deepEqual([tinted.getX(0), tinted.getY(0), tinted.getZ(0)], [tinted.getX(5), tinted.getY(5), tinted.getZ(5)])
    // the green of the yellow mixes with the blue towards a teal, and a face without a room stays the plain yellow
    assert.ok(tinted.getY(0) < plain.getY(0))
    assert.ok(plain.getX(0) > 0.9)
    assert.ok(plain.getZ(0) < 0.1)
  })

  void it('carries the corner normals of the polygon, so a lit material shades it', () => {
    const quad = polygon(true)
    const geometry = polygonFillGeometry([quad], new Vector3(0, 0, 0))
    const normals = geometry.getAttribute('normal')

    // one normal per vertex, the six of the two triangles: the base under the fill is lit, and a missing normal
    // would paint the beams of a ceiling flat. The game's normal points up along its own Y, and the view mirrors that
    // axis (the game's Y points down), so the normal of the geometry is the mirrored one
    assert.equal(normals.count, 6)
    assert.equal(normals.getY(0), -1)
    assert.equal(normals.getZ(0), 0)
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

void describe('pickPolygonAt', () => {
  /**
   * Builds an orthographic camera over the middle of the floor of the test.
   *
   * @returns The camera, the mesh of the floor and the triangle map of its polygon.
   */
  function sceneFromAbove(): { camera: OrthographicCamera; meshes: Mesh[]; triangleToPolygon: number[] } {
    const floor = polygon(true)
    const geometry = arxPolygonsToGeometry([floor], new Vector3(0, 0, 0))
    const mesh = new Mesh(geometry, new MeshBasicMaterial())

    mesh.updateMatrixWorld()

    // the floor spans x -10..0 and z 0..10 in the world, so the point in the middle of the view is on it
    const camera = new OrthographicCamera(-20, 20, 20, -20, 0.1, 100)
    camera.position.set(-5, 10, 5)
    camera.lookAt(-5, 0, 5)
    camera.updateMatrixWorld()

    return { camera, meshes: [mesh], triangleToPolygon: triangleToPolygonMap([floor]) }
  }

  void it('reads the polygon under a point of an orthographic view', () => {
    const { camera, meshes, triangleToPolygon } = sceneFromAbove()

    assert.equal(pickPolygonAt(camera, new Vector2(0, 0), meshes, triangleToPolygon), 0)
  })

  void it('reads nothing when the point is off the face', () => {
    const { camera, meshes, triangleToPolygon } = sceneFromAbove()

    assert.equal(pickPolygonAt(camera, new Vector2(0.9, 0.9), meshes, triangleToPolygon), undefined)
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

  void it('paints the fill on the faces towards the camera only, like the level', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])

    const [fill] = scene.children as Array<Mesh<BufferGeometry, MeshBasicMaterial>>

    // a face the level does not draw is not painted either: the selection keeps one colour, so the yellow always
    // says "this is selected and this is what I see" (the cyan of the two sided fill read as another thing)
    assert.equal(fill.material.side, FrontSide)
    assert.equal(fill.material.color.getHex(), Color.yellow.getHex())
    assert.equal(fill.material.opacity, 0.35)

    // the fill is lit, so the yellow keeps the shading of the surfaces under it (the beams of a room stay visible),
    // and it reads the colour of every face it covers
    assert.ok(fill.material instanceof MeshLambertMaterial)
    assert.ok(fill.material.vertexColors)
  })

  void it('turns the yellow nearly solid on the room map, and back to a tint on the level', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    overlay.setBackdrop(true)

    const [fill] = scene.children as Array<Mesh<BufferGeometry, MeshBasicMaterial>>
    const onTheMap = fill.material.opacity

    overlay.setBackdrop(false)

    // the base means the room map: there the yellow is the mark itself, and on the level it stays a tint that lets the
    // art of the level through
    assert.ok(onTheMap > 0.8)
    assert.equal(fill.material.opacity, 0.35)
  })

  void it('draws a grey base under the fill while the room map is on', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    overlay.setBackdrop(true)

    const [fill, base] = scene.children as Array<Mesh<BufferGeometry, MeshBasicMaterial>>

    // the same geometry, the base just under the yellow: the colour of the room must not tint the mark of the selection
    assert.equal(scene.children.length, 2)
    assert.equal(base.geometry, fill.geometry)
    assert.ok(base.renderOrder < fill.renderOrder)
    assert.equal(base.material.side, FrontSide)
    assert.ok(base.material.opacity > 0.5)
    assert.notEqual(base.material.color.getHex(), fill.material.color.getHex())

    // the base is lit: the grey takes the colour of the room away but keeps the shading of the surfaces
    assert.ok(base.material instanceof MeshLambertMaterial)
  })

  void it('takes the base away with the map, and keeps the fill', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setHighlight([polygon(true)])
    overlay.setBackdrop(true)
    overlay.setBackdrop(false)

    assert.equal(scene.children.length, 1)
  })

  void it('draws no base without a selection', () => {
    const scene = new Scene()
    const overlay = createPolygonSelectionOverlay(scene, new Vector3(0, 0, 0))

    overlay.setBackdrop(true)
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
    assert.deepEqual(chosen, { kind: 'take', index: 1 })
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

    assert.deepEqual(chosen, { kind: 'take', index: 3 })
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

  void it('stops at a face the selection holds already, and says it crossed it', () => {
    const polygons = [quadAt(0)]

    const chosen = faceToSweep({
      candidates: [0],
      polygons,
      selected: new Set([0]),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'add',
    })

    // the face is not taken (it is in the selection), but the drag has to know it ran into it: its vertices
    // let the pencil go on beyond it
    assert.deepEqual(chosen, { kind: 'cross', index: 0 })
  })

  void it('does not walk past a selected face to the one behind it', () => {
    // the bug of 2026-10-31: the crosshair was on a selected face, and the face behind it got selected
    const polygons = [quadAt(0), quadAt(10)]

    const chosen = faceToSweep({
      candidates: [0, 1],
      polygons,
      selected: new Set([0]),
      vertices: [],
      mode: 'add',
    })

    assert.deepEqual(chosen, { kind: 'cross', index: 0 })
  })

  void it('does not walk past a selected face in the middle of a drag either', () => {
    const polygons = [quadAt(0), quadAt(10), quadAt(20)]

    const chosen = faceToSweep({
      candidates: [1, 2],
      polygons,
      selected: new Set([1]),
      vertices: usedVerticesOf(polygons[0]),
      mode: 'add',
    })

    // quad 2 touches the traced quad, but quad 1 hides it: the walk ends on the crossed face
    assert.deepEqual(chosen, { kind: 'cross', index: 1 })
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

    // taking away the face the selection holds is the point of a remove gesture
    assert.deepEqual(chosen, { kind: 'take', index: 1 })
  })
})
