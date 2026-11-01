import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxDLF, ArxFTS, ArxLight, ArxLLF, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { isQuad } from 'arx-convert/utils'
import { unpackArxFile } from './files.ts'
import {
  accelerateRaycast,
  arxPolygonsToGeometry,
  arxPolygonsToWireframeGeometry,
  arxVector3toVector3,
  createInvisibleMaterial,
  copyVertexSegments,
  createLevelMaterial,
  keptRuns,
  splitPolygons,
  type VertexSegment,
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
 * A polygon that goes back into the level, at the index it was taken from.
 */
export interface PolygonInsertion {
  /**
   * Where the polygon belongs in {@link ArxMap.polygons}.
   */
  readonly index: number
  /**
   * The polygon itself, as it was before it was taken out.
   */
  readonly polygon: ArxPolygon
}

/**
 * A slice of a geometry: the part a new one takes over from it.
 */
interface GeometrySlice {
  /**
   * The geometry to read.
   */
  readonly geometry: BufferGeometry
  /**
   * Where the slice starts, in vertices.
   */
  readonly from: number
  /**
   * How many vertices it holds.
   */
  readonly count: number
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
   * The name of every texture the level uses, by the id a polygon points at.
   *
   * @remarks
   * The FTS stores the containers as a list, and a polygon holds an id: the two are looked up here once, so the
   * inspector can name the texture of a face without walking the list on every frame.
   */
  private readonly textureNames: ReadonlyMap<number, string>

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

    const textureNames = new Map<number, string>()

    for (const container of this.fts.textureContainers) {
      textureNames.set(container.id, container.filename)
    }

    this.textureNames = textureNames

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
    const invisible: ArxPolygon[] = []
    const solidCounts: number[] = []
    const solidKept: boolean[] = []
    const invisibleCounts: number[] = []
    const invisibleKept: boolean[] = []
    const wireframeCounts: number[] = []
    const wireframeKept: boolean[] = []
    let { faceCount, quadCount, triangleCount } = this.figures

    // one walk over the polygons: which mesh a polygon belongs to, how many vertices it owns in the geometry of
    // that mesh (3 for a triangle, 6 for a quad) and in the wireframe (two per edge of the perimeter)
    for (const polygon of this.polygons) {
      const gone = removed.has(polygon)
      const quad = isQuad(polygon)
      let vertices = 3
      let edges = 6

      if (quad) {
        vertices = 6
        edges = 8
      }

      if (this.invisibleWalls.has(polygon)) {
        invisibleCounts.push(vertices)
        invisibleKept.push(!gone)

        if (!gone) {
          invisible.push(polygon)
        }
      } else {
        solidCounts.push(vertices)
        solidKept.push(!gone)

        if (!gone) {
          solid.push(polygon)
        }
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

    if (solid.length + invisible.length === this.polygons.length) {
      return
    }

    this.polygons = [...solid, ...invisible]
    this.triangleToPolygon = triangleToPolygonMap(this.polygons)
    this.vertexPolygons = undefined
    this.figures = { ...this.figures, faceCount, triangleCount, quadCount }

    this.refillGeometry(this.wireframeGeometry, this.slicesOf(this.wireframeGeometry, wireframeCounts, wireframeKept))

    if (solid.length !== solidCounts.length) {
      this.refillGeometry(
        this.solidMeshes[0].geometry,
        this.slicesOf(this.solidMeshes[0].geometry, solidCounts, solidKept),
      )
      accelerateRaycast(this.solidMeshes[0])
    }

    if (invisible.length !== invisibleCounts.length) {
      this.refillGeometry(
        this.invisibleMeshes[0].geometry,
        this.slicesOf(this.invisibleMeshes[0].geometry, invisibleCounts, invisibleKept),
      )
      accelerateRaycast(this.invisibleMeshes[0])
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
      return restored.has(polygon) && !this.invisibleWalls.has(polygon)
    })
    const restoredInvisible = next.filter((polygon) => {
      return restored.has(polygon) && this.invisibleWalls.has(polygon)
    })
    const solidBuilt = arxPolygonsToGeometry(restoredSolid, offset)
    const invisibleBuilt = arxPolygonsToGeometry(restoredInvisible, offset)
    const wireframeBuilt = arxPolygonsToWireframeGeometry(
      next.filter((polygon) => {
        return restored.has(polygon)
      }),
      offset,
    )

    const solidSlices: GeometrySlice[] = []
    const invisibleSlices: GeometrySlice[] = []
    const wireframeSlices: GeometrySlice[] = []
    let solidLive = 0
    let invisibleLive = 0
    let wireframeLive = 0
    let solidRestored = 0
    let invisibleRestored = 0
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

      if (this.invisibleWalls.has(polygon)) {
        if (restored.has(polygon)) {
          this.pushSlice(invisibleSlices, invisibleBuilt, invisibleRestored, vertices)
          invisibleRestored = invisibleRestored + vertices
        } else {
          this.pushSlice(invisibleSlices, this.invisibleMeshes[0].geometry, invisibleLive, vertices)
          invisibleLive = invisibleLive + vertices
        }
      } else if (restored.has(polygon)) {
        this.pushSlice(solidSlices, solidBuilt, solidRestored, vertices)
        solidRestored = solidRestored + vertices
      } else {
        this.pushSlice(solidSlices, this.solidMeshes[0].geometry, solidLive, vertices)
        solidLive = solidLive + vertices
      }

      if (restored.has(polygon)) {
        this.pushSlice(wireframeSlices, wireframeBuilt, wireframeRestored, edges)
        wireframeRestored = wireframeRestored + edges
        faces = faces + 1

        if (quad) {
          quads = quads + 1
        } else {
          triangles = triangles + 1
        }
      } else {
        this.pushSlice(wireframeSlices, this.wireframeGeometry, wireframeLive, edges)
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

    this.refillGeometry(this.wireframeGeometry, wireframeSlices)

    if (restoredSolid.length > 0) {
      this.refillGeometry(this.solidMeshes[0].geometry, solidSlices)
      accelerateRaycast(this.solidMeshes[0])
    }

    if (restoredInvisible.length > 0) {
      this.refillGeometry(this.invisibleMeshes[0].geometry, invisibleSlices)
      accelerateRaycast(this.invisibleMeshes[0])
    }
  }

  /**
   * The slices of a buffer that stay when some of its polygons go.
   *
   * @param geometry The geometry the slices are read from.
   * @param counts How many vertices every polygon owns in this geometry.
   * @param kept Which of the polygons stay.
   *
   * @returns One slice per kept run.
   */
  private slicesOf(geometry: BufferGeometry, counts: readonly number[], kept: readonly boolean[]): GeometrySlice[] {
    return keptRuns(counts, kept).map((run): GeometrySlice => {
      return { geometry, from: run.from, count: run.count }
    })
  }

  /**
   * Adds a slice to a geometry, joining it to the previous one when the two are next to each other.
   *
   * @remarks
   * The insert walks the whole list, and the polygons that were already there come in long runs: joining them keeps
   * the number of the copies low (one per run, not one per polygon).
   *
   * @param slices The list to add to.
   * @param geometry The geometry the slice reads.
   * @param from Where the slice starts, in vertices.
   * @param count How many vertices it holds.
   */
  private pushSlice(slices: GeometrySlice[], geometry: BufferGeometry, from: number, count: number): void {
    const last = slices.at(-1)

    if (last?.geometry === geometry && last.from + last.count === from) {
      slices[slices.length - 1] = { geometry, from: last.from, count: last.count + count }

      return
    }

    slices.push({ geometry, from, count })
  }

  /**
   * Builds a geometry from slices of other geometries, in place.
   *
   * @remarks
   * The holders of the geometry (the mesh wrappers of the views, the line segments of the wireframe) keep the
   * object, so the attributes are replaced under them. The **index** belongs to the BVH (it groups the triangles and
   * the tree writes it), and a splice moves the triangles after the change: it is dropped here, and the new tree
   * writes a fresh one in `accelerateRaycast`.
   *
   * The attributes follow the **first slice**: a mesh has one layout (position, normal, uv), and the slices of the
   * same mesh are the same. A cut reads the slices from the target itself, so its attributes are read one by one, an
   * attribute that was not replaced yet still holding the old vertices.
   *
   * @param target The geometry the views hold.
   * @param slices What the new attributes are made of.
   */
  private refillGeometry(target: BufferGeometry, slices: readonly GeometrySlice[]): void {
    const [first] = slices

    // no slice means no polygon left: the geometry keeps its layout and gets empty buffers
    if (first === undefined) {
      for (const [name, attribute] of Object.entries(target.attributes)) {
        target.setAttribute(name, new BufferAttribute(new Float32Array(0), attribute.itemSize, attribute.normalized))
      }

      target.computeBoundingBox()
      target.computeBoundingSphere()

      return
    }

    const names = Object.keys(first.geometry.attributes)

    target.dispose()
    target.setIndex(null)

    for (const name of names) {
      const reference = first.geometry.getAttribute(name)
      const segments = slices.map((slice): VertexSegment => {
        return { source: slice.geometry.getAttribute(name).array as Float32Array, from: slice.from, count: slice.count }
      })

      target.setAttribute(
        name,
        new BufferAttribute(copyVertexSegments(segments, reference.itemSize), reference.itemSize, reference.normalized),
      )
    }

    target.computeBoundingBox()
    target.computeBoundingSphere()
  }

  /**
   * Rebuilds every field that comes from the polygons, on the first build of the level.
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
    this.vertexPolygons = undefined

    this.refillFromGeometry(this.wireframeGeometry, arxPolygonsToWireframeGeometry(polygons, offset))
    this.refillFromGeometry(this.solidMeshes[0].geometry, arxPolygonsToGeometry(solid, offset))
    this.refillFromGeometry(this.invisibleMeshes[0].geometry, arxPolygonsToGeometry(invisible, offset))

    accelerateRaycast(this.solidMeshes[0])
    accelerateRaycast(this.invisibleMeshes[0])

    this.refreshStatistics()
  }

  /**
   * Refills a geometry the views hold from a geometry built next to it.
   *
   * @remarks
   * The first build of the level works this way (the polygons are converted once), and a cut or an undo works with
   * the slices of {@link refillGeometry}. Both keep the **object** of the geometry: a view puts it into its scene
   * once, so the vertices change under it and every holder draws the new polygons without being told.
   *
   * @param target The geometry the views hold.
   * @param source The geometry that was built for the same polygons.
   */
  private refillFromGeometry(target: BufferGeometry, source: BufferGeometry): void {
    const position = source.getAttribute('position')

    this.refillGeometry(target, [{ geometry: source, from: 0, count: position.count }])
    source.dispose()
  }
}
