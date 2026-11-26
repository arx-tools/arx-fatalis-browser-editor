import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags } from 'arx-convert/types'
import { Vector3 } from 'three'
import { DEFAULT_OBJ_SCALE, polygonsOfObj } from '../../../../../src/editor/modules/level/import/objPolygons.ts'

/**
 * A square of the test, facing up in the space of the file, with its uvs and its normal.
 *
 * @remarks
 * The corners go around the square the way an OBJ writes them: a loop. The importer keeps the quad (it does not split it
 * into triangles) and orders the corners the way the FTS keeps them.
 */
const SQUARE = `# a square of the test
v -1 0 -1
v 1 0 -1
v 1 0 1
v -1 0 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 1 0
f 1/1/1 2/2/1 3/3/1 4/4/1
`

/**
 * The options of the tests: the mesh goes to the origin, with no turn, and the scale is one to one.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The options of the import.
 */
function optionsOf(overrides: Partial<Parameters<typeof polygonsOfObj>[1]> = {}): Parameters<typeof polygonsOfObj>[1] {
  return {
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
    origin: { x: 0, y: 0, z: 0 },
    textureContainerId: 7,
    room: 3,
    ...overrides,
  }
}

/**
 * The places of the corners of a polygon of the test, as flat numbers.
 *
 * @param polygon The polygon to read.
 *
 * @returns The three coordinates of every corner, in the order of the FTS.
 */
function placesOf(polygon: ReturnType<typeof polygonsOfObj>[number]): number[] {
  return polygon.vertices.flatMap((vertex) => {
    return [vertex.x, vertex.y, vertex.z]
  })
}

