import { ArxPolygonFlags, type ArxPolygon, type ArxTextureContainer } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'

/**
 * The pass the game draws a face of a texture batch in.
 *
 * @remarks
 * The game sorts the faces of a texture into five buckets of its index buffer (opaque, blended, multiplicative, additive,
 * subtractive), and the batch of a bucket may not hold more than 65 535 indices: the game warns about it and draws the
 * batch wrong (`Mesh.cpp`).
 */
export type BatchBucket = 'opaque' | 'blended' | 'multiplicative' | 'additive' | 'subtractive'

/**
 * How many indices one bucket of a batch may hold.
 *
 * @remarks
 * The game checks the indices of every (room, texture, bucket) and warns above this (`Mesh.cpp`: "Too many indices for
 * texture … in room …").
 */
export const MAX_BUCKET_INDICES = 65_535

/**
 * How many corners one texture may have in a room.
 *
 * @remarks
 * The game writes the index of a corner into the room's vertex buffer as an `unsigned short` (`uslInd`), and the counter
 * is per (room, texture): a texture with more corners than this in one room wraps the indices, and the faces draw with
 * the vertices of the faces before them.
 */
export const MAX_TEXTURE_CORNERS = 65_535

/**
 * The name of a texture without its extension.
 *
 * @remarks
 * The game takes the extension off the name before it looks the file up (`Mesh.cpp`: `remove_ext()`), and the file is
 * found by the stem with `.png`, `.jpg`, `.jpeg`, `.bmp` or `.tga` (`TextureContainer::LoadFile`), so two containers
 * whose names differ in the extension only are **one** batch.
 *
 * @param name The file name a container of the level carries.
 *
 * @returns The name without the last extension.
 */
export function textureStemOf(name: string): string {
  const dot = name.lastIndexOf('.')

  if (dot <= 0) {
    return name
  }

  return name.slice(0, dot)
}

/**
 * The bucket a face is drawn in, from its flags and its transparency.
 *
 * @remarks
 * The rule is the one of the game (`Mesh.cpp`, `Scene.cpp`): the faces without the transparent flag are opaque, and the
 * others are sorted by their `transval` (2 and above multiplicative, 1 and above additive, above 0 blended, the rest
 * subtractive).
 *
 * @param polygon The face to read.
 *
 * @returns The bucket of the face.
 */
export function batchBucketOf(polygon: ArxPolygon): BatchBucket {
  if ((polygon.flags & ArxPolygonFlags.Transparent) === 0) {
    return 'opaque'
  }

  if (polygon.transval >= 2) {
    return 'multiplicative'
  }

  if (polygon.transval >= 1) {
    return 'additive'
  }

  if (polygon.transval > 0) {
    return 'blended'
  }

  return 'subtractive'
}

/**
 * What a face takes from the limits of its batch.
 */
type FaceCost = {
  /**
   * The corners it puts into the vertex buffer of the room: four for a quad, three for a triangle.
   */
  readonly corners: number
  /**
   * The indices it puts into the index buffer: six for a quad (two triangles), three for a triangle.
   */
  readonly indices: number
  /**
   * The bucket of the pass it is drawn in.
   */
  readonly bucket: BatchBucket
}

/**
 * Reads what a face takes from a batch.
 *
 * @param polygon The face to read.
 *
 * @returns The corners, the indices and the bucket of the face.
 */
function costOf(polygon: ArxPolygon): FaceCost {
  if (isQuad(polygon)) {
    return { corners: 4, indices: 6, bucket: batchBucketOf(polygon) }
  }

  return { corners: 3, indices: 3, bucket: batchBucketOf(polygon) }
}

/**
 * One batch of a (room, texture) pair: the faces the game draws in one pass of one texture.
 */
type TextureBatch = {
  /**
   * The corners of the faces of the batch.
   */
  vertices: number
  /**
   * The indices of the batch, by the bucket they go to.
   */
  readonly indices: Record<BatchBucket, number>
  /**
   * The positions of the faces in the list of the polygons, in the order they were added.
   */
  readonly faces: number[]
}

/**
 * A batch with no face in it.
 *
 * @returns A batch without a face, a corner or an index.
 */
function emptyBatchOf(): TextureBatch {
  return { vertices: 0, indices: { opaque: 0, blended: 0, multiplicative: 0, additive: 0, subtractive: 0 }, faces: [] }
}

/**
 * Puts a face into a batch.
 *
 * @param batch The batch to write.
 * @param cost What the face takes from it.
 * @param index The position of the face in the list of the polygons.
 */
