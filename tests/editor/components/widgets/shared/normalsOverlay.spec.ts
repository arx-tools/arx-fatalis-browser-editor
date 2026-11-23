import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { Scene, Vector3, type BufferGeometry, type Group, type LineBasicMaterial, type LineSegments } from 'three'
import {
  attachNormals,
  faceNormalLines,
  faceNormalsVisible,
  NORMAL_LENGTH_FACTOR,
  normalsLayers,
  vertexNormalLines,
  vertexNormalsVisible,
} from '../../../../../src/editor/components/widgets/shared/normalsOverlay.ts'

/**
 * A layer of an overlay, as a test reads it.
 */
type Layer = LineSegments<BufferGeometry, LineBasicMaterial>

/**
 * Builds a face the way the level holds one: four vertex slots, a face normal and the corner normals of a curved face.
 *
 * @param vertices The corners of the face, in the game's coordinates; three of them is a triangle.
 * @param normal The normal of the face.
 * @param cornerNormals The normal of every corner, when the face is curved; the face normal on every corner otherwise.
 *
 * @returns The face.
 */
function polygonOf(
  vertices: ReadonlyArray<readonly [number, number, number]>,
  normal: readonly [number, number, number],
  cornerNormals?: ReadonlyArray<readonly [number, number, number]>,
): ArxPolygon {
  const slots = [0, 1, 2, 3].map((index) => {
    const [x, y, z] = vertices[Math.min(index, vertices.length - 1)] ?? [0, 0, 0]

    return { x, y, z, u: 0, v: 0 }
  })
  const normalsOfCorners = [0, 1, 2, 3].map((index) => {
    const source = cornerNormals?.[Math.min(index, (cornerNormals?.length ?? 1) - 1)]

    if (source === undefined) {
      return { x: normal[0], y: normal[1], z: normal[2] }
    }

    return { x: source[0], y: source[1], z: source[2] }
  })
  let flags: ArxPolygonFlags = ArxPolygonFlags.None
  let normals: ArxPolygon['normals']

  if (vertices.length === 4) {
    flags = ArxPolygonFlags.Quad
  }

  if (cornerNormals !== undefined) {
    normals = [normalsOfCorners[0], normalsOfCorners[1], normalsOfCorners[2], normalsOfCorners[3]]
  }

  return {
    vertices: [slots[0], slots[1], slots[2], slots[3]],
    textureContainerId: 0,
    norm: { x: normal[0], y: normal[1], z: normal[2] },
    norm2: { x: normal[0], y: normal[1], z: normal[2] },
    normals,
    transval: 0,
    area: 1,
    flags,
    room: 0,
  }
}

/**
 * Mirrors a game point into the space of the mesh, the way the builder does.
 *
 * @param point The point in the game's coordinates.
 *
 * @returns The point in the space of the mesh.
 */
function mirrored(point: readonly [number, number, number]): readonly [number, number, number] {
  return [-point[0], -point[1], point[2]]
}

/**
 * The lines of a buffer of points.
 *
 * @param positions The points the builder wrote.
 *
 * @returns One pair of points per line.
 */
function linesOf(positions: Float32Array): Array<readonly [number[], number[]]> {
  const lines: Array<readonly [number[], number[]]> = []

  for (let at = 0; at < positions.length; at = at + 6) {
    lines.push([[...positions.subarray(at, at + 3)], [...positions.subarray(at + 3, at + 6)]])
  }

  return lines
}

/**
 * The points of a buffer that are not the expected ones, within a tolerance.
 *
 * @remarks
 * The builders write a `Float32Array` and the tests count in `number`, and the two disagree in the last digits: a point
 * is compared with a tolerance, and the differences are collected so a test asserts them once (a loop holds no
 * assertion of its own).
 *
 * @param actual The points the builder wrote.
 * @param expected The points the test counts.
 * @param tolerance The largest difference that still counts as the same point.
 *
 * @returns One line per point that is off.
 */
function differencesOf(actual: ArrayLike<number>, expected: readonly number[], tolerance = 1e-6): string[] {
  const differences: string[] = []

  for (const [index, value] of expected.entries()) {
    const written = actual[index] ?? Number.NaN

    if (Math.abs(written - value) > tolerance) {
      differences.push(`${String(index)}: ${String(written)} instead of ${String(value)}`)
    }
  }

  return differences
}

/**
 * A floor of four corners in the XZ plane of the game, ten units wide: its normal points up.
 *
 * @returns The face.
 */
function floor(): ArxPolygon {
  return polygonOf(
    [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ],
    [0, -1, 0],
  )
}

/**
 * A triangle of no normal: a face the builders have to leave out.
 *
 * @returns The face.
 */
