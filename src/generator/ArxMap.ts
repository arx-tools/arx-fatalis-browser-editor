import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxPolygon, ArxPortal, ArxVector3 } from 'arx-convert/types'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { isQuad } from 'arx-convert/utils'
import { refillFromGeometry, refillGeometry } from './arxMap/removal.ts'
import { type TextureRun, indexSolidGeometryInTextureOrder, readTextureRuns } from './arxMap/textureRuns.ts'
import { Polygons, type PolygonChange } from './arxMap/polygons.ts'
import { type FaceUv, writeFaceUvs } from './arxMap/uvs.ts'
import { unpackArxFile } from './files.ts'
import { fingerprintOf } from './fingerprint.ts'
import { wireframeLineColorOf } from './flatColors.ts'
import {
  accelerateRaycast,
  arxPolygonsToGeometry,
  arxPolygonsToWireframeGeometry,
  wireframePointIndex,
  arxVector3toVector3,
  createLevelMaterial,
  wireframeColorsOf,
} from './meshes.ts'
import { Settings } from './Settings.ts'
import { triangleToPolygonMap, vertexToPolygonsMap } from './polygons.ts'
import { Player } from './Player.ts'

export { MIN_SCALE_FACTOR } from './arxMap/transforms.ts'

/**
 * The numbers the statistics widget shows about a level.
 *
 * @remarks
 * They come from the three files: the polygons, the texture containers, the anchors and the portals from
 * the FTS, the lights from the LLF. The editor shows them as they are; nothing here is computed by the
 * renderer.
 */
