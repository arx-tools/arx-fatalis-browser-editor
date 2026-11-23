import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { Color, Group, LineBasicMaterial, LineSegments, type BufferGeometry, type Object3D } from 'three'
import type { ArxLight } from 'arx-convert/types'
import {
  fallEndSphereVisible,
  fallStartSphereVisible,
} from '../../../../../src/editor/modules/level/edit/lightSpheres.ts'
import {
  createLightRadiusSpheres,
  ringsOf,
} from '../../../../../src/editor/components/widgets/shared/lightRadiusSpheres.ts'

/**
 * Fills every field of an LLF light, so a test changes only what it needs.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The LLF light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 10, y: 20, z: 30 },
    color: { r: 255, g: 128, b: 0, a: 1 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 1,
    exSize: 0.1,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
    ...overrides,
  }
}

/**
 * Reads the two sphere groups of the overlay.
 *
 * @param overlay The overlay of the test.
 *
 * @returns The fall start and the fall end sphere.
 */
function spheresOf(overlay: ReturnType<typeof createLightRadiusSpheres>): {
  readonly start: Object3D
  readonly end: Object3D
} {
  const [start, end] = overlay.group.children

  assert.ok(start instanceof Group)
  assert.ok(end instanceof Group)

  return { start, end }
}

/**
 * Reads the material of the first great circle of a sphere.
 *
 * @param sphere The group of the sphere.
 *
 * @returns The line material of the sphere.
 */
function materialOf(sphere: Object3D): LineBasicMaterial {
  const [circle] = sphere.children

  assert.ok(circle instanceof LineSegments)
  assert.ok(circle.material instanceof LineBasicMaterial)

  return circle.material
}

/**
 * Reads the count of the vertices of the lines of a sphere.
 *
 * @param sphere The group of the sphere.
 *
 * @returns The count of the points the line segments draw.
 */
function verticesOf(sphere: Object3D): number {
  const [lines] = sphere.children

  assert.ok(lines instanceof LineSegments)

  const geometry = lines.geometry as BufferGeometry

  return geometry.getAttribute('position').count
}

beforeEach(() => {
  fallStartSphereVisible.value = false
  fallEndSphereVisible.value = false
})

void describe('ringsOf', () => {
  void it('takes a ring for every 10 units of the radius, and at least 7', () => {
    assert.equal(ringsOf(25), 7)
    assert.equal(ringsOf(100), 10)
    assert.equal(ringsOf(987), 98)
  })
})

void describe('the debug spheres of the falloff', () => {
  void it('keeps both spheres off while the switches are off', () => {
    const overlay = createLightRadiusSpheres()

    overlay.update(light())

    const { start, end } = spheresOf(overlay)

    assert.equal(start.visible, false)
    assert.equal(end.visible, false)

    overlay.dispose()
  })

  void it('draws the fall start in green and the fall end in red, at the place and the size of the light', () => {
    fallStartSphereVisible.value = true
    fallEndSphereVisible.value = true

    const overlay = createLightRadiusSpheres()

    overlay.update(light())

    const { start, end } = spheresOf(overlay)

    assert.equal(start.visible, true)
    assert.equal(end.visible, true)
    assert.equal(start.scale.x, 100)
    assert.equal(end.scale.x, 200)
    assert.deepEqual(start.position.toArray(), [-10, -20, 30])
    assert.deepEqual(end.position.toArray(), [-10, -20, 30])
    assert.ok(materialOf(start).color.equals(new Color(0, 1, 0)))
    assert.ok(materialOf(end).color.equals(new Color(1, 0, 0)))
    // the game draws the latitudes of the sphere: rings - 2 rings, 64 sections, two points a segment
    assert.equal(verticesOf(start), (ringsOf(100) - 2) * 64 * 2)
    assert.equal(verticesOf(end), (ringsOf(200) - 2) * 64 * 2)

    overlay.dispose()
  })

  void it('takes a sphere off the frame with its own switch', () => {
    fallEndSphereVisible.value = true

    const overlay = createLightRadiusSpheres()

    overlay.update(light())

    const { start, end } = spheresOf(overlay)

    assert.equal(start.visible, false)
    assert.equal(end.visible, true)

    overlay.dispose()
  })

  void it('leaves a sphere of a radius of zero off', () => {
    fallStartSphereVisible.value = true
    fallEndSphereVisible.value = true

    const overlay = createLightRadiusSpheres()

    overlay.update(light({ fallStart: 0 }))

    const { start, end } = spheresOf(overlay)

    assert.equal(start.visible, false)
    assert.equal(end.visible, true)

    overlay.dispose()
  })

  void it('takes both spheres off the frame when the editor edits no light', () => {
    fallStartSphereVisible.value = true
    fallEndSphereVisible.value = true

    const overlay = createLightRadiusSpheres()

    overlay.update(light())
    overlay.update(undefined)

    const { start, end } = spheresOf(overlay)

    assert.equal(start.visible, false)
    assert.equal(end.visible, false)

    overlay.dispose()
  })
})
