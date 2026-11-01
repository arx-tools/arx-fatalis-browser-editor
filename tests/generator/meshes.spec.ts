import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ArxPolygonFlags,
  type ArxFTS,
  type ArxPolygon,
  type ArxTextureContainer,
  type ArxVector3,
} from 'arx-convert/types'
import { Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Vector2, Vector3 } from 'three'
import {
  accelerateRaycast,
  arxPolygonsToGeometry,
  copyVertexSegments,
  keptRuns,
  arxPolygonsToWireframeGeometry,
  createWireframeMaterial,
  arxVector3toVector3,
  createLevelMaterial,
  splitPolygons,
} from '../../src/generator/meshes.ts'
import { Color } from '../../src/generator/Color.ts'

/**
 * A position of the test.
 *
 * @param x The first channel of the coordinates.
 * @param y The second channel of the coordinates.
 * @param z The third channel of the coordinates.
 *
 * @returns The point those three channels describe.
 */
function position(x: number, y: number, z: number): ArxVector3 {
  return { x, y, z }
}

/**
 * A flat polygon of the test, with four vertices at the same height.
 *
 * @param isQuad `true` for a quad, `false` for a triangle.
 * @param container The id of the texture container it uses.
 *
 * @returns It, with four vertices and the same normal in every corner.
 */
function polygon(isQuad: boolean, container = 1): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (isQuad) {
    flags = ArxPolygonFlags.Quad
  }

  // the corners of a quad are not a loop: a-b is one edge of it and c-d is the opposite one (the perimeter is
  // a, b, d, c), which is how the game stores them
  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 10, y: 0, z: 0, u: 1, v: 0 },
      { x: 0, y: 0, z: 10, u: 0, v: 1 },
      { x: 10, y: 0, z: 10, u: 1, v: 1 },
    ],
    textureContainerId: container,
    norm: position(0, 1, 0),
    norm2: position(0, 1, 0),
    transval: 0,
    area: 100,
    flags,
    room: 1,
  }
}

/**
 * A scene of the test: one real container and, optionally, the invisible one.
 *
 * @param polygons The shapes of the scene.
 * @param withInvisible `true` to add the `alpha.bmp` container the level hides.
 *
 * @returns A scene with the two containers and the given shapes.
 */
function scene(polygons: ArxPolygon[], withInvisible = false): ArxFTS {
  const containers = [{ id: 1, filename: 'stone.bmp' }]

  if (withInvisible) {
    containers[1] = { id: 2, filename: 'alpha.bmp' }
  }

  return {
    header: { mScenePosition: position(0, 0, 0) },
    textureContainers: containers as unknown as ArxTextureContainer[],
    polygons,
    cells: [],
    anchors: [],
    portals: [],
    rooms: [],
    roomDistances: [],
  } as unknown as ArxFTS
}

/**
 * Rounds the positions of a geometry and normalizes the mirrored zeros.
 *
 * @param geometry The geometry to read.
 *
 * @returns The positions, rounded to integers and without the mirrored zeros.
 */
function roundedPositions(geometry: ReturnType<typeof arxPolygonsToGeometry>): number[] {
  return [...geometry.getAttribute('position').array].map((value) => {
    return Math.round(value) + 0
  })
}

void describe('arxVector3toVector3', () => {
  void it('mirrors the X and Y axes', () => {
    assert.deepEqual(arxVector3toVector3(position(1, 2, 3)).toArray(), [-1, -2, 3])
  })
})

/**
 * Subtracts two products, in the order a cross product needs them.
 *
 * @param one The first factor of the first product.
 * @param other The second factor of the first product.
 * @param third The first factor of the second product.
 * @param fourth The second factor of the second product.
 *
 * @returns `one * other - third * fourth`.
 */
function productDifference(one: number, other: number, third: number, fourth: number): number {
  const left = one * other
  const right = third * fourth

  return left - right
}

/**
 * Reads the direction a triangle turns to, from the flat positions of a geometry.
 *
 * @param flat The positions of the geometry, three numbers for a vertex.
 * @param start Where the triangle starts in the list.
 *
 * @returns The cross product of its two edges.
 */