export type MapStatistics = {
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
export type FaceTexture = {
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
export type FaceRoom = {
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
 * // the three packed files of a level, from the folder of the game, from a zip, or from a test fixture
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
   * the phantom cursor read the vertices from this list. The list is a {@link Polygons}: what takes faces out, puts them
   * back or moves them is a method of it (`map.polygons.remove(faces)`).
   */
  readonly polygons: Polygons

  /**
   * The polygons the mesh draws, in the order of its triangles.
   *
   * @remarks
   * A group of the author can be hidden from the view for a while: its faces stay in {@link polygons} (the level, the
   * steps of the history and the groups are the same), and they are out of the mesh, so the picking can not reach them
   * and the level is drawn without them. The two lists are the same until a face is hidden.
   */
  visiblePolygons: readonly ArxPolygon[]

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
   * The neighbors of a face: the drag of the walkable view and the texture fill both walk these, so they
   * follow the welds of the mesh and stop where the mesh is not welded.
   *
   * It is **built on the first read** and dropped on every edit: walking ~70 000 polygons and hashing their
   * vertices costs about 140 ms on the big level (measured), and a delete does not need it — only the drag and
   * the double click do. So a delete pays nothing for it, and the first drag after an edit pays it once.
   */
  get vertexToPolygons(): ReadonlyMap<string, readonly number[]> {
    const index = this.vertexPolygons ?? vertexToPolygonsMap(this.polygons, this.hiddenPolygons)

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
   * The polygons a group of the author hid from the view.
   *
   * @remarks
   * The view only: the level keeps them, and the export leaves them out. Their vertices are not in the geometry, so
   * every walk of the geometry skips them (the places of the polygons in the two lists differ from the first hidden
   * one).
   */
  private hiddenPolygons: ReadonlySet<ArxPolygon> = new Set()

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
    this.polygons = new Polygons(this)
    this.polygons.push(...polygons)
    this.visiblePolygons = this.polygons
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
   * Writes lights of the level, by their index in the LLF.
   *
   * @remarks
   * The light editor writes a light of the level on every frame of a drag; the step of the history keeps the two
   * snapshots and writes the same values again, so the two paths go through this one.
   *
   * @param changes The lights, with the index each of them takes.
   */
  setLights(changes: ReadonlyArray<{ readonly index: number; readonly light: ArxLight }>): void {
    for (const change of changes) {
      if (this.llf.lights[change.index] !== undefined) {
        this.llf.lights[change.index] = change.light
      }
    }
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
   * Adds colors to the lighting palette of the level.
   *
   * @remarks
   * The palette is the flat list of the LLF: a face owns as many colors as it has corners, starting at the index its
   * first corner names (`llfColorIdx`). A step that makes faces adds the colors they read, and the export copies them
   * in the order of the polygons.
   *
   * @param colors The colors to append to the palette.
   */
  addLightingColors(colors: readonly ArxColor[]): void {
    this.llf.colors.push(...colors)
  }

  /**
   * Takes the last colors of the lighting palette out.
   *
   * @remarks
   * It is the inverse of {@link ArxMap.addLightingColors}: a step that added a block of colors at the end of the
   * palette takes it back when it is undone. The history is linear, so the block of the step is the last one.
   *
   * @param count How many colors to take out.
   */
  removeLightingColors(count: number): void {
    this.llf.colors.splice(Math.max(0, this.llf.colors.length - count), count)
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
      this.refreshWireframeColors()
    }
  }

  /**
   * Writes the color of every vertex of the wireframe again, from the flat color of the texture of its polygon.
   *
   * @remarks
   * The color of a line follows the texture of its face, so a paint, and the undo of a paint, has to write it again:
   * the positions do not move, so the attribute is replaced in place and the geometry is not built again (a build of
   * the big level is ~260 ms, a paint is a click).
   *
   * A texture the table of the game does not know gets its flat color when the editor decodes its file, which can be
   * after the level was built (a custom texture of a zip, a dropped file): the caller writes the colors again then, so
   * the lines of those faces take the color of the texture on the screen.
   */
  refreshWireframeColors(): void {
    if (this.wireframeGeometry.getAttribute('color') === undefined) {
      return
    }

    const colors = wireframeColorsOf(this.polygons, (polygon) => {
      return this.wireframeColorOf(polygon)
    })

    this.wireframeGeometry.setAttribute('color', new BufferAttribute(colors, 3))
  }

  /**
   * Moves faces into rooms.
   *
   * @remarks
   * The room of a face is the id of its room in the FTS, and it is read by the room map, the inspector and the export
   * (the epdata of the file). It is not a part of the geometry the level is built from, so a step that moves a face
   * changes nothing the meshes draw: the color attribute of the room map is written again by its
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
   * The portals of the level, as the FTS keeps them.
   */
  get portals(): readonly ArxPortal[] {
    return this.fts.portals
  }

  /**
   * Replaces the portals of the level.
   *
   * @remarks
   * A portal joins two rooms, and the game walks them from the lists of the rooms: the index of a portal is written into
   * the list of **both** rooms, so the lists are rebuilt from the new portals here. The derived fields of a portal
   * (`center`, `min`, `max`, `norm`) are read again by the game on load; the radius and the two rooms are the ones the
   * file keeps, so a portal this map makes has to carry them.
   *
   * @param portals The portals the level should have.
   */
  setPortals(portals: readonly ArxPortal[]): void {
    this.fts.portals = [...portals]
    this.figures = { ...this.figures, portalCount: this.fts.portals.length }

    // a portal may name a room the level grew after the file was loaded (a new room of a step): the list of the rooms
    // has to reach it, or the portal is in no list and the inspector says the room has none
    let highest = 0

    for (const portal of portals) {
      highest = Math.max(highest, portal.room1, portal.room2)
    }

    while (this.fts.rooms.length <= highest) {
      this.fts.rooms.push({ portals: [], polygons: [] })
    }

    for (const room of this.fts.rooms) {
      room.portals = []
    }

    for (const [index, portal] of this.fts.portals.entries()) {
      for (const roomId of new Set([portal.room1, portal.room2])) {
        this.fts.rooms[roomId]?.portals.push(index)
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
    // the numbers are the ones of the level, not of the view: a hidden group is still in the level
    let quadCount = 0

    for (const polygon of this.polygons) {
      if (isQuad(polygon)) {
        quadCount = quadCount + 1
      }
    }

    this.figures = {
      ...this.figures,
      faceCount: this.polygons.length,
      triangleCount: this.polygons.length - quadCount,
      quadCount,
    }
  }

  /**
   * Writes the fields of the level that come from the polygon list, after a change of it.
   *
   * @remarks
   * The list itself is the caller's (see {@link Polygons}): it takes the faces out, puts them back, and hands the
   * geometry slices and the change of the statistics in. The map is the one that owns the meshes, the tree and the
   * index of the welded vertices, so it is the one that writes them.
   *
   * @param change The slices of the two geometries and the change of the figures.
   *
   * @internal
   */
  applyPolygonChange(change: PolygonChange): void {
    this.visiblePolygons = this.polygons.filter((polygon) => {
      return !this.hiddenPolygons.has(polygon)
    })
    this.triangleToPolygon = triangleToPolygonMap(this.polygons)
    this.vertexPolygons = undefined
    this.figures = {
      ...this.figures,
      faceCount: this.figures.faceCount + change.faces,
      quadCount: this.figures.quadCount + change.quads,
      triangleCount: this.figures.triangleCount + change.triangles,
    }

    refillGeometry(this.wireframeGeometry, change.wireframe)

    if (change.solid !== undefined) {
      refillGeometry(this.solidMeshes[0].geometry, change.solid)
      // the index and the tree are the triangles again, and the faces a group hides stay out of them
      this.writeView()
    }
  }

  /**
   * Drops the index of the welded vertices: the next drag or double click builds it again.
   *
   * @internal
   */
  invalidateVertexIndex(): void {
    this.vertexPolygons = undefined
  }

  /**
   * Bakes the polygons of the hidden groups out of the view, or puts them back.
   *
   * @remarks
   * The level keeps every polygon: the groups, the steps of the history and the export read {@link polygons}, the
   * buffers of the meshes keep every vertex (so the places of the polygons, the palette and the tree of the picking do
   * not move), and what the views draw is the **index** of the solid mesh, which leaves the triangles of a hidden face
   * out: the picking does not see them and the renderer does not draw them. Showing them again writes the same index
   * back.
   *
   * The build is the index of the texture runs (a walk of the triangles, ~27 ms on the big level) and the tree of the
   * picking (it groups the triangles, so a shorter index needs a new one, ~28 ms); the boxes of the tree are the
   * triangles, and the points of the wireframe get an index of their own.
   *
   * @param hidden The polygons to hide; an empty set shows every face.
   *
   * @returns True when the view was written again; false when it already showed this set.
   */
  setHiddenPolygons(hidden: ReadonlySet<ArxPolygon>): boolean {
    if (hidden.size === this.hiddenPolygons.size) {
      let same = true

      for (const polygon of hidden) {
        if (!this.hiddenPolygons.has(polygon)) {
          same = false

          break
        }
      }

      if (same) {
        return false
      }
    }

    this.hiddenPolygons = new Set(hidden)
    this.visiblePolygons = this.polygons.filter((polygon) => {
      return !hidden.has(polygon)
    })

    this.writeView()

    return true
  }

  /**
   * Tells whether a polygon of the level is out of the view.
   *
   * @param polygon The polygon to ask about.
   *
   * @returns True when a hidden group holds it.
   */
  isHidden(polygon: ArxPolygon): boolean {
    return this.hiddenPolygons.has(polygon)
  }

  /**
   * Reads the color of the wireframe of a polygon, from the flat color of its texture.
   *
   * @param polygon The face to read.
   *
   * @returns The color of the line, in the color of the vertices.
   */
  private wireframeColorOf(polygon: ArxPolygon): readonly [number, number, number] {
    return wireframeLineColorOf(this.textureNameOf(polygon.textureContainerId))
  }

  /**
   * Writes the index of the two meshes and the tree of the picking, without building the vertices again.
   *
   * @remarks
   * The vertices of the hidden faces stay in the buffers, so the places of the polygons and the palette do not move: the
   * index is what leaves them out. The wireframe draws the points of the visible faces only, with an index of its own.
   */
  private writeView(): void {
    this.triangleToPolygon = triangleToPolygonMap(this.polygons)
    this.vertexPolygons = undefined

    // the groups are ranges of the old index: they go with it (the paint writes the runs again), and the tree of the
    // picking reads them to place its roots, so a group past the new index would be a triangle that is not there
    this.solidMeshes[0].geometry.clearGroups()

    this.textureRuns = indexSolidGeometryInTextureOrder(
      this.solidMeshes[0].geometry,
      this.polygons,
      this.triangleToPolygon,
      this.hiddenPolygons,
    )
    accelerateRaycast(this.solidMeshes[0], { indirect: true })

    if (this.hiddenPolygons.size === 0) {
      this.wireframeGeometry.setIndex(null)

      return
    }

    this.wireframeGeometry.setIndex(new BufferAttribute(wireframePointIndex(this.polygons, this.hiddenPolygons), 1))
  }

  /**
   * Rebuilds every field that comes from the polygons, on the first build of the level or when the faces changed.
   *
   * @param polygons Every polygon of the level, in the order of the mesh.
   */
  private rebuild(polygons: readonly ArxPolygon[]): void {
    const offset = arxVector3toVector3(this.fts.header.mScenePosition)

    this.polygons.splice(0, this.polygons.length, ...polygons)
    this.visiblePolygons = polygons.filter((polygon) => {
      return !this.hiddenPolygons.has(polygon)
    })
    this.triangleToPolygon = triangleToPolygonMap(polygons)
    this.vertexPolygons = undefined

    refillFromGeometry(
      this.wireframeGeometry,
      arxPolygonsToWireframeGeometry(polygons, offset, (polygon) => {
        return this.wireframeColorOf(polygon)
      }),
    )
    refillFromGeometry(this.solidMeshes[0].geometry, arxPolygonsToGeometry(polygons, offset))

    this.writeView()

    this.refreshStatistics()
  }
}
