import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { BufferGeometry, Mesh } from 'three'
import { isQuad } from 'arx-convert/utils'
import {
  type GeometrySlice,
  type PolygonInsertion,
  pushSlice,
  refillFromGeometry,
  refillGeometry,
  slicesOf,
} from './arxMap/removal.ts'
import { type TextureRun, indexSolidGeometryInTextureOrder, readTextureRuns } from './arxMap/textureRuns.ts'
import { type FaceUv, writeFaceUvs } from './arxMap/uvs.ts'
import { unpackArxFile } from './files.ts'
import { fingerprintOf } from './fingerprint.ts'
import {
  accelerateRaycast,
  arxPolygonsToGeometry,
  arxPolygonsToWireframeGeometry,
  arxVector3toVector3,
  createLevelMaterial,
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
 * The texture container a face takes.
 */
export interface FaceTexture {
  /**
   * The index of the face in {@link ArxMap.polygons}.
   */
  readonly index: number
  /**
   * The id of the texture container it draws with.
   */
  readonly textureContainerId: number
}

/**
 * The room of a face.
 */
export interface FaceRoom {
  /**
   * The index of the face in {@link ArxMap.polygons}.
   */
  readonly index: number
  /**
   * The id of the room it belongs to, or `-1` for a face without a room.
   */
  readonly room: number
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
   * A view that paints the level with a material of its own (the fixed views keep a flat face) draws these.
   */
  readonly solidMeshes: readonly Mesh[]

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
   * The index of a polygon here is the one a raycast can report through {@link triangleToPolygon}. The selection and
   * the phantom cursor read the vertices from this list.
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
   * The runs of the solid faces that share a texture, in the order the geometry draws them.
   *
   * @remarks
   * The index of the solid mesh is in the texture order ({@link indexSolidGeometryInTextureOrder}), so the runs are the
   * blocks of the index: the paint builds one group per run, and a run is one draw call (level 11: 266 of them).
   * Without the list the paint would walk all 123 485 triangles of the index to find the same blocks (52 ms).
   */
  textureRuns: readonly TextureRun[] = []

  /**
   * What the level was made with: its seed today.
   *
   * @remarks
   * The level carries it so a link can bring the same level back: the constructor starts the generator from
   * it (or from a fresh seed, when the caller had none), and the editor puts the seed in the url.
   */
  readonly settings: Settings

  /**
   * The general description of the level, as it was loaded.
   *
   * @remarks
   * The editor does not edit entities yet, so the description goes out the way it came in: the export writes it back
   * from here (see `modules/export/exportLevel.ts`) instead of the bytes of the file.
   */
  readonly dlf: ArxDLF
  /**
   * The scene: the mesh and the texture containers, as it was loaded.
   *
   * @remarks
   * The polygons of the screen are {@link polygons}; the rest of the scene (the containers, the anchors, the unique
   * headers) is the one of this object, and the export writes it with the polygons of the editor.
   */
  readonly fts: ArxFTS
  /**
   * The packed files the level was built from, as they were handed over.
   *
   * @remarks
   * The level is read once, and the bytes are kept: the steps of the history are indices of **this** level, so a replay
   * needs the level they were made on, and an editor that writes the level out again can put them beside the result (an
   * archive of its own can not be replayed onto, its faces are already the result). The buffers are the ones the
   * constructor was given, not a copy.
   */
  readonly source: { readonly dlf: ArrayBuffer; readonly fts: ArrayBuffer; readonly llf: ArrayBuffer }

  /**
   * The fingerprint of the file the level was loaded from.
   *
   * @remarks
   * The stored steps of the history are polygon indices of this level, so they may only be replayed on the same file:
   * the fingerprint says whether the level the editor opens is the one those steps were made on (see
   * `generator/fingerprint.ts`). It comes from the packed scene: that file carries the polygons, in their order.
   */
  readonly fingerprint: string

  /**
   * The lighting of the level, as it was loaded.
   *
   * @remarks
   * Its palette is in the order of the polygons of the file: the export rebuilds it in the order of the screen (see
   * `buildExportLlf`).
   */
  readonly llf: ArxLLF

  /**
   * The polygons grouped by the positions of their vertices.
   *
   * @remarks
   * The neighbours of a face: the drag of the walkable view and the texture fill both walk these, so they
   * follow the welds of the mesh and stop where the mesh is not welded.
   *
   * It is **built on the first read** and dropped on every edit: walking ~70 000 polygons and hashing their
   * vertices costs about 140 ms on the big level (measured), and a delete does not need it — only the drag and
   * the double click do. So a delete pays nothing for it, and the first drag after an edit pays it once.
   */
  get vertexToPolygons(): ReadonlyMap<string, readonly number[]> {
    const index = this.vertexPolygons ?? vertexToPolygonsMap(this.polygons)

    this.vertexPolygons = index

    return index
  }

  /**
   * The numbers the statistics widget shows, worked out when the mesh was built.
   */
  private figures: MapStatistics

  /**
   * The vertex index of {@link vertexToPolygons}, until the polygons change.
   */
  private vertexPolygons: ReadonlyMap<string, readonly number[]> | undefined

  /**
   * The name of every texture the level uses, by the id a polygon points at.
   *
   * @remarks
   * The FTS stores the containers as a list, and a polygon holds an id: the two are looked up here once, so the
   * inspector can name the texture of a face without walking the list on every frame.
   *
   * It follows the containers of the level: a texture the editor adds to a face
   * ({@link ArxMap.addTextureContainer}) is in this map too, so `textureNameOf` names it right away.
   */
  private readonly textureNames: Map<number, string>

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
   * How many rooms the level uses: the rooms a face belongs to.
   *
   * @remarks
   * The file holds more room records than the level uses: the 0 is reserved and empty, and an edit can leave a gap
   * between two ids. The count here is what the author sees (the statistics, and the areas panel later): the rooms
   * that have a face, so a level built on one floor is one room and not two.
   *
   * It is read from the polygons on every call: the widget draws when the level or an edit changed, not every frame,
   * and a face that moves to another room is counted without a rebuild.
   */
  get roomCount(): number {
    const rooms = new Set<number>()

    for (const polygon of this.polygons) {
      if (polygon.room >= 0) {
        rooms.add(polygon.room)
      }
    }

    return rooms.size
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

    this.fingerprint = fingerprintOf(fts)
    this.source = { dlf, fts, llf }
    this.dlf = DLF.load(unpackArxFile(dlf, 'dlf'))
    this.fts = FTS.load(unpackArxFile(fts, 'fts'))
    this.llf = LLF.load(unpackArxFile(llf, 'llf'))
    this.player = new Player(this.dlf)

    const textureNames = new Map<number, string>()

    for (const container of this.fts.textureContainers) {
      textureNames.set(container.id, container.filename)
    }

    this.textureNames = textureNames

    // the polygons of the file are read once: the geometry, the wireframe, the selection and the statistics
    // are all built from this list, so nothing walks the level again
    const polygons = [...this.fts.polygons]
    const solidMesh = new Mesh(new BufferGeometry(), createLevelMaterial())

    this.solidMeshes = [solidMesh]
    this.meshes = [solidMesh]
    this.polygons = polygons
    this.wireframeGeometry = new BufferGeometry()
    this.triangleToPolygon = triangleToPolygonMap(polygons)

    this.figures = {
      faceCount: 0,
      triangleCount: 0,
      quadCount: 0,
      lightCount: this.llf.lights.length,
      anchorCount: this.fts.anchors.length,
      portalCount: this.fts.portals.length,
    }

    // everything that comes from the polygons is built here, the same way an edit builds it again
    this.rebuild(polygons)
  }

  /**
   * The name of the texture a polygon draws with.
   *
   * @remarks
   * The name is the one the game reads, relative to `graph/obj3d/textures` (like `[stone]_human_wall1.bmp`),
   * so it is what the texture round has to resolve against the assets of the level.
   *
   * @param textureContainerId The id the polygon points at.
   *
   * @returns The file name of the texture, or `undefined` when the level has no container with that id.
   */
  textureNameOf(textureContainerId: number): string | undefined {
    return this.textureNames.get(textureContainerId)
  }

  /**
   * The id of the container the level has for a texture name.
   *
   * @remarks
   * A level may name its texture once and point many faces at it, and a texture the editor paints on a face has to have
   * a container of its own: this is how the editor finds the container of a texture it already has, before it adds a new
   * one ({@link ArxMap.nextTextureContainerId}).
   *
   * @param name The name of the texture, the way the level reads it.
   *
   * @returns The id of its container, or `undefined` when the level has none with that name.
   */
  textureContainerIdOfName(name: string): number | undefined {
    for (const [id, filename] of this.textureNames) {
      if (filename === name) {
        return id
      }
    }

    return undefined
  }

  /**
   * The id a container added to the level takes.
   *
   * @remarks
   * The ids of the game are not a run of small numbers (they are the hashes of the file names), and the level may have
   * a hole in its list, so the next id is one above the biggest rather than one above the last: a container that
   * replaces another keeps a name of its own, and no existing face starts to point at it by accident.
   *
   * @returns The id the next container of the level gets.
   */
  nextTextureContainerId(): number {
    let biggest = 0

    for (const id of this.textureNames.keys()) {
      biggest = Math.max(biggest, id)
    }

    return biggest + 1
  }

  /**
   * Adds a texture container to the level.
   *
   * @remarks
   * A level knows the textures it draws with, and a face can only point at one of them: painting a face with a texture
   * the level does not have (a dropped file, a texture of another level) adds its container first. The container is
   * written into the scene, so the export writes it too, and the id comes from the record of the step (the replay has
   * to add the same one).
   *
   * A container the level already has by that id is left as it is: the step that adds it may be replayed.
   *
   * @param id The id of the container, from {@link ArxMap.nextTextureContainerId} when the step was made.
   * @param filename The name of the texture, relative to `graph/obj3d/textures`.
   */
  addTextureContainer(id: number, filename: string): void {
    if (this.textureNames.has(id)) {
      return
    }

    this.fts.textureContainers.push({ id, filename })
    this.textureNames.set(id, filename)
  }

  /**
   * Takes a texture container out of the level.
   *
   * @remarks
   * It is the inverse of {@link ArxMap.addTextureContainer}: a step that added a container takes it back when it is
   * undone. The faces have to be put back on their old container first, which the step does by its own record.
   *
   * @param id The id of the container to take out.
   */
  removeTextureContainer(id: number): void {
    if (!this.textureNames.delete(id)) {
      return
    }

    this.fts.textureContainers = this.fts.textureContainers.filter((container) => {
      return container.id !== id
    })
  }

  /**
   * Sets the texture container of faces, one by one.
   *
   * @remarks
   * The texture of a face is not a part of its geometry, so the mesh does not have to be built again: the runs of the
   * texture ({@link ArxMap.textureRuns}) are read again, because a run is the block of the index the paint draws with
   * one material, and the faces of a run just became faces of another texture. The index itself is not sorted again: a
   * container that moved into the middle of another run costs a draw call, a sort of 123 485 triangles costs more than
   * the edit.
   *
   * @param changes The faces and the container each of them takes.
   */
  setFaceTextures(changes: readonly FaceTexture[]): void {
    let changed = false

    for (const change of changes) {
      const polygon = this.polygons[change.index]

      if (polygon === undefined || polygon.textureContainerId === change.textureContainerId) {
        continue
      }

      polygon.textureContainerId = change.textureContainerId
      changed = true
    }

    if (changed) {
      this.textureRuns = readTextureRuns(this.solidMeshes[0].geometry, this.polygons, this.triangleToPolygon)
    }
  }

  /**
   * Moves faces into rooms.
   *
   * @remarks
   * The room of a face is the id of its room in the FTS, and it is read by the room map, the inspector and the export
   * (the epdata of the file). It is not a part of the geometry the level is built from, so a step that moves a face
   * changes nothing the meshes draw: the colour attribute of the room map is written again by its
   * {@link RoomOverlay.repaint} (the views do it when the level revision moves).
   *
   * @param changes The faces and the room each of them takes.
   */
  setFaceRooms(changes: readonly FaceRoom[]): void {
    for (const change of changes) {
      const polygon = this.polygons[change.index]

      if (polygon !== undefined) {
        polygon.room = change.room
      }
    }
  }

  /**
   * Sets the uv of the corners of a face.
   *
   * @remarks
   * The uv is not a part of the geometry the level is built from: it is an attribute of the mesh, so a face can be
   * re-textured at the corner level without building the mesh again. The **model** (the vertices of the polygon) is
   * written too, because the export writes the polygon, and the picking, the wireframe and the statistics read it.
   *
   * The corners are the used vertices of the polygon: three for a triangle, four for a quad. The attribute of the mesh
   * holds the six vertices of a quad (`a, b, c` and `c, b, d`), so a quad writes its four corners into that order.
   *
   * @param faceIndex The face in {@link ArxMap.polygons}.
   * @param uvs The uv of the corners, in the order they are stored (`a, b, c` and `d` for a quad).
   */
  setFaceUvs(faceIndex: number, uvs: readonly FaceUv[]): void {
    writeFaceUvs(
      { geometry: this.solidMeshes[0]?.geometry, polygons: this.polygons, triangleToPolygon: this.triangleToPolygon },
      faceIndex,
      uvs,
    )
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
   * Takes polygons out of the level, by their place in the list.
   *
   * @param indices The polygons to take out.
   */
  deletePolygons(indices: Iterable<number>): void {
    const polygons: ArxPolygon[] = []

    for (const index of indices) {
      const polygon = this.polygons[index]

      if (polygon !== undefined) {
        polygons.push(polygon)
      }
    }

    this.removePolygons(polygons)
  }

  /**
   * Takes polygons out of the level, by identity.
   *
   * @remarks
   * The polygons leave for good, and every derived field follows: the polygon list, the triangle map, the
   * wireframe, the geometry of the two meshes and the statistics.
   *
   * **The geometry is cut, not rebuilt.** The vertices of the removed polygons are copied out of the buffers of
   * the meshes (`keptRuns` + `copyVertexSegments`), which is a memcpy of the kept slices: a rebuild would walk every
   * polygon, transform its vertices and build new typed arrays, and on the big level (69 817 polygons, 364 899
   * triangle indices) that is about 260 ms against a few milliseconds for the cut (measured:
   * `experiments/browser-editor-delete-cost/`). The **mesh objects stay the same**: a view puts its meshes into its
   * scene once, so the geometry under it is refilled in place.
   *
   * What the cut does not save is the BVH: it groups the triangles, so a shorter triangle list needs a new tree
   * (`accelerateRaycast` on the meshes that lost a polygon). That is the remaining cost of a delete. The vertex
   * index ({@link vertexToPolygons}) is dropped rather than rebuilt, so the first drag or double click after an
   * edit builds it again.
   *
   * The indices are the ones of {@link polygons}, and a removal moves them: {@link insertPolygons} is the inverse,
   * and it puts the polygons back at the places they were taken from.
   *
   * @param polygons The polygons to take out, as they are in {@link polygons}.
   */
  removePolygons(polygons: readonly ArxPolygon[]): void {
    const removed = new Set(polygons)

    if (removed.size === 0) {
      return
    }

    const solid: ArxPolygon[] = []
    const solidCounts: number[] = []
    const solidKept: boolean[] = []
    const wireframeCounts: number[] = []
    const wireframeKept: boolean[] = []
    let { faceCount, quadCount, triangleCount } = this.figures

    // one walk over the polygons: how many vertices a polygon owns in the geometry (3 for a triangle, 6 for a quad)
    // and in the wireframe (two per edge of the perimeter)
    for (const polygon of this.polygons) {
      const gone = removed.has(polygon)
      const quad = isQuad(polygon)
      let vertices = 3
      let edges = 6

      if (quad) {
        vertices = 6
        edges = 8
      }

      solidCounts.push(vertices)
      solidKept.push(!gone)

      if (!gone) {
        solid.push(polygon)
      }

      wireframeCounts.push(edges)
      wireframeKept.push(!gone)

      if (gone) {
        faceCount = faceCount - 1

        if (quad) {
          quadCount = quadCount - 1
        } else {
          triangleCount = triangleCount - 1
        }
      }
    }

    if (solid.length === this.polygons.length) {
      return
    }

    this.polygons = solid
    this.triangleToPolygon = triangleToPolygonMap(this.polygons)
    this.vertexPolygons = undefined
    this.figures = { ...this.figures, faceCount, triangleCount, quadCount }

    refillGeometry(this.wireframeGeometry, slicesOf(this.wireframeGeometry, wireframeCounts, wireframeKept))

    if (solid.length !== solidCounts.length) {
      refillGeometry(this.solidMeshes[0].geometry, slicesOf(this.solidMeshes[0].geometry, solidCounts, solidKept))
      this.textureRuns = indexSolidGeometryInTextureOrder(
        this.solidMeshes[0].geometry,
        this.polygons,
        this.triangleToPolygon,
      )
      accelerateRaycast(this.solidMeshes[0], { indirect: true })
    }
  }

  /**
   * Puts polygons back, at the places they were taken from.
   *
   * @remarks
   * It is the inverse of {@link removePolygons}: the records say which polygon goes back at which index of the list,
   * so the order of the level is the one it had. The geometry is **spliced** the same way the cut works — the kept
   * vertices come from the live buffers, the restored polygons from a small geometry built for them (they are the
   * only ones rebuilt, so an undo of a few faces is cheap), and the two are interleaved in the order of the list.
   *
   * The vertices of the restored polygons keep their place divided by three, so the pick and the triangle map stay
   * right; the BVHs of the meshes that got a polygon are built again, because a longer triangle list needs a new
   * tree.
   *
   * @param insertions The polygons and the indices they go back to.
   *
   * @throws When the records do not fit the level (an index past the end of the list): the history of one level is
   * not the history of another, so it is cleared on a load and this should not happen.
   */
  insertPolygons(insertions: readonly PolygonInsertion[]): void {
    if (insertions.length === 0) {
      return
    }

    const byIndex = new Map<number, ArxPolygon>()

    for (const insertion of insertions) {
      byIndex.set(insertion.index, insertion.polygon)
    }

    const next: ArxPolygon[] = []
    let from = 0

    for (let index = 0; index < this.polygons.length + insertions.length; index = index + 1) {
      const inserted = byIndex.get(index)

      if (inserted !== undefined) {
        next.push(inserted)

        continue
      }

      const kept = this.polygons[from]

      if (kept === undefined) {
        throw new Error('the insertion does not fit the level')
      }

      next.push(kept)
      from = from + 1
    }

    const restored = new Set(
      insertions.map((insertion) => {
        return insertion.polygon
      }),
    )
    const offset = arxVector3toVector3(this.fts.header.mScenePosition)
    const restoredSolid = next.filter((polygon) => {
      return restored.has(polygon)
    })
    const solidBuilt = arxPolygonsToGeometry(restoredSolid, offset)
    const wireframeBuilt = arxPolygonsToWireframeGeometry(
      next.filter((polygon) => {
        return restored.has(polygon)
      }),
      offset,
    )

    const solidSlices: GeometrySlice[] = []
    const wireframeSlices: GeometrySlice[] = []
    let solidLive = 0
    let wireframeLive = 0
    let solidRestored = 0
    let wireframeRestored = 0
    let faces = 0
    let quads = 0
    let triangles = 0

    for (const polygon of next) {
      const quad = isQuad(polygon)
      let vertices = 3
      let edges = 6

      if (quad) {
        vertices = 6
        edges = 8
      }

      if (restored.has(polygon)) {
        pushSlice(solidSlices, solidBuilt, solidRestored, vertices)
        solidRestored = solidRestored + vertices
      } else {
        pushSlice(solidSlices, this.solidMeshes[0].geometry, solidLive, vertices)
        solidLive = solidLive + vertices
      }

      if (restored.has(polygon)) {
        pushSlice(wireframeSlices, wireframeBuilt, wireframeRestored, edges)
        wireframeRestored = wireframeRestored + edges
        faces = faces + 1

        if (quad) {
          quads = quads + 1
        } else {
          triangles = triangles + 1
        }
      } else {
        pushSlice(wireframeSlices, this.wireframeGeometry, wireframeLive, edges)
        wireframeLive = wireframeLive + edges
      }
    }

    this.polygons = next
    this.triangleToPolygon = triangleToPolygonMap(next)
    this.vertexPolygons = undefined
    this.figures = {
      ...this.figures,
      faceCount: this.figures.faceCount + faces,
      quadCount: this.figures.quadCount + quads,
      triangleCount: this.figures.triangleCount + triangles,
    }

    refillGeometry(this.wireframeGeometry, wireframeSlices)

    if (restoredSolid.length > 0) {
      refillGeometry(this.solidMeshes[0].geometry, solidSlices)
      this.textureRuns = indexSolidGeometryInTextureOrder(
        this.solidMeshes[0].geometry,
        this.polygons,
        this.triangleToPolygon,
      )
      accelerateRaycast(this.solidMeshes[0], { indirect: true })
    }
  }

  /**
   * Rebuilds every field that comes from the polygons, on the first build of the level.
   *
   * @param polygons Every polygon of the level, in the order of the mesh.
   */
  private rebuild(polygons: readonly ArxPolygon[]): void {
    const offset = arxVector3toVector3(this.fts.header.mScenePosition)

    this.polygons = polygons
    this.triangleToPolygon = triangleToPolygonMap(polygons)
    this.vertexPolygons = undefined

    refillFromGeometry(this.wireframeGeometry, arxPolygonsToWireframeGeometry(polygons, offset))
    refillFromGeometry(this.solidMeshes[0].geometry, arxPolygonsToGeometry(polygons, offset))

    this.textureRuns = indexSolidGeometryInTextureOrder(
      this.solidMeshes[0].geometry,
      this.polygons,
      this.triangleToPolygon,
    )
    accelerateRaycast(this.solidMeshes[0], { indirect: true })

    this.refreshStatistics()
  }
}