function addToBatch(batch: TextureBatch, cost: FaceCost, index: number): void {
  batch.vertices = batch.vertices + cost.corners
  batch.indices[cost.bucket] = batch.indices[cost.bucket] + cost.indices
  batch.faces.push(index)
}

/**
 * Tells whether a batch has room for a face.
 *
 * @param batch The batch to read.
 * @param cost What the face would take from it.
 *
 * @returns True when the face fits in the limits of the batch.
 */
function fitsInBatch(batch: TextureBatch, cost: FaceCost): boolean {
  if (batch.vertices + cost.corners > MAX_TEXTURE_CORNERS) {
    return false
  }

  return batch.indices[cost.bucket] + cost.indices <= MAX_BUCKET_INDICES
}

/**
 * Packs the faces of one (room, texture) pair into the batches the game can draw.
 *
 * @remarks
 * A face goes into the first batch that has room for it, and a new batch opens when none has: the faces of the map stay
 * in their order (the order of the cells), and the first batch keeps the faces of the level's own container, so a level
 * under the limits is written as it is.
 *
 * @param faces The positions of the faces in the list of the polygons.
 * @param polygons The polygons of the level.
 *
 * @returns The batches of the pair, in the order they were opened.
 */
function packBatchesOf(faces: readonly number[], polygons: readonly ArxPolygon[]): TextureBatch[] {
  const batches: TextureBatch[] = []

  for (const index of faces) {
    const polygon = polygons[index]

    if (polygon === undefined) {
      continue
    }

    const cost = costOf(polygon)
    const batch = batches.find((candidate) => {
      return fitsInBatch(candidate, cost)
    })

    if (batch === undefined) {
      const fresh = emptyBatchOf()

      addToBatch(fresh, cost, index)
      batches.push(fresh)

      continue
    }

    addToBatch(batch, cost, index)
  }

  return batches
}

/**
 * Collects the faces of every (room, texture stem) pair.
 *
 * @remarks
 * The game merges the containers of one stem into one texture object, so its batches are per pair and not per
 * container. A face of no room is not drawn by the game (its room has no such face), and a face that names the 0 (which
 * is "no texture" for the game) or no container of the scene is not drawn either: they take no batch.
 *
 * @param polygons The faces of the file.
 * @param containerById The containers of the scene, by their id.
 *
 * @returns The positions of the faces, by the room and the stem of their texture.
 */
function facesByRoomOf(
  polygons: readonly ArxPolygon[],
  containerById: ReadonlyMap<number, ArxTextureContainer>,
): Map<number, Map<string, number[]>> {
  const facesByRoom = new Map<number, Map<string, number[]>>()

  for (const [index, polygon] of polygons.entries()) {
    if (polygon.room < 0) {
      continue
    }

    const container = containerById.get(polygon.textureContainerId)

    if (container === undefined || container.id === 0) {
      continue
    }

    const stem = textureStemOf(container.filename)
    let facesByStem = facesByRoom.get(polygon.room)

    if (facesByStem === undefined) {
      facesByStem = new Map()
      facesByRoom.set(polygon.room, facesByStem)
    }

    let faces = facesByStem.get(stem)

    if (faces === undefined) {
      faces = []
      facesByStem.set(stem, faces)
    }

    faces.push(index)
  }

  return facesByRoom
}

/**
 * The name of a copy of a texture file, with the number before the extension.
 *
 * @param name The name of the texture it copies.
 * @param copy Which copy it is, from 2.
 *
 * @returns The name of the copy, like `[stone]_wall1~2.bmp`.
 */
function copyNameOf(name: string, copy: number): string {
  const stem = textureStemOf(name)
  const extension = name.slice(stem.length)

  return `${stem}~${String(copy)}${extension}`
}

/**
 * Finds the name of the next copy of a texture, one the level does not use yet.
 *
 * @remarks
 * A level may already have a texture with the name a copy would take (`[stone]_wall1~2.bmp`), and the copy would merge
 * with it: the numbers are walked until one is free.
 *
 * @param name The name of the texture the copy is made of.
 * @param used The stems of the level and of the copies made before this one.
 *
 * @returns A file name with a number that no stem of the level has yet.
 */
