import { Mesh, Vector3, type BufferGeometry, type Material, type MeshBasicMaterial, type Scene } from 'three'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { loadInteractiveModel } from '../../../modules/level/entities/entitySpike.ts'
import { playerSpawnOf } from '../../../modules/level/entities/playerSpawn.ts'

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
   * Sets the opacity of the model from the distance of the camera.
   *
   * @param cameraPosition The position of the camera of the view.
   */
  readonly fadeFor: (cameraPosition: Vector3) => void
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
 *
 * @param options What the model reads from the widget.
 *
 * @returns The handle of the model, or `undefined` when the data directory has no `human_base` model.
 */
export async function loadPlayerModel(options: PlayerModelOptions): Promise<PlayerModel | undefined> {
  const group = await loadInteractiveModel(PLAYER_MODEL_PATH).catch(() => {
    return undefined
  })

  if (group === undefined) {
    return undefined
  }

  const cameraPosition = new Vector3()
  const spawnPosition = new Vector3()
  const model = group

  options.scene.add(model)

  /**
   * Walks the model and gives every material the same opacity.
   *
   * @param opacity The opacity of the model.
   */
  function setOpacity(opacity: number): void {
    for (const child of model.children) {
      if (!(child instanceof Mesh)) {
        continue
      }

      for (const basic of materialsOfMesh(child) as MeshBasicMaterial[]) {
        basic.transparent = opacity < 1
        basic.opacity = opacity
        basic.depthWrite = opacity > 0.9
      }
    }
  }

  setOpacity(1)

  return {
    placeAt: (map: ArxMap): void => {
      const spawn = playerSpawnOf(map)

      model.position.copy(arxVector3toVector3(spawn.position))
      // the camera looks along the game's yaw as `rotation.y = yaw - 180`, so the model of the player faces the way the
      // camera of the spawn looks
      model.rotation.set(0, ((spawn.yaw - 180) * Math.PI) / 180, 0)
      spawnPosition.copy(model.position)
    },
    fadeFor: (position: Vector3): void => {
      cameraPosition.copy(position)
      let opacity = 1

      if (cameraPosition.distanceTo(spawnPosition) < FADE_DISTANCE) {
        opacity = NEAR_OPACITY
      }

      setOpacity(opacity)
    },
    dispose: (): void => {
      options.scene.remove(model)

      for (const child of model.children) {
        if (!(child instanceof Mesh)) {
          continue
        }

        const geometry = child.geometry as BufferGeometry

        geometry.dispose()

        for (const material of materialsOfMesh(child)) {
          material.dispose()
        }
      }
    },
  }
}
