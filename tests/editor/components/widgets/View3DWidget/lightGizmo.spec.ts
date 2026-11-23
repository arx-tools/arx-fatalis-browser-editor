import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Vector3 } from 'three'
import {
  gamePositionOf,
  movedGamePositionOf,
  scaledRadiiOf,
  scaleFactorOf,
  worldPositionOf,
} from '../../../../../src/editor/components/widgets/View3DWidget/lightGizmo.ts'

void describe('worldPositionOf', () => {
  void it('mirrors the two first axes of the game, the way the mesh does', () => {
    const world = worldPositionOf({ x: 10, y: -20, z: 30 })

    assert.equal(world.x, -10)
    assert.equal(world.y, 20)
    assert.equal(world.z, 30)
  })

  void it('gives a vector of its own, so a moved light does not write the level', () => {
    const world = worldPositionOf({ x: 1, y: 2, z: 3 })

    world.x = 100

    assert.equal(world.x, 100)
  })
})

void describe('gamePositionOf', () => {
  void it('takes a point of the world back to the game', () => {
    const game = gamePositionOf(new Vector3(-10, 20, 30))

    assert.deepEqual(game, { x: 10, y: -20, z: 30 })
  })

  void it('is the inverse of the world route', () => {
    const game = { x: 420.5, y: -310.25, z: 550.75 }

    assert.deepEqual(gamePositionOf(worldPositionOf(game)), game)
  })
})

void describe('scaleFactorOf', () => {
  void it('is one for a drag that did not move', () => {
    assert.equal(scaleFactorOf(new Vector3(1, 1, 1)), 1)
  })

  void it('reads the factor of the axis that moved the most', () => {
    assert.equal(scaleFactorOf(new Vector3(1.2, 3, 1)), 3)
  })

  void it('reads the factor of a single handle', () => {
    assert.equal(scaleFactorOf(new Vector3(1, 1, 0.5)), 0.5)
  })

  void it('reads the uniform factor of the middle handle', () => {
    assert.equal(scaleFactorOf(new Vector3(2, 2, 2)), 2)
  })
})

void describe('scaledRadiiOf', () => {
  void it('grows the two radii together', () => {
    assert.deepEqual(scaledRadiiOf(100, 900, 2), { fallEnd: 1800, fallStart: 200 })
  })

  void it('shrinks the two radii together', () => {
    assert.deepEqual(scaledRadiiOf(100, 900, 0.5), { fallEnd: 450, fallStart: 50 })
  })

  void it('keeps the smallest factor the level takes', () => {
    // a light does not turn inside out: five percent of the radii is the floor of a scale
    assert.deepEqual(scaledRadiiOf(100, 900, 0.001), { fallEnd: 45, fallStart: 5 })
  })
})

void describe('movedGamePositionOf', () => {
  void it('moves the game the way the offset of the world points', () => {
    // a drag of +X on the screen is the game's -X: the two first axes are the mirrored ones
    assert.deepEqual(movedGamePositionOf({ x: 0, y: -400, z: 0 }, { x: 10, y: 20, z: 30 }), {
      x: -10,
      y: -420,
      z: 30,
    })
  })

  void it('keeps the place on an offset of nothing', () => {
    const place = { x: 1, y: 2, z: 3 }

    assert.deepEqual(movedGamePositionOf(place, { x: 0, y: 0, z: 0 }), place)
  })

  void it('adds the offsets of a drag up', () => {
    const first = movedGamePositionOf({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })
    const second = movedGamePositionOf(first, { x: 5, y: 0, z: 0 })

    assert.deepEqual(second, movedGamePositionOf({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }))
  })
})