function nextCopyNameOf(name: string, used: ReadonlySet<string>): string {
  // the names ever taken are fewer than this, so one of these numbers is free
  const limit = used.size + 2

  for (let copy = 2; copy <= limit; copy = copy + 1) {
    const candidate = copyNameOf(name, copy)

    if (!used.has(textureStemOf(candidate))) {
      return candidate
    }
  }

  return copyNameOf(name, limit + 1)
}

/**
 * A texture file an archive carries beside the level, so a copy of the level's texture draws.
 */
export type TextureCopy = {
  /**
   * The name the FTS gives the copy, with the number before the extension: `[stone]_wall1~2.bmp`.
   */
  readonly name: string
  /**
   * The name of the level's texture it copies: `[stone]_wall1.bmp`.
   */
  readonly from: string
}

/**
 * What the batches of the textures of a level are: how every face draws, and the containers the file needs.
 */
export type TextureBatchSplit = {
  /**
   * The container of every face, by its position in the list of the polygons.
   */
  readonly containerIds: readonly number[]
  /**
   * The containers of the file: the ones of the level, and a copy of a texture for every batch the game can not hold.
   */
  readonly containers: readonly ArxTextureContainer[]
  /**
   * The copies the archive has to carry, so the faces of a copy draw with the texture of the level.
   */
  readonly copies: readonly TextureCopy[]
}

/**
 * Splits the texture batches of a level that are too big for the game.
 *
 * @remarks
 * The game draws the faces of a (room, texture, bucket) in one batch, and a texture is looked up by its **stem**: two
 * containers whose names differ in the extension only are one batch (`Mesh.cpp`), and a batch can not hold more than
 * 65 535 indices or 65 535 corners. A level made from a big model (a wall of tens of thousands of quads) overflows both.
 *
 * A batch that is too big is split: the faces of the level stay on their own containers as long as they fit, and the
 * rest go to a **copy of the texture file**, with a `~<number>` in its name (`[stone]_wall1.bmp` → `[stone]_wall1~2.bmp`)
 * and a new container id. The name is a stem of its own, so the game loads a second file, and the batch of the copy is
 * empty again. A copy is made once and used by every room that needs it: the batches are per room, and the same texture
 * object may serve a batch of each room.
 *
 * The split is deterministic: the faces are walked in the order of the list (the order of the cells), and the copy of a
 * texture is filled before the next one opens. A level under the limits comes back unchanged.
 *
 * @param polygons The faces of the file, in the order they are written.
 * @param containers The containers of the scene.
 *
 * @returns How every face draws, the containers of the file, and the copies the archive carries.
 */
export function splitTextureBatchesOf(
  polygons: readonly ArxPolygon[],
  containers: readonly ArxTextureContainer[],
): TextureBatchSplit {
  const containerById = new Map<number, ArxTextureContainer>(
    containers.map((container) => {
      return [container.id, container]
    }),
  )
  const containerIds: number[] = polygons.map((polygon) => {
    return polygon.textureContainerId
  })
  const used = new Set<string>(
    containers.map((container) => {
      return textureStemOf(container.filename)
    }),
  )
  const files = new Map<string, string>()
  const copiesByStem = new Map<string, number[]>()
  const sceneContainers: ArxTextureContainer[] = [...containers]
  const copies: TextureCopy[] = []

  for (const container of containers) {
    const stem = textureStemOf(container.filename)

    if (!files.has(stem)) {
      files.set(stem, container.filename)
    }
  }

  const facesByRoom = facesByRoomOf(polygons, containerById)

  let nextId = 1

  for (const container of containers) {
    nextId = Math.max(nextId, container.id + 1)
  }

  for (const facesByStem of facesByRoom.values()) {
    for (const [stem, faces] of facesByStem) {
      const batches = packBatchesOf(faces, polygons)

      if (batches.length <= 1) {
        continue
      }

      const name = files.get(stem) ?? stem
      let ids = copiesByStem.get(stem)

      if (ids === undefined) {
        ids = []
        copiesByStem.set(stem, ids)
      }

      for (let batch = 1; batch < batches.length; batch = batch + 1) {
        while (ids.length < batch) {
          const copyName = nextCopyNameOf(name, used)

          ids.push(nextId)
          used.add(textureStemOf(copyName))
          sceneContainers.push({ id: nextId, filename: copyName })
          copies.push({ name: copyName, from: name })
          nextId = nextId + 1
        }

        const id = ids[batch - 1]

        if (id === undefined) {
          continue
        }

        for (const index of batches[batch]?.faces ?? []) {
          containerIds[index] = id
        }
      }
    }
  }

  return { containerIds, containers: sceneContainers, copies }
}
