import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPortal, ArxVector3 } from 'arx-convert/types'
import { type BufferGeometry, type LineBasicMaterial, type LineSegments, Scene, Vector3 } from 'three'
import { attachPortalLines } from '../../../../../src/editor/components/widgets/shared/portalOverlay.ts'

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
 * A portal of the test, over the four corners of a quad.
 *
 * @returns The portal, with its corners at the height of the XZ plane.
 */
function portal(): ArxPortal {
  return {
    polygon: {
      min: position(0, 0, 0),
      max: position(10, 0, 10),
      norm: position(0, 1, 0),
      norm2: position(0, 1, 0),
      center: position(5, 0, 5),
      vertices: [
        { position: position(0, 0, 0), rhw: 1 },
        { position: position(10, 0, 0), rhw: 1 },
        { position: position(0, 0, 10), rhw: 1 },
        { position: position(10, 0, 10), rhw: 1 },
      ],
    },
    room1: 1,
    room2: 2,
    usePortal: 0,
  }
}

void describe('attachPortalLines', () => {
  void it('puts nothing into the scene until it is shown', () => {
    const scene = new Scene()

    attachPortalLines(scene, [], new Vector3(0, 0, 0))

    assert.equal(scene.children.length, 0)
  })

  void it('puts the four edges of the portal into the geometry', () => {
    const scene = new Scene()
    const overlay = attachPortalLines(scene, [portal()], new Vector3(0, 0, 0))

    // four edges, each with two points
    assert.equal(overlay.lines.geometry.getAttribute('position').count, 8)
  })

  void it('shows and hides the lines', () => {
    const scene = new Scene()
    const overlay = attachPortalLines(scene, [portal()], new Vector3(0, 0, 0))

    overlay.setVisible(true)
    assert.equal(scene.children.length, 1)

    overlay.setVisible(true)
    assert.equal(scene.children.length, 1)

    overlay.setVisible(false)
    assert.equal(scene.children.length, 0)
  })

  void it('draws through the mesh, over the wireframe', () => {
    const scene = new Scene()
    const overlay = attachPortalLines(scene, [portal()], new Vector3(0, 0, 0))

    overlay.setVisible(true)

    const [lines] = scene.children as Array<LineSegments<BufferGeometry, LineBasicMaterial>>

    // a portal is a hole in a wall: the outline has to be visible through the wall, and over the lines of the faces
    assert.equal(lines.renderOrder, 6)
    assert.equal(lines.material.depthTest, false)
    assert.equal(lines.material.depthWrite, false)
  })

  void it('frees its geometry and material on dispose', () => {
    const scene = new Scene()
    const overlay = attachPortalLines(scene, [portal()], new Vector3(0, 0, 0))
    let disposed = 0

    overlay.setVisible(true)

    overlay.lines.geometry.addEventListener('dispose', () => {
      disposed = disposed + 1
    })
    overlay.lines.material.addEventListener('dispose', () => {
      disposed = disposed + 1
    })

    overlay.dispose()

    assert.equal(disposed, 2)
    assert.equal(scene.children.length, 0)
  })
})
