import { ArxPolygonFlags, type ArxPolygon, type ArxVertex, type ArxVector3 } from 'arx-convert/types'
import { Quaternion, Vector3 } from 'three'

/**
 * The flags a face of an imported mesh gets: both sides draw.
 *
 * @remarks
 * The generator's own default (`loadOBJ`, `arx-level-generator`) is the same pair (`DoubleSided | Tiled`), and the two
 * sides matter here for a reason of the conversion: the OBJ is a right handed, Y-up space, and the level is the same
 * space with the Y axis mirrored (`M(x, y, z) = (x, -y, z)`). A mirror turns the winding of every face around, so the
 * front side of the polygon (which the renderer culls by) and the normal it stores (which the light reads) are the
 * opposite way around. A two sided face draws from both sides, so the imported mesh reads the same in the editor and in
 * the game, however the author's OBJ was wound. The `Quad` bit is the shape, and it is set per face below.
 */
export const IMPORT_POLYGON_FLAGS = ArxPolygonFlags.DoubleSided

/**
 * The scale the dialog starts with: a unit of the file is a unit of the level.
 *
 * @remarks
 * The mesh comes in as the file has it (2026-11-26, the owner): a model that was made in the units of the game needs no
 * number, and the author writes the factor when the file is in meters (a hundred puts a meter of the model into the
 * centimeters of the game). The dialog offers the number on every import, and the field is the only place it lives.
 */
export const DEFAULT_OBJ_SCALE = 1

/**
 * How an imported mesh is put into the level.
 */
export type ObjImportOptions = {
  /**
   * How much a unit of the OBJ grows, in the units of the game.
   */
  readonly scale: number
  /**
   * How the mesh is turned, in degrees, around the three axes of the game.
   *
   * @remarks
   * The turns are applied in the order of the axes (X, then Y, then Z), the way `loadOBJ` of the generator rotates its
   * geometry.
   */
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number }
  /**
   * Where the origin of the level stands, in the game's coordinates.
   *
   * @remarks
   * The mesh goes to the origin of the level (`0, 0, 0` in the editor's own space), which is the **scene position** of
   * the level: the FTS stores the vertices in the game's space, and the meshes are built as `M(v - scenePosition)`.
   */
  readonly origin: ArxVector3
  /**
   * The container the faces draw with.
   */
  readonly textureContainerId: number
  /**
   * The room the faces go to.
   */
  readonly room: number
}

/**
 * A corner of a face of the file: the place, the uv and the normal, as the `f` line names them.
 */
type ObjCorner = {
  readonly position: Vector3
  readonly uv: { readonly u: number; readonly v: number }
  readonly normal: Vector3 | undefined
}

/**
 * Reads a number of an OBJ line, and gives `undefined` when it is not one.
 *
 * @param token The text of the number.
 *
 * @returns The number, or `undefined` when the text is not a number.
 */
function numberOf(token: string | undefined): number | undefined {
  if (token === undefined) {
    return undefined
  }

  const value = Number.parseFloat(token)

  if (!Number.isFinite(value)) {
    return undefined
  }

  return value
}

/**
 * Reads an index of an `f` line, which counts from one, and counts backwards from the end when it is negative.
 *
 * @param token The text of the index.
 * @param count How many entries the list it names has.
 *
 * @returns The index of the list, or `undefined` when it is not one of it.
 */
function indexOf(token: string, count: number): number | undefined {
  const value = Number.parseInt(token, 10)

  if (value === 0 || !Number.isFinite(value)) {
    return undefined
  }

  let index = count + value

  if (value > 0) {
    index = value - 1
  }

  if (index < 0 || index >= count) {
    return undefined
  }

  return index
}

/**
 * The turns of the import, as one rotation.
 *
 * @param rotation The turns, in degrees.
 *
 * @returns The rotation to apply to the places and the normals of the file.
 */
function quaternionOf(rotation: ObjImportOptions['rotation']): Quaternion {
  const radians = Math.PI / 180
  const x = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rotation.x * radians)
  const y = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotation.y * radians)
  const z = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotation.z * radians)

  // the turns are applied X, then Y, then Z: the quaternion of the three is the last one on the left
  return z.multiply(y).multiply(x)
}

/**
 * The lists an `f` line names: the places, the uvs and the normals of the file so far.
 */
type ObjLists = {
  readonly positions: Vector3[]
  readonly uvs: Array<{ u: number; v: number }>
  readonly normals: Vector3[]
}

