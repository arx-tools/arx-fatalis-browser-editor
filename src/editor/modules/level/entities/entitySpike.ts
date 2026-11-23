import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Texture,
} from 'three'
import { FTL } from 'arx-convert'
import type { ArxFTL, ArxInteractiveObject } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { decodeTextureBitmap } from '../../textures/image.ts'
import { createLevelTexture } from '../edit/levelTextures/load.ts'
import { ALPHA_CUTOUT } from '../edit/levelTextures/paint.ts'
import { readDataFile } from '../source/dataDir.ts'

/**
 * The entity of the spike: the throne room door of level 0.
 *
 * @remarks
 * The owner named it `light_door_0113` (2026-11-17): the game calls the model `fix_inter/light_door`, and the number at
 * the end of the name is the identifier of the instance. It is the first entity the editor draws from the FTL.
 */
const SPIKE_ENTITY = { name: 'fix_inter/light_door', identifier: 113 } as const

/**
 * The color of a model the spike does not texture yet.
 */
const SPIKE_MATERIAL_COLOR = 0x8a_7a_66

/**
 * The axes the game turns an entity around.
 */
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)

/**
 * Turns the angles of a DLF entity into radians.
 *
 * @param degrees The angle of the game, in degrees.
 *
 * @returns The angle in radians.
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Reads the mesh an entity's script asks for, or the one of the entity itself.
 *
 * @remarks
 * An entity's ASL can switch its model in the `ON LOAD` block (`USE_MESH "door_double_throne\\door_double_throne.teo"`),
 * and the scripts of the game use that a lot: the `light_door_0113` of the throne chamber draws the double throne door,
 * not the light door its name says. The path of the script is the one the game uses: the folder of the entity and the
 * name with the four digit identifier beside it (`light_door/light_door_0113/light_door.asl`), and the mesh of the
 * `USE_MESH` is relative to the fixed interactive folder.
 *
 * @param entity The interactive object of the DLF.
 * @param modelName The last part of the name of the entity, like `light_door`.
 * @param fetchImpl The fetch to read the data directory with.
 *
 * @returns The path of the FTL to load.
 */
async function modelOf(entity: ArxInteractiveObject, modelName: string, fetchImpl: typeof fetch): Promise<string> {
  const own = `graph/obj3d/interactive/${entity.name}/${modelName}.ftl`
  const scriptPath = `graph/obj3d/interactive/${entity.name}/${modelName}_${String(entity.identifier).padStart(4, '0')}/${modelName}.asl`
  const script = await readDataFile(scriptPath, fetchImpl)

  if (script === undefined) {
    return own
  }

  const match = /use_mesh\s+"(?<mesh>[^"]+)"/iu.exec(new TextDecoder().decode(script))
  const requested = match?.groups?.mesh

  if (requested === undefined) {
    return own
  }

  return `graph/obj3d/interactive/fix_inter/${requested.replaceAll('\\', '/').replace(/\.teo$/iu, '')}.ftl`
}

/**
 * Loads the textures of the model, and builds one material for each of them.
 *
 * @remarks
 * The FTL names its textures the way the game reads them (`[wood]_palace_double_door01.bmp`), and the files themselves
 * are in the texture folder of the data directory: the face's own `textureIdx` picks the material, so the panels and
 * the metal of the door keep their own texture.
 *
 * @param ftl The model of the entity.
 * @param fetchImpl The fetch to read the data directory with.
 *
 * @returns A material for each texture container of the model.
 */
async function materialsOf(ftl: ArxFTL, fetchImpl: typeof fetch): Promise<MeshBasicMaterial[]> {
  const materials: MeshBasicMaterial[] = []

  for (const container of ftl.textureContainers) {
    const bytes = await readDataFile(`graph/obj3d/textures/${container.filename}`, fetchImpl)
    let map: Texture | undefined

    if (bytes !== undefined) {
      try {
        map = createLevelTexture(await decodeTextureBitmap(container.filename, bytes))
      } catch {
        // a texture the browser can not read stays the flat color of the spike
      }
    }

    const material = new MeshBasicMaterial({ map: map ?? null, side: DoubleSide })

    // The game cuts the holes of a texture with the alpha it has (`PopOneTriangleList` in `AnimationRender.cpp`), and a
    // BMP's black pixels are the color key of the file (`applyColorKey`): without the cut, the ring handle of the
    // door draws the black panel of its texture atlas instead of the wood behind it.
    material.alphaTest = ALPHA_CUTOUT

    if (map === undefined) {
      material.color.setHex(SPIKE_MATERIAL_COLOR)
    }

    materials.push(material)
  }

  return materials
}

