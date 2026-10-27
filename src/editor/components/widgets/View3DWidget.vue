<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { ArxMap } from '../../../generator/ArxMap.ts'
import { addPreviewLights, fitCameraToCanvas, frameLevel } from '../../modules/view3d/levelScene.ts'
import { STARTER_LEVEL, fetchLevelFiles } from '../../modules/view3d/levelSource.ts'

/**
 * What the widget shows over the canvas: the loading state, a failure, or nothing while the level is on.
 */
const status = ref('Loading the level…')

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/**
 * Reads the message of a failure.
 *
 * @param error The thrown value.
 *
 * @returns The message of an `Error`, or `undefined` when the value has none.
 */
function messageOf(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message
  }

  return undefined
}

let renderer: WebGLRenderer | undefined
let scene: Scene | undefined
let camera: PerspectiveCamera | undefined
let observer: ResizeObserver | undefined
let frame = 0

/**
 * Draws the next frame, at most once per animation frame.
 *
 * @remarks
 * The first round has no controls and no animation, so the scene is only redrawn when something changes:
 * after the level arrived, after a resize.
 */
function requestRender(): void {
  if (frame !== 0) {
    return
  }

  frame = requestAnimationFrame(() => {
    frame = 0

    if (renderer !== undefined && scene !== undefined && camera !== undefined) {
      renderer.render(scene, camera)
    }
  })
}

/**
 * Fits the renderer and the camera to the size of the widget.
 *
 * The dock moves and resizes the widget node, so the canvas has to follow it.
 */
function resize(): void {
  const element = host.value

  if (element === null || renderer === undefined || camera === undefined) {
    return
  }

  const width = element.clientWidth
  const height = element.clientHeight

  if (width === 0 || height === 0) {
    return
  }

  renderer.setSize(width, height, false)
  fitCameraToCanvas(camera, width, height)
  requestRender()
}

/**
 * Frees the GPU resources of the scene.
 */
function disposeScene(): void {
  scene?.traverse((object) => {
    const disposables = object as unknown as {
      geometry?: { dispose?: () => void }
      material?: { dispose?: () => void }
    }

    disposables.geometry?.dispose?.()
    disposables.material?.dispose?.()
  })

  scene = undefined
  camera = undefined
  renderer?.dispose()
  renderer = undefined
}

/**
 * Downloads, unpacks and draws the level.
 */
async function loadStarterLevel(): Promise<void> {
  const element = host.value
  const target = canvas.value

  if (element === null || target === null) {
    return
  }

  renderer = new WebGLRenderer({ canvas: target, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  scene = new Scene()
  camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
  addPreviewLights(scene)
  resize()

  try {
    const files = await fetchLevelFiles(STARTER_LEVEL)
    const map = new ArxMap(files.dlf, files.fts, files.llf)

    for (const mesh of map.meshes) {
      scene.add(mesh)
    }

    // one mesh for now: the polygons are not grouped by material yet
    const levelMesh = map.meshes[0]
    const boundingBox = levelMesh?.geometry.boundingBox

    if (boundingBox !== null && boundingBox !== undefined) {
      frameLevel(camera, boundingBox)
    }

    status.value = ''
    requestRender()
  } catch (error) {
    status.value = messageOf(error) ?? `Failed to load level ${STARTER_LEVEL}.`
  }
}

onMounted(() => {
  // the loader handles its own failures, but the call is not awaited: the widget has to mount first
  loadStarterLevel().catch((error: unknown) => {
    status.value = messageOf(error) ?? `Failed to load level ${STARTER_LEVEL}.`
  })

  observer = new ResizeObserver(() => {
    resize()
  })

  if (host.value !== null) {
    observer.observe(host.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined

  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }

  disposeScene()
})
</script>

<template>
  <div ref="host" class="View3DWidget">
    <canvas ref="canvas" class="stage"></canvas>
    <p v-if="status !== ''" class="status">{{ status }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

// The 3D view: the canvas fills the widget and the renderer follows its size. The status line lies on
// top, so a slow download or a failed one is visible instead of a black rectangle.
.View3DWidget {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: $surface-widget;
  color: $text-muted;

  .stage {
    display: block;
    width: 100%;
    height: 100%;
  }

  .status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 16px;
    font-size: 13px;
    text-align: center;
    pointer-events: none;
  }
}
</style>
