import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three'
import { floorBelow } from '../../../../../src/editor/modules/level/entities/entityFloor.ts'

/**
 * How wide the test floor is, from its middle to its side.
 */
const HALF = 20

/**
 * The two triangles of a floor that faces up, in the space of the mesh.
 *
 * @param x The middle of the floor.
 * @param y The height of the floor.
 * @param z The middle of the floor.
 *
 * @returns The corners of the two triangles, as the flat list of a position attribute.
 */
function quadAt(x: number, y: number, z: number): number[] {
  // the winding of a face whose front looks up: the ray comes down on it
  return [
    x - HALF,
    y,
    z + HALF,
    x + HALF,
    y,
    z + HALF,
    x + HALF,
    y,
    z - HALF,
    x - HALF,
    y,
    z + HALF,
    x + HALF,
    y,
    z - HALF,
    x - HALF,
    y,
    z - HALF,
  ]
}

/**
 * A level of the test: the floors it holds, and nothing else.
 *
 * @param floors The floors, in the space of the mesh.
 *
 * @returns The solid mesh of the level, the one the drop casts its ray on.
 */
function meshOf(floors: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>): Mesh {
  const positions = floors.flatMap((floor) => {
    return quadAt(floor.x, floor.y, floor.z)
  })
  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  return new Mesh(geometry, new MeshBasicMaterial())
}

void describe('the floor under an entity', () => {
  void it('takes the highest surface under the place, not the lowest', () => {
    // the game's Y points down, so the place at -200 is high above both floors, and the one at world 0 is the nearer
    const mesh = meshOf([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -50, z: 0 },
    ])

    assert.equal(floorBelow(mesh, { x: 0, y: -200, z: 0 }), 0)
  })

  void it('finds the floor an entity already stands on', () => {
    // the ray starts a unit above the feet, so a surface the feet touch is not lost on the floating point numbers
    const mesh = meshOf([{ x: 0, y: 0, z: 0 }])

    assert.equal(floorBelow(mesh, { x: 0, y: 0, z: 0 }), 0)
  })

  void it('looks down only: a surface over the place is not a floor', () => {
    const mesh = meshOf([{ x: 0, y: 0, z: 0 }])

    // the place is under the floor (the game's Y points down): the floor is over it, and the ray goes away from it
    assert.equal(floorBelow(mesh, { x: 0, y: 100, z: 0 }), undefined)
  })

  void it('mirrors the x of the place the way the level mirrors the file', () => {
    // the floor is at the world x of a place whose x is 30, and the other way around for a place at -30
    const mesh = meshOf([{ x: -30, y: 0, z: 0 }])

    assert.equal(floorBelow(mesh, { x: 30, y: -100, z: 0 }), 0)
    assert.equal(floorBelow(mesh, { x: -30, y: -100, z: 0 }), undefined)
  })

  void it('keeps the z of the place as it is', () => {
    const mesh = meshOf([{ x: 0, y: 0, z: 30 }])

    assert.equal(floorBelow(mesh, { x: 0, y: -100, z: 30 }), 0)
    assert.equal(floorBelow(mesh, { x: 0, y: -100, z: -30 }), undefined)
  })

  void it('gives no floor when nothing is under the place', () => {
    assert.equal(floorBelow(meshOf([]), { x: 0, y: -100, z: 0 }), undefined)
  })
})
