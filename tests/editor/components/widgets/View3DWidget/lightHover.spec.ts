import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { PerspectiveCamera, Scene, Texture } from 'three'
import type { ArxLight, ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { crosshairStore } from '../../../../../src/editor/modules/crosshair/crosshairStore.ts'
import { lightHoverStore } from '../../../../../src/editor/modules/selection/lightHoverStore.ts'
import { lightSelectionStore } from '../../../../../src/editor/modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../../../src/editor/modules/selection/selectionStore.ts'
import { isLightsVisible } from '../../../../../src/editor/components/widgets/shared/levelDisplay.ts'
import { lightingProfile } from '../../../../../src/editor/modules/level/edit/lightingProfile.ts'
import {
  createLightMarkers,
  type LightMarkerTextures,
} from '../../../../../src/editor/components/widgets/shared/lightMarkers.ts'
import { useSelectionDrag } from '../../../../../src/editor/components/widgets/View3DWidget/useSelectionDrag.ts'
import type { CameraControls } from '../../../../../src/editor/components/widgets/View3DWidget/cameraControls.ts'
import type { PolygonSelectionOverlay } from '../../../../../src/editor/components/widgets/View3DWidget/polygonSelection.ts'
import type { ViewScene } from '../../../../../src/editor/components/widgets/shared/viewScene.ts'

/**
 * Fills every field of an LLF light, so a test changes only what it needs.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The LLF light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 0, y: 0, z: 0 },
    color: { r: 255, g: 255, b: 255, a: 1 },
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
 * The camera of the test, looking down the z axis at the origin.
 *
 * @returns The camera, with its matrices ready for the pick.
 */
function cameraOf(): PerspectiveCamera {
  const camera = new PerspectiveCamera(75, 1, 0.1, 100)

  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  return camera
}

/**
 * Makes the textures of the markers without a canvas: the pick reads the sprite, not the picture.
 *
 * @returns A texture for every shape.
 */
function texturesOf(): LightMarkerTextures {
  return {
    star: new Texture(),
    bulb: new Texture(),
    flame: new Texture(),
    flameCrossed: new Texture(),
  }
}

beforeEach(() => {
  crosshairStore.set(undefined)
  lightHoverStore.set(undefined)
  selectionStore.clear()
  lightSelectionStore.clear()

  // the markers are the target of the pick only while the Lights switch shows them
  isLightsVisible.value = true
  // the profiles with a light of their own hide the markers of the static lights: the pick is about the others
  lightingProfile.value = 'Arx'
})

void describe('useSelectionDrag.pickUnderCrosshair', () => {
  void it('marks the light under the crosshair, and takes the face phantom away', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([light()], textures)
    const calls: Array<readonly ArxPolygon[]> = []

    markers.updateMatrixWorld(true)

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (polygons: readonly ArxPolygon[]): void => {
            calls.push(polygons)
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return undefined
      },
      roomColorOf: () => {
        return undefined
      },
    })

    crosshairStore.set(5)

    drag.pickUnderCrosshair()

    assert.equal(lightHoverStore.light.value, 0)
    assert.equal(crosshairStore.polygon.value, undefined)
    assert.deepEqual(calls, [[]])

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })

  void it('leaves the marker alone while the Lights switch is off', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([light()], textures)
    const calls: Array<readonly ArxPolygon[]> = []

    markers.updateMatrixWorld(true)
    isLightsVisible.value = false

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (polygons: readonly ArxPolygon[]): void => {
            calls.push(polygons)
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return undefined
      },
      roomColorOf: () => {
        return undefined
      },
    })

    drag.pickUnderCrosshair()

    assert.equal(lightHoverStore.light.value, undefined)
    assert.deepEqual(calls, [[]])

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })

  void it('takes the face selection away when a light is clicked without shift', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([light()], textures)

    markers.updateMatrixWorld(true)
    selectionStore.add(3)

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [], vertexToPolygons: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (): void => {
            // the light click writes the stores, not the outline
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return { isLocked: true } as unknown as CameraControls
      },
      roomColorOf: () => {
        return undefined
      },
    })

    drag.onMouseDown({ button: 0 } as MouseEvent)

    assert.equal(lightSelectionStore.lights.value.size, 1)
    assert.equal(selectionStore.polygons.value.size, 0)

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })

  void it('keeps the face selection when the light is clicked with shift', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([light()], textures)

    markers.updateMatrixWorld(true)
    selectionStore.add(3)

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [], vertexToPolygons: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (): void => {
            // the light click writes the stores, not the outline
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return { isLocked: true } as unknown as CameraControls
      },
      roomColorOf: () => {
        return undefined
      },
    })

    drag.onMouseDown({ button: 0, shiftKey: true } as MouseEvent)

    assert.equal(lightSelectionStore.lights.value.size, 1)
    assert.equal(selectionStore.polygons.value.size, 1)

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })

  void it('does nothing on a double click on a visible marker', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([light()], textures)

    markers.updateMatrixWorld(true)

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [], vertexToPolygons: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (): void => {
            // the double click on a light must not touch the outline either
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return { isLocked: true } as unknown as CameraControls
      },
      roomColorOf: () => {
        return undefined
      },
    })

    drag.onDoubleClick({ button: 0 } as MouseEvent)

    assert.equal(selectionStore.polygons.value.size, 0)

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })

  void it('drops the light and the hover when the crosshair leaves the marker', () => {
    const camera = cameraOf()
    const textures = texturesOf()
    const markers = createLightMarkers([], textures)
    const calls: Array<readonly ArxPolygon[]> = []

    markers.updateMatrixWorld(true)
    lightHoverStore.set(3)

    const drag = useSelectionDrag({
      view: () => {
        return { camera, scene: new Scene() } as unknown as ViewScene<PerspectiveCamera>
      },
      map: () => {
        return { polygons: [], triangleToPolygon: [] } as unknown as ArxMap
      },
      meshes: () => {
        return []
      },
      overlay: () => {
        return {
          setCursor: (polygons: readonly ArxPolygon[]): void => {
            calls.push(polygons)
          },
        } as unknown as PolygonSelectionOverlay
      },
      lightMarkers: () => {
        return markers
      },
      controls: () => {
        return undefined
      },
      roomColorOf: () => {
        return undefined
      },
    })

    drag.pickUnderCrosshair()

    assert.equal(lightHoverStore.light.value, undefined)
    assert.equal(crosshairStore.polygon.value, undefined)
    assert.deepEqual(calls, [[]])

    for (const texture of Object.values(textures)) {
      texture.dispose()
    }
  })
})