function flatTriangle(): ArxPolygon {
  return polygonOf(
    [
      [0, 0, 0],
      [10, 0, 0],
      [0, 0, 10],
    ],
    [0, -1, 0],
  )
}

/**
 * Reads the layers of an overlay from the scene.
 *
 * @param scene The scene the overlay was put into.
 *
 * @returns The group of the overlay and its two layers.
 *
 * @throws `Error` when the overlay did not build its layers.
 */
function layersOf(scene: Scene): { group: Group; face: Layer; vertex: Layer } {
  const [group] = scene.children as Group[]
  const [face, vertex] = (group?.children ?? []) as Layer[]

  if (group === undefined || face === undefined || vertex === undefined) {
    throw new Error('the overlay did not build its layers')
  }

  return { group, face, vertex }
}

void describe('faceNormalLines', () => {
  void it('starts the line in the middle of the face and goes along its normal', () => {
    const [line] = linesOf(faceNormalLines([floor()], new Vector3()))

    assert.notStrictEqual(line, undefined)

    const [start, end] = line
    const radius = Math.hypot(5, 5)
    const length = radius * NORMAL_LENGTH_FACTOR

    // the middle of the four corners, mirrored the way the mesh mirrors it, and the line going up (the game's Y down)
    assert.deepStrictEqual(differencesOf(start, [...mirrored([5, 0, 5])]), [])
    assert.deepStrictEqual(differencesOf(end, [-5, length, 5]), [])
  })

  void it('shifts the line by the scene position of the level', () => {
    const [line] = linesOf(faceNormalLines([floor()], new Vector3(100, 200, 300)))

    assert.notStrictEqual(line, undefined)
    // the middle of the face is (-5, 0, 5) in the space of the mesh, and the scene position takes the offset off it
    assert.deepStrictEqual(differencesOf(line[0], [-105, -200, -295]), [])
  })

  void it('draws one line per face and leaves a face without a normal out', () => {
    const noNormal = polygonOf(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
      ],
      [0, 0, 0],
    )
    const lines = faceNormalLines([floor(), noNormal], new Vector3())

    // a zero normal has no direction, so the second face has no line
    assert.equal(lines.length, 6)
  })

  void it('leaves a face of no size out', () => {
    const point: readonly [number, number, number] = [4, 0, 4]
    const lines = faceNormalLines([polygonOf([point, point, point], [0, -1, 0])], new Vector3())

    assert.equal(lines.length, 0)
  })
})

void describe('vertexNormalLines', () => {
  void it('draws a line on every corner of the face along the normal of the corner', () => {
    // four corners of a quad, each line from its own corner, along the face normal and as long as the face normal
    const radius = Math.hypot(5, 5)
    const length = radius * NORMAL_LENGTH_FACTOR
    const starts = floor().vertices.map((vertex) => {
      return [...mirrored([vertex.x, vertex.y, vertex.z])]
    })
    const ends = starts.map((corner) => {
      return [corner[0] ?? 0, (corner[1] ?? 0) + length, corner[2] ?? 0]
    })
    const written: number[] = []
    const expected: number[] = []

    for (const [start, end] of linesOf(vertexNormalLines([floor()], new Vector3()))) {
      written.push(...start, ...end)
    }

    for (const [index, corner] of starts.entries()) {
      expected.push(...corner, ...(ends[index] ?? []))
    }

    assert.deepStrictEqual(differencesOf(written, expected), [])
  })

  void it('takes the normals of a curved face', () => {
    const curved = polygonOf(
      [
        [0, 0, 0],
        [10, 0, 0],
        [10, 0, 10],
        [0, 0, 10],
      ],
      [0, -1, 0],
      [
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 1],
        [0, 1, 0],
      ],
    )

    const lines = linesOf(vertexNormalLines([curved], new Vector3()))
    const second = lines[1]

    assert.equal(lines.length, 4)
    assert.notStrictEqual(second, undefined)
    // the second corner points along the X axis of the game, which the mirror turns into -X
    assert.ok((second[1][0] ?? 0) < (second[0][0] ?? 0))
  })

  void it('draws three lines on a triangle, not four', () => {
    assert.equal(vertexNormalLines([flatTriangle()], new Vector3()).length, 18)
  })

  void it('leaves the corners of no normal out', () => {
    const noNormal = polygonOf(
      [
        [0, 0, 0],
        [10, 0, 0],
        [0, 0, 10],
      ],
      [0, 0, 0],
    )

    assert.equal(vertexNormalLines([noNormal], new Vector3()).length, 0)
  })
})

