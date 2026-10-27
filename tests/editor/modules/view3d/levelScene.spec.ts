import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3 } from 'three'
import { addPreviewLights, fitCameraToCanvas, frameLevel } from '../../../../src/editor/modules/view3d/levelScene.ts'

void describe('addPreviewLights', () => {
  void it('adds an ambient and a directional light', () => {
    const scene = new Scene()
    addPreviewLights(scene)

    assert.equal(
      scene.children.some((child) => {
        return child instanceof AmbientLight
      }),
      true,
    )
    assert.equal(
      scene.children.some((child) => {
        return child instanceof DirectionalLight
      }),
      true,
    )
  })
})

void describe('frameLevel', () => {
  void it('puts the camera outside the box and aims it at the centre', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
    const box = new Box3(new Vector3(-100, -50, -100), new Vector3(100, 50, 100))

    frameLevel(camera, box)

    const centre = box.getCenter(new Vector3())

    assert.ok(camera.position.distanceTo(centre) > 100)
    assert.ok(camera.near > 0)
    assert.ok(camera.far > camera.position.distanceTo(centre))
  })

  void it('keeps a working camera for a tiny level', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))

    frameLevel(camera, box)

    assert.ok(Number.isFinite(camera.position.x))
    assert.ok(camera.near > 0)
  })
})

void describe('fitCameraToCanvas', () => {
  void it('follows the aspect ratio of the canvas', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)

    fitCameraToCanvas(camera, 800, 400)

    assert.equal(camera.aspect, 2)
  })

  void it('avoids a division by zero for a hidden canvas', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)

    fitCameraToCanvas(camera, 800, 0)

    assert.equal(camera.aspect, 1)
  })
})