/**
 * Reads a place of the file (`v x y z`).
 *
 * @param rest The numbers of the line.
 * @param lists The lists the place belongs to.
 */
function readPlaceOf(rest: readonly string[], lists: ObjLists): void {
  const x = numberOf(rest[0])
  const y = numberOf(rest[1])
  const z = numberOf(rest[2])

  if (x !== undefined && y !== undefined && z !== undefined) {
    lists.positions.push(new Vector3(x, y, z))
  }
}

/**
 * Reads a normal of the file (`vn x y z`).
 *
 * @param rest The numbers of the line.
 * @param lists The lists the normal belongs to.
 */
function readNormalOf(rest: readonly string[], lists: ObjLists): void {
  const x = numberOf(rest[0])
  const y = numberOf(rest[1])
  const z = numberOf(rest[2])

  if (x !== undefined && y !== undefined && z !== undefined) {
    lists.normals.push(new Vector3(x, y, z))
  }
}

/**
 * Reads a uv of the file (`vt u v`).
 *
 * @param rest The numbers of the line.
 * @param lists The lists the uv belongs to.
 */
function readUvOf(rest: readonly string[], lists: ObjLists): void {
  lists.uvs.push({ u: numberOf(rest[0]) ?? 0, v: numberOf(rest[1]) ?? 0 })
}

/**
 * Reads one corner of an `f` line: a place, and the uv and the normal that come with it.
 *
 * @param token The corner, like `1/2/3` or `1//3`.
 * @param lists The lists the corner names.
 *
 * @returns The corner, or `undefined` when the line names a place the file does not have.
 */
function cornerOf(token: string, lists: ObjLists): ObjCorner | undefined {
  const [place, uv, normal] = token.split('/', 3)
  const position = indexOf(place ?? '', lists.positions.length)

  if (position === undefined) {
    return undefined
  }

  let cornerUv = { u: 0, v: 0 }
  let cornerNormal: Vector3 | undefined

  if (uv !== undefined && uv !== '') {
    cornerUv = lists.uvs[indexOf(uv, lists.uvs.length) ?? -1] ?? cornerUv
  }

  if (normal !== undefined && normal !== '') {
    cornerNormal = lists.normals[indexOf(normal, lists.normals.length) ?? -1]
  }

  return { position: lists.positions[position], uv: cornerUv, normal: cornerNormal }
}

/**
 * Reads a face of the file (`f a b c ...`).
 *
 * @param rest The corners of the line.
 * @param lists The lists the corners name.
 *
 * @returns The corners of the face, or an empty list when one of them names something the file does not have.
 */
function readFaceOf(rest: readonly string[], lists: ObjLists): ObjCorner[] {
  const corners: ObjCorner[] = []

  for (const token of rest) {
    const corner = cornerOf(token, lists)

    // a face of the file that names a place it does not have is not a face of the level
    if (corner === undefined) {
      return []
    }

    corners.push(corner)
  }

  return corners
}

/**
 * Reads the faces of an OBJ file.
 *
 * @remarks
 * Only the four lines the mesh needs are read: the places (`v`), the uvs (`vt`), the normals (`vn`) and the faces (`f`).
 * The rest (`g`, `o`, `s`, `usemtl`, `mtllib`, `l`) is left out: the materials are the MTL of TODO 305, and a line of
 * the file is not a face. A face that names something the file does not have is dropped rather than guessed at.
 *
 * @param raw The text of the file.
 *
 * @returns The faces of the file, corner by corner, in the order of the file.
 */
function facesOf(raw: string): ObjCorner[][] {
  const lists: ObjLists = { positions: [], uvs: [], normals: [] }
  const faces: ObjCorner[][] = []

  // a line of the file may be broken with a backslash, the way an OBJ keeps its lines short
  for (const line of raw.replaceAll(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }

    const [command, ...rest] = trimmed.split(/\s+/)

    if (command === 'v') {
      readPlaceOf(rest, lists)

      continue
    }

    if (command === 'vn') {
      readNormalOf(rest, lists)

      continue
    }

    if (command === 'vt') {
      readUvOf(rest, lists)

      continue
    }

    if (command === 'f') {
      const corners = readFaceOf(rest, lists)

      if (corners.length >= 3) {
        faces.push(corners)
      }
    }
  }

  return faces
}

