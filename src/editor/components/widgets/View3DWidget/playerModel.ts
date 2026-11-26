import { Vector3, type Box3, type Material, type Mesh, type MeshBasicMaterial, type Scene } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { GENERATOR_MODELS, GENERATOR_MODEL_TEXTURES } from '../../../../generator/assets.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { loadInteractiveModelViews } from '../../../modules/level/entities/entitySpike.ts'
import { PLAYER_EYE_HEIGHT, playerSpawnOf } from '../../../modules/level/entities/playerSpawn.ts'

/**
 * The model of the player of a level: the human of the spawn point.
 *
 * @remarks
 * The spawn is a point of the DLF, and the editor draws it as the model the game puts there, so the author sees where
 * the level starts and which way it faces (2026-11-24, the owner: the player section of the entity list, with the
 * `human_base` model of the game on every level). The model is a **view** of the spawn, not an entity of the level: it
 * never goes into the DLF, and the entity list keeps its own rows.
 */
const PLAYER_MODEL_PATH = 'graph/obj3d/interactive/npc/human_base/human_base.ftl'

/**
 * The selection of the model the game hides in first person.
 *
 * @remarks
 * The `human_base.ftl` has a `1st` selection of 237 vertices (the head, the neck and the chest), and
 * `ARX_INTERACTIVE_Show_Hide_1st` hides every face of it while the player is in first person
 * (`ArxLibertatis/src/scene/Interactive.cpp`). The editor does the same: the camera of the walkable view stands at the
 * eyes of the spawn, inside that part.
 */
const FIRST_PERSON_SELECTION = '1st'

/**
 * How close the camera has to be for the model to fade.
 *
 * @remarks
 * The camera of the walkable view starts **on the spawn**, so the model of the player stands in front of it: the game
 * does not draw the player it plays, and the editor fades the model instead of taking it out, so the author still sees
 * which way it faces while standing on it.
 */
const FADE_DISTANCE = 120

/**
 * The opacity of the model while the camera is on it.
 */
const NEAR_OPACITY = 0.5

/**
 * How far the camera has to step out of the body before the whole model comes back.
 *
 * @remarks
 * Without the margin the two variants flicker at the edge of the body: the camera crosses the edge on every frame while
 * the author walks. The margin only matters for the way out (the fade and the variant are switched by the same
 * position), and it keeps the swap invisible.
 */
const FIRST_PERSON_MARGIN = 12

/**
 * The part of the player the game hides in first person, as a volume around the spawn.
 */
export type FirstPersonVolume = {
  /**
   * How far the camera can be from the axis of the player, in the units of the game.
   */
  readonly radius: number
  /**
   * The height of the bottom of the hidden part above the feet.
   */
  readonly bottom: number
  /**
   * The height of the top of the hidden part above the feet.
   */
  readonly top: number
}

/**
 * Reads the volume of the first person variant from the bounds of the selection.
 *
 * @param bounds The bounds of the selection in the local space of the model, with the feet at the zero of the y axis.
 *
 * @returns The volume of the hidden part, or `undefined` when the selection has no vertices.
 */
export function firstPersonVolumeOf(bounds: Box3): FirstPersonVolume | undefined {
  if (bounds.isEmpty()) {
    return undefined
  }

  return {
    radius: Math.max(bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z),
    bottom: bounds.min.y,
    top: bounds.max.y,
  }
}

/**
 * Tells whether the camera stands in the part of the player the game hides in first person.
 *
 * @remarks
 * The test is a cylinder around the axis of the player: the model of the spawn is turned around the y axis only, so the
 * volume turns with it without changing. The `wasInside` widens the volume by {@link FIRST_PERSON_MARGIN}, which is
 * the hysteresis: the way in uses the body itself, the way out waits until the camera really stepped out of it.
 *
 * @param volume The volume of the hidden part.
 * @param feet The position of the feet of the model, in the world.
 * @param camera The position of the camera, in the world.
 * @param wasInside Whether the camera was inside the volume on the frame before.
 *
 * @returns Whether the camera is in the volume now.
 */
export function insideFirstPersonVolume(
  volume: FirstPersonVolume,
  feet: Vector3,
  camera: Vector3,
  wasInside: boolean,
): boolean {
  let margin = 0

  if (wasInside) {
    margin = FIRST_PERSON_MARGIN
  }

  const horizontal = Math.hypot(camera.x - feet.x, camera.z - feet.z)
  const height = camera.y - feet.y

  return horizontal < volume.radius + margin && height > volume.bottom - margin && height < volume.top + margin
}

/**
 * What the model reads from the widget.
 */
export type PlayerModelOptions = {
  /**
   * The scene the model goes into.
   */
  readonly scene: Scene
}

/**
 * The model of the player, and its place.
 */
export type PlayerModel = {
  /**
   * Puts the model to the spawn of the level, and turns it to its yaw.
   *
   * @param map The level to read the spawn of.
   */
  readonly placeAt: (map: ArxMap) => void
  /**
   * The meshes of the model the pick of the walkable view can take.
   *
   * @remarks
   * The whole model and its first person variant are two meshes of the one group, and only one of them is drawn. The
   * pick takes the model while the camera stands **outside** it: standing in the body, the crosshair looks through the
   * player's own legs at the face behind them, and the spawn is not what the author aims at (2026-11-26: the portals
   * e2e found the model instead of the floor). The model of the spawn is not a face of the level, so the ray of the
   * pick can not find it through the level's mesh.
   *
   * @returns The mesh the pick may take, or nothing while the camera is in the body.
   */
  readonly meshes: () => Mesh[]
  /**
   * Follows the camera: fades the model near the spawn, and shows the first person variant while the camera is in the
   * body.
   *
   * @param cameraPosition The position of the camera of the view.
   */
  readonly updateFor: (cameraPosition: Vector3) => void
  /**
   * Takes the model out of the scene, and frees its geometry and its materials.
   */
  readonly dispose: () => void
}

