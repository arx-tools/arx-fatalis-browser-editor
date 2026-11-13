import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import type { Vector3 } from 'three'
import { ArxMap } from '../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { worldPositionToGame } from '../../../components/widgets/camera/cameraPose.ts'
import { getUrlAdapter, readUrlValue } from '../../persistedRef/url.ts'
import { parseNumberTriplet } from '../../numbers.ts'
import { createOriginalLevelSource } from '../source/levelSource.ts'
import { bumpLevelRevision, bumpTextureRevision } from './editing.ts'
import { levelStore } from './levelStore.ts'

/**
 * The url parameter that names the level to copy the geometry of into the level of the url.
 *
 * @remarks
 * It is a **spike** (2026-11-13, the owner's idea: a level next to another one), not a feature: the geometry of the level
 * named here is added to the map the editor opens, and the faces are left selected, so the author can look at the two
 * levels in the same space. The lights, the rooms, the portals, the anchors and the entities of the copied level are
 * **not** copied: this is the shape of the level, and nothing else.
 */
export const INSERT_LEVEL_PARAMETER = 'insertLevel'

/**
 * The url parameter that moves the inserted level, a comma separated triplet of the game's units.
 *
 * @remarks
 * The offset is measured from the **spawn of the level on the screen**, the way the game starts a level: a level of the
 * game is laid out around that point, so `0,0,0` puts the inserted level where the author starts. Editing the address bar
 * and reloading is the whole of the "move" a spike has: a real one needs a step of the history that translates the
 * selected faces, and a way to drag them.
 */
export const INSERT_OFFSET_PARAMETER = 'insertOffset'

/**
 * The centre of the bounding box of a list of polygons, in the game's coordinates.
 *
 * @param polygons The polygons to measure.
 *
 * @returns The centre, or `undefined` when the list has no vertex.
 */
function centreOfPolygons(polygons: readonly ArxPolygon[]): ArxVector3 | undefined {
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let near = Number.POSITIVE_INFINITY
  let far = Number.NEGATIVE_INFINITY

  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) {
      left = Math.min(left, vertex.x)
      right = Math.max(right, vertex.x)
      top = Math.min(top, vertex.y)
      bottom = Math.max(bottom, vertex.y)
      near = Math.min(near, vertex.z)
      far = Math.max(far, vertex.z)
    }
  }

  if (left > right || top > bottom || near > far) {
    return undefined
  }

  return { x: (left + right) / 2, y: (top + bottom) / 2, z: (near + far) / 2 }
}

/**
 * Copies a polygon, moved by a delta and pointed at the texture container of the level it goes into.
 *
 * @param polygon The polygon to copy.
 * @param delta How far to move it, in the game's units.
 * @param containerId The id of its texture container in the level it goes into.
 *
 * @returns The copied polygon, which shares nothing with the original.
 */
function translatedPolygon(polygon: ArxPolygon, delta: ArxVector3, containerId: number): ArxPolygon {
  return {
    ...polygon,
    vertices: polygon.vertices.map((vertex) => {
      return { ...vertex, x: vertex.x + delta.x, y: vertex.y + delta.y, z: vertex.z + delta.z }
    }) as ArxPolygon['vertices'],
    textureContainerId: containerId,
    // the rooms are the rooms of the other level: a face that lands in this one belongs to none of them until the author
    // puts it into one
    room: -1,
  }
}

/**
 * Adds the geometry of a level to another one, moved so its middle stands at the given point.
 *
 * @remarks
 * - the texture containers of the source are the ones the faces point at, so every one of them is looked up in the target
 * by its file name, and added when the target has none: a texture that both levels use is one container, not two
 * - the polygons are copies: the two maps share no array, so an edit on either side can not reach the other
 * - the shapes are inserted at the end of the polygon list, so the indices of the target level stay where they were
 *
 * @param target The map the geometry goes into.
 * @param source The map the geometry comes from.
 * @param targetPoint Where the middle of the source should stand, in the game's coordinates.
 *
 * @returns The indices of the inserted faces, oldest first, or an empty list when the source has no polygon.
 */
export function insertMapInto(target: ArxMap, source: ArxMap, targetPoint: ArxVector3): number[] {
  const centre = centreOfPolygons(source.polygons)

  if (centre === undefined) {
    return []
  }

  const containers = new Map<number, number>()

  for (const container of source.fts.textureContainers) {
    const existing = target.textureContainerIdOfName(container.filename)

    if (existing !== undefined) {
      containers.set(container.id, existing)

      continue
    }

    const id = target.nextTextureContainerId()

    target.addTextureContainer(id, container.filename)
    containers.set(container.id, id)
  }

  const delta = {
    x: targetPoint.x - centre.x,
    y: targetPoint.y - centre.y,
    z: targetPoint.z - centre.z,
  }
  const base = target.polygons.length
  const polygons = source.polygons.map((polygon) => {
    return translatedPolygon(polygon, delta, containers.get(polygon.textureContainerId) ?? polygon.textureContainerId)
  })

  target.insertPolygons(
    polygons.map((polygon, index) => {
      return { index: base + index, polygon }
    }),
  )

  return polygons.map((_polygon, index) => {
    return base + index
  })
}

/**
 * The spawn of a level, in the game's coordinates.
 *
 * @param map The map the spawn is read from.
 *
 * @returns The point the game starts the level at: the player of the DLF, in the same coordinates the camera form shows.
 */
function spawnOf(map: ArxMap): ArxVector3 {
  const world: Vector3 = arxVector3toVector3(map.player.position)

  return worldPositionToGame(world, map.scenePosition)
}

/**
 * Reads the level named in the url and puts its geometry into the map of the editor.
 *
 * @remarks
 * The level is placed with its middle at the **spawn of the level on the screen**, moved by the offset of the url: the
 * author starts a level around that point, so it is the one place that says where a level belongs. The faces are not left
 * selected (the selection of the author is theirs), and the moving of the inserted shape is a step of the history that
 * does not exist yet.
 */
export async function insertLevelFromUrl(): Promise<void> {
  const url = getUrlAdapter(undefined)

  if (url === undefined) {
    return
  }

  const raw = readUrlValue(url, INSERT_LEVEL_PARAMETER)
  const level = Number.parseInt(raw ?? '', 10)

  if (raw === undefined || !Number.isSafeInteger(level) || level < 0) {
    return
  }

  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const files = await createOriginalLevelSource(level).load()
  const source = new ArxMap(files.dlf, files.fts, files.llf)
  const spawn = spawnOf(map)
  const offset = parseNumberTriplet(readUrlValue(url, INSERT_OFFSET_PARAMETER) ?? '') ?? [0, 0, 0]
  const target = { x: spawn.x + offset[0], y: spawn.y + offset[1], z: spawn.z + offset[2] }
  insertMapInto(map, source, target)

  // the splice of the geometry dropped the groups of the paint, and a solid mesh without a group draws nothing
  bumpTextureRevision()
  bumpLevelRevision()
}
