import {
  Box3,
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
import type { ArxFTL, ArxInteractiveObject, ArxRotation } from 'arx-convert/types'
import { explode } from 'node-pkware/simple'
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
 * @param textureUrls The urls of the files the build carries, by the name the containers store.
 *
 * @returns A material for each texture container of the model.
 */
async function materialsOf(
  ftl: ArxFTL,
  fetchImpl: typeof fetch,
  textureUrls: Readonly<Record<string, string>> = {},
): Promise<MeshBasicMaterial[]> {
  const materials: MeshBasicMaterial[] = []

  for (const container of ftl.textureContainers) {
    const fromDataDir = await readDataFile(`graph/obj3d/textures/${container.filename}`, fetchImpl)
    const url = textureUrls[container.filename]
    let bytes: ArrayBuffer | undefined = fromDataDir

    if (bytes === undefined && url !== undefined) {
      const response = await fetchImpl(url)

      if (response.ok) {
        bytes = await response.arrayBuffer()
      }
    }

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
 * The first three bytes of an FTL the game stores uncompressed.
 */
const FTL_MAGIC = 'FTL'

/**
 * Unpacks an FTL the way the game reads it.
 *
 * @remarks
 * The data directory of the game keeps the models as the PAK has them: an uncompressed file starts with `FTL`, and the
 * engine blasts every other stream (`ARX_FTL_Load` in `src/graphics/data/FTL.cpp`). The level files go through the
 * same unpacking (`unpackArxFile`), and a model read raw is not a mesh the parser can take.
 *
 * @param bytes The file as the data directory has it.
 *
 * @returns The bytes of the FTL, ready for the parser.
 */
function unpackedFtlOf(bytes: ArrayBuffer): ArrayBuffer {
  const head = new Uint8Array(bytes, 0, Math.min(FTL_MAGIC.length, bytes.byteLength))
  const plain = head.every((byte, index) => {
    return byte === (FTL_MAGIC.codePointAt(index) ?? 0)
  })

  if (plain) {
    return bytes
  }

  return explode(bytes)
}

/**
 * The faces a view of a model leaves out.
 */
type OmittedFaces = {
  /**
   * The vertices of a selection: a face stays out when any of its corners is one of them.
   *
   * @remarks
   * This is the rule of the game (`IsInSelection` in `src/graphics/data/MeshManipulation.cpp`), and it makes the first
   * person variant of the player.
   */
  readonly vertices?: ReadonlySet<number>
  /**
   * The textures whose faces stay out, by the index of their container.
   */
  readonly textures?: ReadonlySet<number>
}

/**
 * Builds the geometry of the faces of an FTL.
 *
 * @remarks
 * A face whose any corner is in `omitted.vertices` stays out: the game hides a whole face when one of its vertices is
 * in the selection (`ARX_INTERACTIVE_Show_Hide_1st` in `src/scene/Interactive.cpp`). A face of a texture in
 * `omitted.textures` stays out as well, which is how the gore of a whole body disappears.
 *
 * @param ftl The model to read.
 * @param omitted The faces to leave out, or `undefined` for all of them.
 *
 * @returns The geometry of the model, with a group for every run of faces of the same texture.
 */
function geometryOfModel(ftl: ArxFTL, omitted?: OmittedFaces): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const materialIndices: number[] = []
  const textures = omitted?.textures
  const vertices = omitted?.vertices

  for (const face of ftl.faces) {
    const hidden =
      textures?.has(face.textureIdx) === true ||
      face.vertexIdx.some((index) => {
        return vertices?.has(index) === true
      })

    if (hidden) {
      continue
    }

    for (const index of face.vertexIdx) {
      const vertex = ftl.vertices[index]

      if (vertex === undefined) {
        continue
      }

      const point = arxVector3toVector3(vertex.vector)
      positions.push(point.x, point.y, point.z)
    }

    for (let corner = 0; corner < 3; corner++) {
      uvs.push(face.u[corner], face.v[corner])
    }

    materialIndices.push(face.textureIdx)
  }

  const geometry = new BufferGeometry()

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

  return geometry
}

/**
 * The bounds of a selection of an FTL, in the local space of the model.
 *
 * @param ftl The model to read.
 * @param selected The vertices of the selection.
 *
 * @returns The box around the vertices, empty when the selection has none.
 */
function boundsOfSelection(ftl: ArxFTL, selected: readonly number[]): Box3 {
  const bounds = new Box3()

  for (const index of selected) {
    const vertex = ftl.vertices[index]

    if (vertex !== undefined) {
      bounds.expandByPoint(arxVector3toVector3(vertex.vector))
    }
  }

  return bounds
}

/**
 * The textures of a model that carry its gore.
 *
 * @remarks
 * The game finds the gore by the name of the texture: `ARX_INTERACTIVE_HideGore` (`src/scene/Interactive.cpp`) looks
 * for the containers whose name contains `gore`, and hides their faces while the body is whole. The player never shows
 * them, and a level load hides them on every NPC.
 *
 * @param ftl The model to read.
 *
 * @returns The indices of the gore textures, or `undefined` when the model has none.
 */
export function goreTexturesOf(ftl: Pick<ArxFTL, 'textureContainers'>): Set<number> | undefined {
  const indices = new Set<number>()

  for (const [index, container] of ftl.textureContainers.entries()) {
    if (container.filename.toLowerCase().includes('gore')) {
      indices.add(index)
    }
  }

  if (indices.size === 0) {
    return undefined
  }

  return indices
}

/**
 * What a view of a model leaves out.
 */
export type InteractiveModelOptions = {
  /**
   * Leaves the faces of the gore textures out, the way the game draws a whole body.
   *
   * @remarks
   * The player of the game never shows its gore (`ARX_INTERACTIVE_HideGore(entities.player(), 1)` on load), and an NPC
   * of the level shows it only when something opened its body. The editor draws the bodies whole, so the gore stays
   * out; a later body variant would turn it back on, the way `ARX_INTERACTIVE_HideGore(io)` does with no flag.
   */
  readonly hideGore?: boolean
  /**
   * The url of the model, for the case the data directory has no such file.
   *
   * @remarks
   * A level made from nothing has no data directory to read the player's model from, and the generator carries it: the
   * url is where the file of the build is read. A data directory that has the model wins over it, so a level of the game
   * draws the model of its own install.
   */
  readonly modelUrl?: string
  /**
   * The urls of the textures of the model, by the name its containers store.
   *
   * @remarks
   * A level made from nothing has no data directory, and the model of the generator draws with flat colors without its
   * textures: the map says where the build keeps the files, and a data directory that has one wins over it (the way the
   * model itself does).
   */
  readonly textureUrls?: Readonly<Record<string, string>>
}

/**
 * The meshes of an interactive model: the whole one, and the variant the game draws in first person.
 */
export type InteractiveModelViews = {
  /**
   * The mesh of the whole model.
   */
  readonly whole: Mesh
  /**
   * The mesh without the faces of the selection, hidden by default.
   *
   * @remarks
   * The game hides the `1st` selection of the player in first person (`ARX_INTERACTIVE_Show_Hide_1st`), so the model
   * drawn while the camera stands on the spawn has no head and no chest. It is `undefined` when the model has no such
   * selection, or the selection is empty.
   */
  readonly firstPerson: Mesh | undefined
  /**
   * The group that holds the meshes: the caller moves and turns this one.
   */
  readonly group: Group
  /**
   * The bounds of the selection in the local space of the group, or `undefined` when there is no such selection.
   */
  readonly selectionBounds: Box3 | undefined
}

/**
 * Loads the model of an interactive object: its mesh, its textures, and the variant of a first person view.
 *
 * @remarks
 * The FTL is the game's own model file, so the shape is the one the game draws. The faces of the model are grouped by
 * their texture (one material for each), and the model is put in a group at the origin: the caller moves it to the place
 * and the angle of the thing it draws (an entity, or the player of the level).
 *
 * @param modelPath The path of the FTL inside the data directory.
 * @param selectionName The name of the selection the first person variant keeps out.
 * @param fetchImpl The fetch to read the data directory with.
 * @param options What the view leaves out.
 *
 * @returns The meshes and the group of the model, or `undefined` when the data directory has no such file.
 */
export async function loadInteractiveModelViews(
  modelPath: string,
  selectionName: string,
  fetchImpl: typeof fetch = fetch,
  options: InteractiveModelOptions = {},
): Promise<InteractiveModelViews | undefined> {
  let bytes = await readDataFile(modelPath, fetchImpl)

  if (bytes === undefined && options.modelUrl !== undefined) {
    const response = await fetchImpl(options.modelUrl)

    if (!response.ok) {
      return undefined
    }

    bytes = await response.arrayBuffer()
  }

  if (bytes === undefined) {
    return undefined
  }

  const ftl = FTL.load(unpackedFtlOf(bytes))
  const materials = await materialsOf(ftl, fetchImpl, options.textureUrls)
  let gore: Set<number> | undefined

  if (options.hideGore === true) {
    gore = goreTexturesOf(ftl)
  }

  const whole = new Mesh(geometryOfModel(ftl, { textures: gore }), materials)
  const selected = ftl.selections.find((selection) => {
    return selection.name === selectionName
  })?.selected
  const hasSelection = selected !== undefined && selected.length > 0
  let firstPerson: Mesh | undefined
  let selectionBounds: Box3 | undefined

  if (hasSelection) {
    firstPerson = new Mesh(geometryOfModel(ftl, { vertices: new Set(selected), textures: gore }), materials)
    selectionBounds = boundsOfSelection(ftl, selected)
  }

  const group = new Group()

  group.name = 'interactive-model'
  group.add(whole)

  if (firstPerson !== undefined) {
    firstPerson.name = 'interactive-model-first-person'
    firstPerson.visible = false
    group.add(firstPerson)
  }

  return { whole, firstPerson, group, selectionBounds }
}

/**
 * Loads the model of an interactive object: its mesh and its textures.
 *
 * @remarks
 * The FTL is the game's own model file, so the shape is the one the game draws. The faces of the model are grouped by
 * their texture (one material for each), and the model is put in a group at the origin: the caller moves it to the place
 * and the angle of the thing it draws (an entity, or the player of the level).
 *
 * @param modelPath The path of the FTL inside the data directory.
 * @param fetchImpl The fetch to read the data directory with.
 *
 * @returns The group of the model, or `undefined` when the data directory has no such file.
 */
export async function loadInteractiveModel(
  modelPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Group | undefined> {
  const views = await loadInteractiveModelViews(modelPath, '', fetchImpl)

  return views?.group
}

/**
 * Turns a model the way the game turns a static entity.
 *
 * @remarks
 * The game does not turn a static entity with `toRotationMatrix`: `RenderInter` (`Interactive.cpp`) sets the yaw to
 * `270 - yaw` first, and then builds the rotation of `toQuaternion`, which is `Rz(-roll) * Rx(pitch) * Ry(yaw)`.
 * The editor's mesh is `M(x, y, z) = (-x, -y, z)`, a half turn around the z axis, and the game's scene goes through
 * the same `M`, so the rotation of the entity is `M * R * M^-1`: the roll keeps its sign, and the pitch and the yaw
 * turn to the other side. The double door of the throne room then stands in the plane of its arch, facing the stairs.
 *
 * @param group The model to turn.
 * @param orientation The orientation of the entity, in degrees.
 */
export function placeByEntityAngles(group: Group, orientation: ArxRotation): void {
  const pitch = degreesToRadians(-orientation.a)
  const yaw = degreesToRadians(orientation.b - 270)
  const roll = degreesToRadians(-orientation.g)

  group.quaternion
    .setFromAxisAngle(Z_AXIS, roll)
    .multiply(new Quaternion().setFromAxisAngle(X_AXIS, pitch))
    .multiply(new Quaternion().setFromAxisAngle(Y_AXIS, yaw))
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
  const group = await loadInteractiveModel(modelPath, fetchImpl)

  if (group === undefined) {
    return undefined
  }

  // the DLF position is the local space of the level: the scene position of the FTS is the offset the camera adds at
  // load, and the map's own polygons are drawn in this same local space (`ArxMap.finalize` keeps the two together)
  group.position.copy(arxVector3toVector3(entity.position))
  placeByEntityAngles(group, entity.orientation)

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