/**
 * Reads the materials of a mesh of the model.
 *
 * @param mesh The mesh to read.
 *
 * @returns The materials of the mesh, whether it has one or a list.
 */
function materialsOfMesh(mesh: Mesh): Material[] {
  if (Array.isArray(mesh.material)) {
    return mesh.material
  }

  return [mesh.material]
}

/**
 * Loads the model of the player and puts it at the spawn of the level.
 *
 * @remarks
 * The model arrives asynchronously: the caller asks for it with {@link loadPlayerModel} and keeps the handle, and the
 * `spawnRevision` is what tells the widget to call {@link PlayerModel.placeAt} again after the gizmo moved the spawn.
 * The model has two meshes: the whole one, and the one without the `1st` selection, which the game draws while the
 * player is in first person. The two share their materials, so the fade and the swap do not load a texture twice.
 *
 * @param options What the model reads from the widget.
 *
 * @returns The handle of the model, or `undefined` when neither the data directory nor the generator has the model.
 */
export async function loadPlayerModel(options: PlayerModelOptions): Promise<PlayerModel | undefined> {
  const views = await loadInteractiveModelViews(PLAYER_MODEL_PATH, FIRST_PERSON_SELECTION, fetch, {
    hideGore: true,
    // a level made from nothing has no data directory: the model of the generator stands in for the game's file
    modelUrl: GENERATOR_MODELS[PLAYER_MODEL_PATH],
    textureUrls: GENERATOR_MODEL_TEXTURES,
  }).catch(() => {
    return undefined
  })

  if (views === undefined) {
    return undefined
  }

  const { group, whole, firstPerson, selectionBounds } = views
  const cameraPosition = new Vector3()
  const spawnPosition = new Vector3()
  const eyeOffset = new Vector3(0, PLAYER_EYE_HEIGHT, 0)
  let volume: FirstPersonVolume | undefined

  if (selectionBounds !== undefined) {
    volume = firstPersonVolumeOf(selectionBounds)
  }

  const materials = new Set<MeshBasicMaterial>()
  let firstPersonShown = false
  let hasCamera = false
  for (const mesh of [whole, firstPerson]) {
    if (mesh === undefined) {
      continue
    }

    for (const basic of materialsOfMesh(mesh) as MeshBasicMaterial[]) {
      materials.add(basic)
    }
  }

  options.scene.add(group)

  /**
   * Gives every material of the model the same opacity.
   *
   * @param opacity The opacity of the model.
   */
  function setOpacity(opacity: number): void {
    for (const basic of materials) {
      basic.transparent = opacity < 1
      basic.opacity = opacity
      basic.depthWrite = opacity > 0.9
    }
  }

  /**
   * Shows the first person variant, or the whole model.
   *
   * @param visible Whether the variant is the one on the screen.
   */
  function showFirstPerson(visible: boolean): void {
    if (firstPerson === undefined || firstPersonShown === visible) {
      return
    }

    firstPersonShown = visible
    whole.visible = !visible
    firstPerson.visible = visible
  }

  /**
   * Sets the fade and the variant from where the camera stands.
   */
  function followCamera(): void {
    if (cameraPosition.distanceTo(spawnPosition) < FADE_DISTANCE) {
      setOpacity(NEAR_OPACITY)
    } else {
      setOpacity(1)
    }

    if (volume === undefined) {
      return
    }

    showFirstPerson(insideFirstPersonVolume(volume, group.position, cameraPosition, firstPersonShown))
  }

  setOpacity(1)

  return {
    placeAt: (map: ArxMap): void => {
      const spawn = playerSpawnOf(map)

      // the spawn is the feet of the player: the model of the game stands on it, and the eye (where the camera of the
      // spawn looks from) is a height above it
      group.position.copy(arxVector3toVector3(spawn.position))
      // the camera looks along the game's yaw as `rotation.y = yaw - 180`, so the model of the player faces the way the
      // camera of the spawn looks
      group.rotation.set(0, ((spawn.yaw - 180) * Math.PI) / 180, 0)
      // the fade measures the eye of the player: the camera starts there, and the model stands a player below it
      spawnPosition.copy(group.position).add(eyeOffset)

      if (hasCamera) {
        followCamera()
      }
    },
    meshes: (): Mesh[] => {
      // the body of the player is not a target while the camera stands in it: the author looks through it at a face
      if (firstPersonShown) {
        return []
      }

      return [whole]
    },
    updateFor: (position: Vector3): void => {
      cameraPosition.copy(position)
      hasCamera = true
      followCamera()
    },
    dispose: (): void => {
      options.scene.remove(group)

      for (const mesh of [whole, firstPerson]) {
        if (mesh === undefined) {
          continue
        }

        mesh.geometry.dispose()
      }

      for (const basic of materials) {
        basic.dispose()
      }
    },
  }
}
