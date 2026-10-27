import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxVector3 } from 'arx-convert/types'
import { Mesh } from 'three'
import { unpackArxFile } from './files.ts'
import { createLevelGeometry, createLevelMaterial } from './meshes.ts'

/**
 * A level of the game: its three parsed files and the meshes built from them.
 *
 * @remarks
 * - the constructor takes the files as the caller has them (the packed `ArrayBuffer`s), does the
 * unpacking and the parsing, and builds the meshes: one call gives a ready map
 * - the meshes are **not** added to a scene: the renderer of the editor owns the scene, this class owns
 * the geometry
 * - the generator does not download anything: the bytes come from the caller, which keeps this class
 * usable from a `fetch`, from a file picker or from the disk of a test
 *
 * @example
 * ```ts
 * const files = await fetchLevelFiles(11) // the editor side
 * const map = new ArxMap(files.dlf, files.fts, files.llf)
 *
 * for (const mesh of map.meshes) {
 *   scene.add(mesh)
 * }
 * ```
 */
export class ArxMap {
  /**
   * The meshes of the level.
   *
   * @remarks
   * Today it holds a single mesh: the polygons are not grouped by material yet, so the whole level is
   * one geometry with one material. The texture and lighting rounds split it up, and the editor already
   * walks the array, so a longer list needs no change on its side.
   */
  readonly meshes: Mesh[]

  /**
   * The general description of the level.
   */
  private readonly dlf: ArxDLF
  /**
   * The scene: the mesh and the texture containers.
   */
  private readonly fts: ArxFTS
  /**
   * The lighting of the level.
   */
  private readonly llf: ArxLLF

  /**
   * The scene position of the level, which is the origin of the mesh's coordinate system.
   *
   * @remarks
   * The mesh is built as `M(v - scenePosition)`, so anything that wants to stand in the same place as
   * the mesh (the camera) has to convert with this value.
   */
  get scenePosition(): ArxVector3 {
    return this.fts.header.mScenePosition
  }

  /**
   * Where the player enters the level, in the game's coordinate system.
   *
   * @remarks
   * The camera of the editor starts here once it gets its controls; the first round only frames the
   * whole level, so it does not use it yet.
   */
  get playerStart(): ArxVector3 {
    return this.dlf.header.player.position
  }

  /**
   * The lights of the level, as the LLF stores them.
   *
   * @remarks
   * The lighting round builds the three.js lights from this list; the first round draws the mesh with
   * a flat material and a preview light, so it does not use it yet.
   */
  get lights(): readonly ArxLight[] {
    return this.llf.lights
  }

  /**
   * Unpacks, parses and builds the three files of a level.
   *
   * @param dlf The packed DLF file: the general description of the level.
   * @param fts The packed FTS file: the scene and the mesh.
   * @param llf The packed LLF file: the lighting of the level.
   *
   * @throws When a file is not a valid Arx file of its format.
   */
  constructor(dlf: ArrayBuffer, fts: ArrayBuffer, llf: ArrayBuffer) {
    this.dlf = DLF.load(unpackArxFile(dlf, 'dlf'))
    this.fts = FTS.load(unpackArxFile(fts, 'fts'))
    this.llf = LLF.load(unpackArxFile(llf, 'llf'))

    const geometry = createLevelGeometry(this.fts)
    geometry.computeBoundingBox()
    this.meshes = [new Mesh(geometry, createLevelMaterial())]
  }
}