function windingOf(flat: readonly number[], start: number): number[] {
  const [a, b, c] = [flat.slice(start, start + 3), flat.slice(start + 3, start + 6), flat.slice(start + 6, start + 9)]
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]

  return [
    productDifference(u[1], v[2], u[2], v[1]),
    productDifference(u[2], v[0], u[0], v[2]),
    productDifference(u[0], v[1], u[1], v[0]),
  ]
}

void describe('arxPolygonsToGeometry', () => {
  void it('splits a triangle into one triangle', () => {
    const geometry = arxPolygonsToGeometry([polygon(false)], new Vector3())

    assert.equal(geometry.getAttribute('position').count, 3)
    assert.equal(geometry.getAttribute('normal').count, 3)
    assert.equal(geometry.getAttribute('uv').count, 3)
  })

  void it('splits a quad into two triangles along b-c', () => {
    const geometry = arxPolygonsToGeometry([polygon(true)], new Vector3())
    const positions = roundedPositions(geometry)

    assert.equal(geometry.getAttribute('position').count, 6)

    // the first triangle is a, b, c, the second one is c, b, d
    assert.deepEqual(positions.slice(0, 9), [0, 0, 0, -10, 0, 0, 0, 0, 10])
    assert.deepEqual(positions.slice(9), [0, 0, 10, -10, 0, 0, -10, 0, 10])
  })

  void it('turns both triangles of a quad the same way', () => {
    const geometry = arxPolygonsToGeometry([polygon(true)], new Vector3())
    const flat = roundedPositions(geometry)
    const [first, second] = [windingOf(flat, 0), windingOf(flat, 9)]
    const third = first[2] * second[2]
    const along = productDifference(first[0], second[0], -first[1], second[1]) + third

    // the winding is what the back side culling of the material reads: when the two halves of a quad turn against
    // each other, one of them is dropped and the quad shows as a triangle (a blank level's floor did exactly that
    // with its corners written as a loop instead of an a-b, c-d pair)
    assert.ok(along > 0, 'the two halves turn together')
  })

  void it('shifts the geometry by the offset', () => {
    const geometry = arxPolygonsToGeometry([polygon(false)], new Vector3(100, 200, 300))

    assert.deepEqual(roundedPositions(geometry).slice(0, 3), [-100, -200, -300])
  })
})

void describe('splitPolygons', () => {
  void it('keeps the polygons with a real texture as the solid ones', () => {
    const level = scene([polygon(false)])

    assert.deepEqual(splitPolygons(level), { solid: [level.polygons[0]], invisible: [] })
  })

  void it('puts the ones with an alpha container among the invisible walls', () => {
    // the alpha container is the second one of the test scene: its polygon draws nothing
    const level = scene([polygon(false, 1), polygon(false, 2)], true)

    assert.equal(splitPolygons(level).solid.length, 1)
    assert.equal(splitPolygons(level).invisible.length, 1)
  })

  void it('keeps the order of the file in both lists', () => {
    const level = scene([polygon(false, 2), polygon(false, 1), polygon(false, 2)], true)
    const split = splitPolygons(level)

    assert.deepEqual(
      split.invisible.map((each) => {
        return each.textureContainerId
      }),
      [2, 2],
    )
    assert.deepEqual(
      split.solid.map((each) => {
        return each.textureContainerId
      }),
      [1],
    )
  })
})

void describe('createLevelMaterial', () => {
  void it('is a flat lambert material in the preview grey', () => {
    const material = createLevelMaterial()

    assert.equal(material.color.getHex(), Color.fromCSS('#b8b2a8').getHex())
    assert.equal(material.vertexColors, false)
  })

  void it('gives a new material every time, so a mesh can own its own', () => {
    assert.notEqual(createLevelMaterial(), createLevelMaterial())
  })
})

