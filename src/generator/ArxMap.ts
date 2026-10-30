import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { Mesh, type BufferGeometry, type Material, type Vector3 } from 'three'
import { unpackArxFile } from './files.ts'
import {
  accelerateRaycast,
  arxPolygonsToGeometry,
  arxPolygonsToWireframeGeometry,
  arxVector3toVector3,
  createInvisibleMaterial,
  createLevelMaterial,
  splitPolygons,
} from './meshes.ts'
import { countFacesOfTriangles } from './polygonCounts.ts'
import { triangleToPolygonMap, vertexToPolygonsMap } from './polygons.ts'
import { Player } from './Player.ts'

/**
 * The numbers the statistics widget shows about a level.
 *
 * @remarks
 * They come from the three files: the polygons, the texture containers, the anchors and the portals from
 * the FTS, the lights from the LLF. The editor shows them as they are; nothing here is computed by the
 * renderer.
 */
export interface MapStatistics {
  /**
   * Every face the mesh draws: a triangle or a quad.
   */
  readonly faceCount: number
  /**
   * The faces that are a single triangle.
   */
  readonly triangleCount: number
  /**
   * The faces that are a quad.
   */
  readonly quadCount: number
  /**
   * The lights of the LLF.
   */
  readonly lightCount: number
  /**
   * The anchors of the pathfinding graph the FTS stores.
   */
  readonly anchorCount: number
  /**
   * The portals between the rooms.
   */
  readonly portalCount: number
}

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
   * The meshes with a real texture.
   *
   * @remarks
   * A view that paints the level with a material of its own (the fixed views keep a flat face) has to leave
   * the invisible walls alone: painting them would put walls on the map that the game does not draw.
   */
  readonly solidMeshes: readonly Mesh[]

  /**
   * The meshes of the invisible walls, with their own transparent material.
   */
  readonly invisibleMeshes: readonly Mesh[]

  /**
   * The player of the map: where it stands and where it faces.
   */
  readonly player: Player

  /**
   * The wireframe of the level: the perimeter of every polygon, in the space of the meshes.
   *
   * @remarks
   * One geometry for every view that draws it, like the geometry of the mesh. It is built with the mesh:
   * the walk over the polygons is cheap compared to the mesh itself, and the switch only decides whether
   * a view puts a `LineSegments` over this geometry into its scene.
   */
  readonly wireframeGeometry: BufferGeometry

  /**
   * The polygons the mesh was built from, in the order of its triangles.
   *
   * @remarks
   * The invisible ones are left out, exactly like the geometry: the index of a polygon here is the one a
   * raycast can report through {@link triangleToPolygon}. The selection and the phantom cursor read the
   * vertices from this list.
   */
  readonly polygons: readonly ArxPolygon[]

  /**
   * The polygon index of every triangle of the mesh.
   *
   * @remarks
   * A quad is one polygon but two triangles, so a raycast hit has to be turned back into a polygon: this
   * map is the running total of the triangles (see `triangleToPolygonMap`).
   */
  readonly triangleToPolygon: readonly number[]

  /**
   * The polygons grouped by the positions of their vertices.
   *
   * @remarks
   * The neighbours of a face: the drag of the walkable view and the texture fill both walk these, so they
   * follow the welds of the mesh and stop where the mesh is not welded. Built once, with the mesh.
   */
  readonly vertexToPolygons: ReadonlyMap<string, readonly number[]>

  /**
   * The numbers the statistics widget shows, worked out when the mesh was built.
   */
  private figures: MapStatistics

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
   * The numbers of the level, as the statistics widget shows them.
   *
   * @remarks
   * Among them the **faces are counted from the mesh**: the triangle map groups the triangles of the geometry
   * by the face they were built from, so a face with a single triangle is a triangle and one with two of them
   * is a quad. The file is not counted again — the numbers are worked out when the mesh is built, and
   * {@link refreshStatistics} is what a later edit calls after it changed the geometry.
   *
   * The lights, the anchors and the portals are not part of the mesh: they are the lengths of their lists in
   * the level files, read once as well.
   */
  get statistics(): MapStatistics {
    return this.figures
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
    this.player = new Player(this.dlf)

    // the polygons of the file are read once: the geometry, the wireframe, the selection and the statistics
    // are all built from these two lists, so nothing walks the level again. The invisible walls come second,
    // and the triangle map follows that order (the pick works out which mesh a hit belongs to)
    const { solid, invisible } = splitPolygons(this.fts)
    const offset = arxVector3toVector3(this.fts.header.mScenePosition)
    const polygons = [...solid, ...invisible]

    const solidMesh = this.buildMesh(solid, offset, createLevelMaterial())
    const invisibleMesh = this.buildMesh(invisible, offset, createInvisibleMaterial())

    // the walls of an alpha container draw nothing, so they must not take part in the shadows either
    invisibleMesh.castShadow = false
    invisibleMesh.receiveShadow = false

    this.solidMeshes = [solidMesh]
    this.invisibleMeshes = [invisibleMesh]
    this.meshes = [...this.solidMeshes, ...this.invisibleMeshes]
    this.polygons = polygons
    this.wireframeGeometry = arxPolygonsToWireframeGeometry(polygons, offset)
    this.triangleToPolygon = triangleToPolygonMap(polygons)
    this.vertexToPolygons = vertexToPolygonsMap(polygons)

    this.figures = {
      faceCount: 0,
      triangleCount: 0,
      quadCount: 0,
      lightCount: this.llf.lights.length,
      anchorCount: this.fts.anchors.length,
      portalCount: this.fts.portals.length,
    }
    this.refreshStatistics()
  }

  /**
   * Counts the faces of the mesh again.
   *
   * @remarks
   * The editing rounds call it after a delete or an add, so the widget shows what the mesh holds. Everything
   * but the faces stays: the lights, the anchors and the portals do not come from the mesh.
   */
  refreshStatistics(): void {
    const faces = countFacesOfTriangles(this.triangleToPolygon)

    this.figures = {
      ...this.figures,
      faceCount: faces.faceCount,
      triangleCount: faces.triangleCount,
      quadCount: faces.quadCount,
    }
  }

  /**
   * Builds a mesh of the level from a list of polygons.
   *
   * @param polygons The polygons of this mesh, in the order of the file.
   * @param offset The scene position of the level, already mirrored.
   * @param material The material the mesh draws with.
   *
   * @returns The mesh, with its bounding box and its BVH.
   */
  private buildMesh(polygons: readonly ArxPolygon[], offset: Vector3, material: Material): Mesh {
    const geometry = arxPolygonsToGeometry(polygons, offset)
    geometry.computeBoundingBox()

    const mesh = new Mesh(geometry, material)

    accelerateRaycast(mesh)

    return mesh
  }
}