/**
 * The corners a face of the file is cut into: a triangle, a quad, or a quad and the rest of the face.
 *
 * @param face The corners of the face, in the order of the file.
 *
 * @returns The polygons the face makes, each of three or four corners.
 */
function partsOf(face: readonly ObjCorner[]): ObjCorner[][] {
  const parts: ObjCorner[][] = []
  let rest = [...face]

  // the game's polygons have at most four corners: a face with more is cut from its first corner, which keeps the
  // shape of the file where it was flat (a pentagon of a tree stays a quad and a triangle)
  while (rest.length > 4) {
    parts.push(rest.slice(0, 4))

    const [first] = rest
    const restOfFace = rest.slice(3)

    rest = []

    if (first !== undefined) {
      rest = [first, ...restOfFace]
    }
  }

  parts.push(rest)

  return parts
}

/**
 * The four corners of a polygon, in the order the FTS keeps them.
 *
 * @remarks
 * A triangle carries its first corner twice, as its fourth: the game does not read the fourth vertex of a triangle, and
 * the record the editor keeps has four vertices for every face.
 */
type OrderedCorners = readonly [ObjCorner, ObjCorner, ObjCorner, ObjCorner]

/**
 * The corners of a polygon, in the order the FTS keeps them.
 *
 * @remarks
 * The four corners of a quad are **not** a loop in the file: the first two are the ends of one edge and the last two
 * the ends of the opposite one (`a, b, d, c` of the loop of the OBJ), which is the order the blank level writes and the
 * one the two triangles of the mesh read (`a, b, c` and `c, b, d`). A triangle keeps its order, and its fourth vertex is
 * the first one again (the game does not read it).
 *
 * @param part The corners of the polygon, in the order of the file.
 *
 * @returns The corners, in the order of the FTS, or `undefined` when the polygon has no corners.
 */
function orderedOf(part: readonly ObjCorner[]): OrderedCorners | undefined {
  const [first, second, third, fourth] = part

  if (first === undefined || second === undefined || third === undefined) {
    return undefined
  }

  if (fourth === undefined) {
    return [first, second, third, first]
  }

  return [first, second, fourth, third]
}

/**
 * The area of one triangle, in the units of the level.
 *
 * @param a The place of the first corner.
 * @param b The place of the second corner.
 * @param c The place of the third corner.
 *
 * @returns How much surface the three places cover, in the units of the level.
 */
function triangleAreaOf(a: Vector3, b: Vector3, c: Vector3): number {
  return new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).length() / 2
}

/**
 * The area of a polygon, in the units of the level.
 *
 * @param corners The four corners of the polygon, in the order of the FTS (the fourth one is the first again for a
 * triangle).
 *
 * @returns The area of the shape, as the two triangles of it add up.
 */
function areaOf(corners: readonly Vector3[]): number {
  const [a, b, c, d] = corners

  if (a === undefined || b === undefined || c === undefined) {
    return 0
  }

  const first = triangleAreaOf(a, b, c)

  if (d === undefined) {
    return first
  }

  return first + triangleAreaOf(c, b, d)
}

/**
 * A corner of a polygon the import has placed: its place, the normal it draws with, and its uv.
 */
type TurnedCorner = {
  readonly place: Vector3
  readonly normal: ArxVector3
  readonly uv: { readonly u: number; readonly v: number }
}

/**
 * Keeps the front of a polygon on the side its normal points at.
 *
 * @remarks
 * The mirror of the Y turns the winding of every face around, so the polygon the level would get has its **inside** for
 * a front: the game culls by the winding, and the room map draws only the front (`FrontSide`), so a face wound the other
 * way is a hole in the room map that the two sided paint of the level hides. The second and third corner swap when the
 * shape and the normal disagree, which reverses the loop: the front of the polygon is the side its normal points at, the
 * way the faces of the level are (2026-11-26, the owner: the imported mesh showed its inside in the room view).
 *
 * @param corners The corners of the polygon, as the import placed them.
 * @param normal The normal the polygon draws with.
 *
 * @returns The corners, in the order the FTS keeps them.
 */
function frontFacingOf(corners: readonly TurnedCorner[], normal: ArxVector3): TurnedCorner[] {
  const [first, second, third] = corners.map((corner) => {
    return corner.place
  })
  const ordered = [...corners]

  if (first === undefined || second === undefined || third === undefined) {
    return ordered
  }

  const winding = new Vector3()
    .subVectors(second, first)
    .cross(new Vector3().subVectors(third, first))
    .dot(new Vector3(normal.x, normal.y, normal.z))

  if (winding >= 0) {
    return ordered
  }

  const secondCorner = ordered[1]
  const thirdCorner = ordered[2]

  ordered[1] = thirdCorner
  ordered[2] = secondCorner

  return ordered
}