/**
 * Loads the model of the spike entity, and puts it at the place and the angle of the entity.
 *
 * @remarks
 * The POC reads one FTL from the data directory, builds a mesh from its triangles and gives it a flat color: no
 * animation, no texture and no group of the model (TODO 235). The FTL is the game's own model file, so the shape is the
 * one the game draws.
 *
 * @param map The map the store loaded.
 * @param fetchImpl The fetch to read the data directory with.
 *
 * @returns The group of the model, or `undefined` when the level has no such entity.
 */
export async function loadSpikeEntityModel(map: ArxMap, fetchImpl: typeof fetch = fetch): Promise<Group | undefined> {
  const entity = map.dlf.interactiveObjects.find((object) => {
    return object.name === SPIKE_ENTITY.name && object.identifier === SPIKE_ENTITY.identifier
  })

  if (entity === undefined) {
    return undefined
  }

  const modelName = entity.name.split('/').at(-1) ?? entity.name
  const modelPath = await modelOf(entity, modelName, fetchImpl)
  const bytes = await readDataFile(modelPath, fetchImpl)

  if (bytes === undefined) {
    throw new Error(`The model of ${SPIKE_ENTITY.name} is not in the data directory.`)
  }

  const ftl = FTL.load(bytes)
  const positions: number[] = []

  for (const face of ftl.faces) {
    for (const index of face.vertexIdx) {
      const vertex = ftl.vertices[index]

      if (vertex === undefined) {
        continue
      }

      const point = arxVector3toVector3(vertex.vector)
      positions.push(point.x, point.y, point.z)
    }
  }

  const geometry = new BufferGeometry()
  const uvs: number[] = []
  const materialIndices: number[] = []

  for (const face of ftl.faces) {
    for (let corner = 0; corner < 3; corner++) {
      uvs.push(face.u[corner], face.v[corner])
    }

    materialIndices.push(face.textureIdx)
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

  let runStart = 0
  let runMaterial = materialIndices[0] ?? 0

  for (let index = 1; index <= materialIndices.length; index++) {
    if (index < materialIndices.length && materialIndices[index] === runMaterial) {
      continue
    }

    geometry.addGroup(runStart * 3, (index - runStart) * 3, runMaterial)
    runStart = index
    runMaterial = materialIndices[index] ?? runMaterial
  }

  const materials = await materialsOf(ftl, fetchImpl)
  const model = new Mesh(geometry, materials)
  const group = new Group()

  group.name = 'entity-spike'
  group.add(model)
  // the DLF position is the local space of the level: the scene position of the FTS is the offset the camera adds at
  // load, and the map's own polygons are drawn in this same local space (`ArxMap.finalize` keeps the two together)
  group.position.copy(arxVector3toVector3(entity.position))
  // The game does not turn a static entity with `toRotationMatrix`: `RenderInter` (`Interactive.cpp`) sets the yaw to
  // `270 - yaw` first, and then builds the rotation of `toQuaternion`, which is `Rz(-roll) * Rx(pitch) * Ry(yaw)`.
  // The editor's mesh is `M(x, y, z) = (-x, -y, z)`, a half turn around the z axis, and the game's scene goes through
  // the same `M`, so the rotation of the entity is `M * R * M^-1`: the roll keeps its sign, and the pitch and the yaw
  // turn to the other side. The double door of the throne room then stands in the plane of its arch, facing the stairs.
  const pitch = degreesToRadians(-entity.orientation.a)
  const yaw = degreesToRadians(entity.orientation.b - 270)
  const roll = degreesToRadians(-entity.orientation.g)

  group.quaternion
    .setFromAxisAngle(Z_AXIS, roll)
    .multiply(new Quaternion().setFromAxisAngle(X_AXIS, pitch))
    .multiply(new Quaternion().setFromAxisAngle(Y_AXIS, yaw))

  return group
}

/**
 * Disposes a material of the model, and the texture it draws with.
 *
 * @param material The material of a face of the model.
 */
function disposeMaterial(material: Material): void {
  if (material instanceof MeshBasicMaterial) {
    material.map?.dispose()
  }

  material.dispose()
}

/**
 * Takes the model of the spike entity out of the scene.
 *
 * @param group The group {@link loadSpikeEntityModel} built.
 */
export function disposeSpikeEntityModel(group: Group): void {
  for (const child of group.children) {
    if (!(child instanceof Mesh)) {
      continue
    }

    const geometry = child.geometry as BufferGeometry

    geometry.dispose()

    const material = child.material as Material | Material[]

    if (Array.isArray(material)) {
      for (const entry of material) {
        disposeMaterial(entry)
      }
    } else {
      disposeMaterial(material)
    }
  }

  group.clear()
}
