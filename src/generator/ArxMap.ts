import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { BufferGeometry, Mesh } from 'three'
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
import { Settings } from './Settings.ts'
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
  wireframeGeometry: BufferGeometry

  /**
   * The polygons the mesh was built from, in the order of its triangles.
   *
   * @remarks
   * The invisible ones are left out, exactly like the geometry: the index of a polygon here is the one a
   * raycast can report through {@link triangleToPolygon}. The selection and the phantom cursor read the
   * vertices from this list.
   */
  polygons: readonly ArxPolygon[]

  /**
   * The polygon index of every triangle of the mesh.
   *
   * @remarks
   * A quad is one polygon but two triangles, so a raycast hit has to be turned back into a polygon: this
   * map is the running total of the triangles (see `triangleToPolygonMap`).
   */
  triangleToPolygon: readonly number[]

  /**
   * What the level was made with: its seed today.
   *
   * @remarks
   * The level carries it so a link can bring the same level back: the constructor starts the generator from
   * it (or from a fresh seed, when the caller had none), and the editor puts the seed in the url.
   */
  readonly settings: Settings

  /**
   * The polygons grouped by the positions of their vertices.
   *
   * @remarks
   * The neighbours of a face: the drag of the walkable view and the texture fill both walk these, so they
   * follow the welds of the mesh and stop where the mesh is not welded. Built once, with the mesh.
   */
  vertexToPolygons: ReadonlyMap<string, readonly number[]>

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
   * The polygons that came from an alpha container: the walls the game does not draw.
   *
   * @remarks
   * A `WeakSet` on the polygon itself, so an edit that moves the indices around does not have to keep a
   * second list in step: the object knows which mesh it belongs to.
   */
  private readonly invisibleWalls = new WeakSet<ArxPolygon>()

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
   * @param settings What the level is made with: the seed, and whatever a level needs later.
   *
   * @throws When a file is not a valid Arx file of its format.
   */
  constructor(dlf: ArrayBuffer, fts: ArrayBuffer, llf: ArrayBuffer, settings: Settings = new Settings()) {
    // the settings first: their constructor starts the generator, so every random number of the level comes
    // from the seed they carry
    this.settings = settings

    this.dlf = DLF.load(unpackArxFile(dlf, 'dlf'))
    this.fts = FTS.load(unpackArxFile(fts, 'fts'))
    this.llf = LLF.load(unpackArxFile(llf, 'llf'))
    this.player = new Player(this.dlf)

    // the polygons of the file are read once: the geometry, the wireframe, the selection and the statistics
    // are all built from these two lists, so nothing walks the level again. The invisible walls come second,
    // and the triangle map follows that order (the pick works out which mesh a hit belongs to)
    const { solid, invisible } = splitPolygons(this.fts)
    const polygons = [...solid, ...invisible]

    for (const polygon of invisible) {
      this.invisibleWalls.add(polygon)
    }

    const solidMesh = new Mesh(new BufferGeometry(), createLevelMaterial())
    const invisibleMesh = new Mesh(new BufferGeometry(), createInvisibleMaterial())

    // the walls of an alpha container draw nothing, so they must not take part in the shadows either
    invisibleMesh.castShadow = false
    invisibleMesh.receiveShadow = false

    this.solidMeshes = [solidMesh]
    this.invisibleMeshes = [invisibleMesh]
    this.meshes = [...this.solidMeshes, ...this.invisibleMeshes]
    this.polygons = polygons
    this.wireframeGeometry = new BufferGeometry()
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

    // everything that comes from the polygons is built here, the same way an edit builds it again
    this.rebuild(polygons, solid, invisible)
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
   * Takes polygons out of the level.
   *
   * @remarks
   * The polygons leave for good: the meshes are rebuilt from the ones that stay, and every derived field
   * follows (the triangle map, the vertex index, the wireframe, the statistics). The **mesh objects stay the
   * same**: a view puts its meshes into its scene once, so swapping the geometry under them shows the change
   * without the view being rebuilt. The indices are the ones of {@link polygons} (a selection holds those);
   * the caller clears the selection afterwards, because a removal moves the indices.
   *
   * @param indices The polygons to take out.
   */
  deletePolygons(indices: Iterable<number>): void {
    const removed = new Set(indices)

    if (removed.size === 0) {
      return
    }

    const solid: ArxPolygon[] = []
    const invisible: ArxPolygon[] = []

    for (const [index, polygon] of this.polygons.entries()) {
      if (removed.has(index)) {
        continue
      }

      if (this.invisibleWalls.has(polygon)) {
        invisible.push(polygon)
      } else {
        solid.push(polygon)
      }
    }

    if (solid.length + invisible.length === this.polygons.length) {
      return
    }

    this.rebuild([...solid, ...invisible], solid, invisible)
  }

  /**
   * Rebuilds every field that comes from the polygons.
   *
   * @param polygons Every polygon of the level, in the order of the mesh.
   * @param solid The ones with a real texture.
   * @param invisible The walls of an alpha container.
   */
  private rebuild(
    polygons: readonly ArxPolygon[],
    solid: readonly ArxPolygon[],
    invisible: readonly ArxPolygon[],
  ): void {
    const offset = arxVector3toVector3(this.fts.header.mScenePosition)

    this.polygons = polygons
    this.triangleToPolygon = triangleToPolygonMap(polygons)
    this.vertexToPolygons = vertexToPolygonsMap(polygons)

    this.refillGeometry(this.wireframeGeometry, arxPolygonsToWireframeGeometry(polygons, offset))
    this.refillGeometry(this.solidMeshes[0].geometry, arxPolygonsToGeometry(solid, offset))
    this.refillGeometry(this.invisibleMeshes[0].geometry, arxPolygonsToGeometry(invisible, offset))

    accelerateRaycast(this.solidMeshes[0])
    accelerateRaycast(this.invisibleMeshes[0])

    this.refreshStatistics()
  }

  /**
   * Puts the attributes of one geometry into another, in place.
   *
   * @remarks
   * A view puts the geometry of the level into its scene and keeps it (its mesh wrapper and its line segments
   * share it), so an edit can not swap the object under them: the index and the attributes are copied into
   * the same geometry, and every holder draws the new polygons without being told. The BVH of the solid mesh
   * follows in {@link rebuild}.
   *
   * @param target The geometry the views hold.
   * @param source The geometry of the new polygons.
   */
  private refillGeometry(target: BufferGeometry, source: BufferGeometry): void {
    target.dispose()

    // the index goes first: the BVH puts one on the geometry (it groups the triangles), and an index of the
    // polygons that were just taken out would draw a mix of the old and the new level
    target.setIndex(null)

    if (source.index !== null) {
      target.setIndex(source.index.clone())
    }

    for (const [name, attribute] of Object.entries(source.attributes)) {
      target.setAttribute(name, attribute.clone())
    }

    target.computeBoundingBox()
    target.computeBoundingSphere()
    source.dispose()
  }
}