/**
 * Builds the polygons of a mesh from the text of an OBJ file.
 *
 * @remarks
 * The mesh goes to the **origin of the level** (`origin`, which is the scene position), so `0, 0, 0` in the editor is
 * the middle of the file's own origin. The `Y` axis of the file is mirrored, because the game's `Y` points down, and the
 * places are scaled and turned around that origin: the same order the generator's `loadOBJ` uses. The normals are
 * mirrored and turned the same way (the mirror is what the conversion is), and a face the file gives no normal for takes
 * the one its own corners make. The texture is the container the options name (the missing one of the level, see
 * `ImportObj.vue`), and the light of the corners is baked after the step (see `withRevision`).
 *
 * @param raw The text of the OBJ file.
 * @param options How the mesh is put into the level.
 *
 * @returns The polygons of the mesh, in the order of the file.
 */
export function polygonsOfObj(raw: string, options: ObjImportOptions): ArxPolygon[] {
  const rotation = quaternionOf(options.rotation)
  const origin = new Vector3(options.origin.x, options.origin.y, options.origin.z)
  const polygons: ArxPolygon[] = []

  /**
   * Puts a place of the file into the game's space: the mirror of the Y, the scale, the turns and the origin.
   *
   * @param position The place in the file.
   *
   * @returns The place in the game's coordinates.
   */
  function placedOf(position: Vector3): Vector3 {
    return new Vector3(position.x, -position.y, position.z)
      .multiplyScalar(options.scale)
      .applyQuaternion(rotation)
      .add(origin)
  }

  /**
   * Turns a normal of the file into the game's space, the way the places are turned.
   *
   * @param normal The normal, in the space of the file.
   *
   * @returns The normal in the game's space, as the polygon of the level holds it.
   */
  function turnedOf(normal: Vector3): ArxVector3 {
    const turned = new Vector3(normal.x, -normal.y, normal.z).applyQuaternion(rotation).normalize()

    // a plain object: the record of the step goes to the storage as JSON, and a three.js vector would bring its class
    return { x: turned.x, y: turned.y, z: turned.z }
  }

  for (const face of facesOf(raw)) {
    for (const part of partsOf(face)) {
      const isQuad = part.length === 4
      const ordered = orderedOf(part)

      if (ordered === undefined) {
        continue
      }

      const [a, b, c] = ordered

      // a file without `vn` still has faces: the corners of the polygon make the normal of it, in the space of the file
      const faceNormal = new Vector3()
        .subVectors(b.position, a.position)
        .cross(new Vector3().subVectors(c.position, a.position))
        .normalize()
      const turned = ordered.map((corner) => {
        return { place: placedOf(corner.position), normal: turnedOf(corner.normal ?? faceNormal), uv: corner.uv }
      })
      const corners = frontFacingOf(turned, turned[0]?.normal ?? { x: 0, y: 0, z: 1 })
      const places = corners.map((corner) => {
        return corner.place
      })
      let flags = IMPORT_POLYGON_FLAGS

      if (isQuad) {
        flags = flags | ArxPolygonFlags.Quad
      }

      polygons.push({
        vertices: [0, 1, 2, 3].map((index): ArxVertex => {
          const place = places[index]
          const corner = corners[index]

          return { x: place.x, y: place.y, z: place.z, u: corner?.uv.u ?? 0, v: corner?.uv.v ?? 0 }
        }) as ArxPolygon['vertices'],
        textureContainerId: options.textureContainerId,
        norm: corners[0]?.normal ?? { x: 0, y: 0, z: 1 },
        norm2: corners[2]?.normal ?? { x: 0, y: 0, z: 1 },
        normals: [
          corners[0]?.normal ?? { x: 0, y: 0, z: 1 },
          corners[1]?.normal ?? { x: 0, y: 0, z: 1 },
          corners[2]?.normal ?? { x: 0, y: 0, z: 1 },
          corners[3]?.normal ?? { x: 0, y: 0, z: 1 },
        ],
        transval: 0,
        area: areaOf(places),
        flags,
        room: options.room,
      })
    }
  }

  return polygons
}