void describe('keptRuns', () => {
  void it('keeps the runs of the polygons that stay, in their order', () => {
    // three polygons of two vertices each: the middle one goes, and the two around it are one run each
    assert.deepEqual(keptRuns([2, 2, 2], [true, false, true]), [
      { from: 0, count: 2 },
      { from: 4, count: 2 },
    ])
  })

  void it('joins the polygons next to each other into one run', () => {
    assert.deepEqual(keptRuns([6, 3, 6], [true, true, false]), [{ from: 0, count: 9 }])
  })

  void it('gives no run when nothing is kept', () => {
    assert.deepEqual(keptRuns([3, 3], [false, false]), [])
  })

  void it('keeps the last polygon of the buffer', () => {
    assert.deepEqual(keptRuns([3, 6], [false, true]), [{ from: 3, count: 6 }])
  })
})

void describe('copyVertexSegments', () => {
  void it('copies the slices into one buffer, in the order of the segments', () => {
    const first = new Float32Array([1, 1, 1, 2, 2, 2, 3, 3, 3])
    const second = new Float32Array([4, 4, 4, 5, 5, 5])

    const kept = copyVertexSegments(
      [
        { source: first, from: 2, count: 1 },
        { source: second, from: 0, count: 2 },
      ],
      3,
    )

    assert.deepEqual([...kept], [3, 3, 3, 4, 4, 4, 5, 5, 5])
  })

  void it('takes the item size of the buffer, like the two numbers of a uv', () => {
    const source = new Float32Array([1, 1, 2, 2, 3, 3])

    const kept = copyVertexSegments([{ source, from: 1, count: 2 }], 2)

    assert.deepEqual([...kept], [2, 2, 3, 3])
  })

  void it('gives an empty buffer when there is no slice', () => {
    const kept = copyVertexSegments([], 3)

    assert.equal(kept.length, 0)
  })
})

void describe('accelerateRaycast', () => {
  void it('builds the BVH of the geometry and swaps the raycast of the mesh', () => {
    const mesh = new Mesh(new PlaneGeometry(2, 2), new MeshLambertMaterial())

    accelerateRaycast(mesh)

    assert.notEqual(mesh.geometry.boundsTree, undefined)
    assert.notEqual(mesh.raycast, Mesh.prototype.raycast)
  })

  void it('still finds the geometry with a ray', () => {
    const mesh = new Mesh(new PlaneGeometry(2, 2), new MeshLambertMaterial())
    accelerateRaycast(mesh)

    const camera = new PerspectiveCamera(75, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const raycaster = new Raycaster()
    // off the centre: the centre of the plane is the edge the two triangles share, and the ray would hit both
    raycaster.setFromCamera(new Vector2(0.1, 0.05), camera)

    assert.equal(raycaster.intersectObjects([mesh], false).length, 1)
  })
})

void describe('arxPolygonsToWireframeGeometry', () => {
  void it('gives the perimeter of a triangle, without the diagonal', () => {
    const geometry = arxPolygonsToWireframeGeometry([polygon(false)], new Vector3(0, 0, 0))
    const positions = geometry.getAttribute('position')

    // three edges, each with two points
    assert.equal(positions.count, 6)
  })

  void it('gives the perimeter of a quad, without the diagonal', () => {
    const geometry = arxPolygonsToWireframeGeometry([polygon(true)], new Vector3(0, 0, 0))
    const positions = geometry.getAttribute('position')

    // four edges instead of the two triangles' six: the perimeter is 0-1-3-2
    assert.equal(positions.count, 8)
  })

  void it('shifts the points by the scene position, like the mesh', () => {
    const geometry = arxPolygonsToWireframeGeometry([polygon(false)], new Vector3(10, 20, 30))
    const first = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), 0)

    // the polygon's first vertex is (0, 0, 0) in the game, which the mesh mirrors and shifts
    assert.deepEqual([first.x, first.y, first.z], [-10, -20, -30])
  })

  void it('gives an empty geometry for no polygon', () => {
    const geometry = arxPolygonsToWireframeGeometry([], new Vector3(0, 0, 0))

    assert.equal(geometry.getAttribute('position').count, 0)
  })
})

void describe('createWireframeMaterial', () => {
  void it('gives a line material, a new one every time', () => {
    const first = createWireframeMaterial()
    const second = createWireframeMaterial()

    // the views dispose their own material with the wrapper, so they can not share one
    assert.notEqual(first, second)
    assert.equal(first.type, 'LineBasicMaterial')
  })
})