void describe('the polygons of an OBJ file', () => {
  void it('keeps a quad a quad, and orders its corners the way the FTS reads them', () => {
    const polygons = polygonsOfObj(SQUARE, optionsOf())

    assert.equal(polygons.length, 1)

    const [polygon] = polygons

    // the loop a, b, c, d of the file becomes a, b, d, c of the FTS: `a` and `b` are the ends of one edge, `d` and `c`
    // of the opposite one (the blank level and the two triangles of the mesh read the quad this way)
    assert.deepEqual(placesOf(polygon), [-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1])
    assert.equal(polygon.flags, ArxPolygonFlags.DoubleSided | ArxPolygonFlags.Quad)
    assert.equal(polygon.textureContainerId, 7)
    assert.equal(polygon.room, 3)
    assert.equal(polygon.transval, 0)
  })

  void it('takes the light of the corners from the file, with the Y of the game', () => {
    const [polygon] = polygonsOfObj(SQUARE, optionsOf())

    // the file is Y-up and the game's Y points down: the normal of a floor of the file is the up of the game
    assert.deepEqual(polygon?.norm, { x: 0, y: -1, z: 0 })
    assert.deepEqual(polygon?.norm2, { x: 0, y: -1, z: 0 })
    assert.deepEqual(polygon?.normals, [
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -1, z: 0 },
    ])
  })

  void it('keeps the uv of every corner, in the order of the FTS', () => {
    const [polygon] = polygonsOfObj(SQUARE, optionsOf())

    assert.deepEqual(
      polygon?.vertices.map((vertex) => {
        return [vertex.u, vertex.v]
      }),
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    )
  })

  void it('measures the area of the shape, and the scale carries it', () => {
    const [small] = polygonsOfObj(SQUARE, optionsOf())
    const [big] = polygonsOfObj(SQUARE, optionsOf({ scale: 2 }))

    assert.equal(small?.area, 4)
    assert.equal(big?.area, 16)
  })

  void it('cuts a face of five corners into a quad and a triangle', () => {
    const pentagon = `v -1 0 -1
v 1 0 -1
v 1 0 1
v 0 0 2
v -1 0 1
f 1 2 3 4 5
`
    const polygons = polygonsOfObj(pentagon, optionsOf())

    assert.equal(polygons.length, 2)
    assert.equal(polygons[0]?.flags, ArxPolygonFlags.DoubleSided | ArxPolygonFlags.Quad)
    assert.equal(polygons[1]?.flags, ArxPolygonFlags.DoubleSided)
    // the triangle is the rest of the face, from the first corner: the corners 1, 4 and 5 of the file
    assert.deepEqual(placesOf(polygons[1]), [-1, 0, -1, -1, 0, 1, 0, 0, 2, -1, 0, -1])
  })

  void it('reads a triangle, with its fourth corner the first one again', () => {
    const triangle = `v 0 0 0
v 1 0 0
v 0 0 1
f 1 2 3
`
    const [polygon] = polygonsOfObj(triangle, optionsOf())

    assert.equal(polygon.flags, ArxPolygonFlags.DoubleSided)
    assert.equal(polygon.vertices.length, 4)
    assert.deepEqual(placesOf(polygon).slice(9), [0, 0, 0])
  })

  void it('reads the indices of the file that count backwards', () => {
    const backwards = `v -1 0 -1
v 1 0 -1
v 1 0 1
v -1 0 1
f -4 -3 -2 -1
`
    const [polygon] = polygonsOfObj(backwards, optionsOf())

    assert.deepEqual(placesOf(polygon), [-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, 1])
  })

  void it('makes the normal of a face the file gives none for', () => {
    const unlit = `v 0 0 0
v 1 0 0
v 0 0 1
f 1 2 3
`
    const [polygon] = polygonsOfObj(unlit, optionsOf())

    // the corners of the file are counter clockwise seen from the Y of the file, so the face of the file looks up: the
    // mirror of the conversion turns that into the up of the game
    assert.deepEqual(polygon?.norm, { x: 0, y: 1, z: 0 })
  })

  void it('keeps the front of the polygon on the side its normal points at', () => {
    // a face of the file that looks at the camera: the mirror of the Y turns its loop around, and the import turns it
    // back, so the game and the room map see the outside of the mesh and not its inside
    const face = `v -0.5 -0.5 0.5
v 0.5 -0.5 0.5
v 0.5 0.5 0.5
v -0.5 0.5 0.5
vn 0 0 1
f 1 2 3 4
`
    const [polygon] = polygonsOfObj(face, optionsOf())
    const [a, b, c] = polygon.vertices.map((vertex) => {
      return new Vector3(vertex.x, vertex.y, vertex.z)
    }) as [Vector3, Vector3, Vector3]
    const shape = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize()
    const alignment = shape.dot(new Vector3(polygon.norm.x, polygon.norm.y, polygon.norm.z))

    assert.equal(polygon.norm.z, 1)
    assert.ok(alignment > 0.99)
  })

  void it('turns and scales the mesh around the origin of the level', () => {
    const [polygon] = polygonsOfObj(
      SQUARE,
      optionsOf({ scale: 2, rotation: { x: 0, y: 90, z: 0 }, origin: { x: 10, y: 20, z: 30 } }),
    )

    // the first corner of the file is (-1, 0, -1): twice that is (-2, 0, -2), a quarter turn around the Y is (-2, 0, 2),
    // and the origin of the level moves it to (8, 20, 32)
    assert.deepEqual(placesOf(polygon).slice(0, 3), [8, 20, 32])
  })

  void it('drops the lines the mesh does not need, and the faces of a place the file has no corner for', () => {
    const messy = `mtllib tree.mtl
o Line01
g mesh
s off
usemtl wood
l 1 2
v 0 0 0
v 1 0 0
v 0 0 1
f 1 2 3
f 1 2 9
`
    const polygons = polygonsOfObj(messy, optionsOf())

    assert.equal(polygons.length, 1)
  })

  void it('gives no polygon for a file without a face', () => {
    assert.deepEqual(polygonsOfObj('v 0 0 0\n', optionsOf()), [])
  })

  void it('starts a unit of the file on one unit of the level', () => {
    assert.equal(DEFAULT_OBJ_SCALE, 1)
  })
})