void describe('the layers of the normals', () => {
  void it('starts with the face normals alone', () => {
    assert.equal(faceNormalsVisible.value, true)
    assert.equal(vertexNormalsVisible.value, false)
    assert.deepStrictEqual(normalsLayers.value, { face: true, vertex: false })
  })

  void it('combines the two switches freely, including the two off', () => {
    vertexNormalsVisible.value = true

    assert.deepStrictEqual(normalsLayers.value, { face: true, vertex: true })

    faceNormalsVisible.value = false

    assert.deepStrictEqual(normalsLayers.value, { face: false, vertex: true })

    vertexNormalsVisible.value = false

    // nothing is drawn, and the switch of the normals is not bothered by it
    assert.deepStrictEqual(normalsLayers.value, { face: false, vertex: false })
  })

  void it('has a storage key of its own for both switches', () => {
    assert.equal(faceNormalsVisible.key, 'faceNormalsVisible')
    assert.equal(vertexNormalsVisible.key, 'vertexNormalsVisible')
  })
})

void describe('attachNormals', () => {
  void it('puts the group into the scene hidden, with the face layer ready', () => {
    const scene = new Scene()

    attachNormals(scene)

    const { group, face, vertex } = layersOf(scene)

    assert.equal(group.visible, false)
    assert.equal(group.children.length, 2)
    assert.equal(face.visible, true)
    assert.equal(vertex.visible, false)
  })

  void it('draws over the wireframe and still writes depth', () => {
    const scene = new Scene()

    attachNormals(scene)

    const { face, vertex } = layersOf(scene)

    assert.equal(face.renderOrder, 7)
    assert.equal(vertex.renderOrder, 8)
    assert.equal(face.material.depthTest, true)
    assert.equal(face.material.depthWrite, true)
  })

  void it('gives the two layers their own color', () => {
    const scene = new Scene()

    attachNormals(scene)

    const { face, vertex } = layersOf(scene)

    assert.equal(face.material.color.getHex(), 0xff_a5_00)
    assert.equal(vertex.material.color.getHex(), 0x22_d3_ee)
  })

  void it('builds the lines when it is shown, and only the layers it asks for', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())
    normals.setVisible(true)

    const { face, vertex } = layersOf(scene)

    assert.equal(face.geometry.getAttribute('position').count, 2)
    // the vertex layer is not built while only the face one is on
    assert.equal(vertex.geometry.getAttribute('position').count, 0)
  })

  void it('builds a layer when its switch asks for it', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())
    normals.setVisible(true)
    normals.setLayers({ face: true, vertex: true })

    const { face, vertex } = layersOf(scene)

    assert.equal(face.visible, true)
    assert.equal(vertex.visible, true)
    assert.equal(vertex.geometry.getAttribute('position').count, 8)
  })

  void it('keeps the layer it built when its switch goes off, and leaves it off the screen', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())
    normals.setVisible(true)
    normals.setLayers({ face: false, vertex: true })

    const { face, vertex } = layersOf(scene)

    assert.equal(face.visible, false)
    assert.equal(vertex.visible, true)
    // the face layer was built first, and it keeps its points: a switch is a visibility, not a source
    assert.equal(face.geometry.getAttribute('position').count, 2)
  })

  void it('draws nothing with the two switches off, and builds again when one comes back', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())
    normals.setVisible(true)
    normals.setLayers({ face: false, vertex: false })

    const { face, vertex } = layersOf(scene)

    assert.equal(face.visible, false)
    assert.equal(vertex.visible, false)

    normals.setLayers({ face: true, vertex: false })

    assert.equal(face.visible, true)
  })

  void it('builds the lines again when the polygons change', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())
    normals.setVisible(true)
    normals.setPolygons([floor(), floor()], new Vector3())

    const { face } = layersOf(scene)

    assert.equal(face.geometry.getAttribute('position').count, 4)
  })

  void it('waits with the build while it is hidden, and builds when it is shown', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)

    normals.setPolygons([floor()], new Vector3())

    const { face } = layersOf(scene)

    assert.equal(face.geometry.getAttribute('position').count, 0)

    normals.setVisible(true)

    assert.equal(face.geometry.getAttribute('position').count, 2)
  })

  void it('frees its geometries and materials, and leaves the scene', () => {
    const scene = new Scene()
    const normals = attachNormals(scene)
    const { face, vertex } = layersOf(scene)
    let disposed = 0

    face.geometry.addEventListener('dispose', () => {
      disposed = disposed + 1
    })
    face.material.addEventListener('dispose', () => {
      disposed = disposed + 1
    })
    vertex.geometry.addEventListener('dispose', () => {
      disposed = disposed + 1
    })
    vertex.material.addEventListener('dispose', () => {
      disposed = disposed + 1
    })

    normals.dispose()

    // two geometries and two materials
    assert.equal(disposed, 4)
    assert.equal(scene.children.length, 0)
  })
})
