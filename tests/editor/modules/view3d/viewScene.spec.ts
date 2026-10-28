import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BoxGeometry, Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three'
import { type ViewScene, disposeViewScene, resizeViewScene } from '../../../../src/editor/modules/view3d/viewScene.ts'

/**
 * Builds a view whose renderer only records the calls.
 *
 * @returns The view, its camera and the sizes its renderer was asked to take.
 */
function buildView(): {
  view: ViewScene
  sizes: Array<{ width: number; height: number }>
  disposed: { count: number }
} {
  const sizes: Array<{ width: number; height: number }> = []
  const disposed = { count: 0 }
  const renderer = {
    setSize: (width: number, height: number): void => {
      sizes.push({ width, height })
    },
    dispose: (): void => {
      disposed.count = disposed.count + 1
    },
  }

  const view: ViewScene = {
    renderer: renderer as unknown as WebGLRenderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(75, 1, 0.1, 10_000),
  }

  return { view, sizes, disposed }
}

void describe('resizeViewScene', () => {
  void it('sizes the renderer to the widget', () => {
    const { view, sizes } = buildView()

    resizeViewScene(view, 800, 400)

    assert.deepEqual(sizes, [{ width: 800, height: 400 }])
  })

  void it('fits the camera to the aspect ratio', () => {
    const { view } = buildView()

    resizeViewScene(view, 800, 400)

    assert.equal(view.camera.aspect, 2)
  })
})

void describe('disposeViewScene', () => {
  void it('disposes the renderer', () => {
    const { view, disposed } = buildView()

    disposeViewScene(view)

    assert.equal(disposed.count, 1)
  })

  void it('leaves the geometry and the material of the level alone', () => {
    const { view } = buildView()
    const geometry = new BoxGeometry()
    let disposedGeometries = 0

    geometry.addEventListener('dispose', () => {
      disposedGeometries = disposedGeometries + 1
    })

    view.scene.add(new Mesh(geometry, new MeshLambertMaterial()))

    disposeViewScene(view)

    // every 3D widget shows the same meshes, so a closed widget must not free them
    assert.equal(disposedGeometries, 0)
  })
})
