import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { type BufferAttribute, Quaternion, Vector3, type BufferGeometry, type Mesh } from 'three'
import { arxVector3toVector3 } from '../meshes.ts'

/**
 * What the transforms of a level write: the polygons of the model and the two geometry buffers that follow them.
 *
 * @remarks
 * The methods of `ArxMap` hand the map itself in as the target: the fields are public, and the module is the one the
 * heap of the walk lives in. The transforms do not touch the index of the welded vertices; the caller drops it.
 */
export type TransformTarget = {
  readonly polygons: readonly ArxPolygon[]
  readonly scenePosition: ArxVector3
  readonly solidMeshes: readonly Mesh[]
  readonly wireframeGeometry: BufferGeometry
}

/**
 * A turn of the corners of faces: the point it turns around, the axis and the angle.
 */
export type PolygonTurn = {
  readonly angle: number
  readonly axis: ArxVector3
  readonly pivot: ArxVector3
}

/**
 * The smallest magnitude a scale factor a drag gives the faces may take.
 *
 * @remarks
 * A scale of zero collapses the corners onto the pivot, and no step brings them back: the step of a scale undoes it by
 * the inverse of the factors. Five percent is small enough to read as a line, and far enough from it to invert.
 */
export const MIN_SCALE_FACTOR = 0.05

/**
 * Reads a coordinate scaled around a pivot.
 *
 * @param value The coordinate to scale.
 * @param pivot The point of the scale it moves away from.
 * @param factor How far it moves.
 *
 * @returns The coordinate after the scale.
 */
function scaleAround(value: number, pivot: number, factor: number): number {
  const offset = value - pivot
  const scaled = offset * factor

  return pivot + scaled
}

/**
 * Writes the normal of a corner of the solid mesh, scaled and normalized.
 *
 * @remarks
 * The normals of the mesh follow the inverse of the scale factors, so a face squashed on one axis keeps the light of
 * the shape it has.
 *
 * @param normals The normal attribute of the geometry.
 * @param at The corner, by its index in the attribute.
 * @param inverse The inverse of the scale factors, which is what the normal takes.
 */
function writeScaledNormalOf(normals: BufferAttribute, at: number, inverse: Vector3): void {
  const nx = normals.getX(at) * inverse.x
  const ny = normals.getY(at) * inverse.y
  const nz = normals.getZ(at) * inverse.z
  const length = Math.hypot(nx, ny, nz)

  if (length > 0) {
    normals.setXYZ(at, nx / length, ny / length, nz / length)
  }
}

/**
 * Keeps a scale factor away from zero.
 *
 * @param factor The factor of the gesture.
 *
 * @returns The factor, with its magnitude at least {@link MIN_SCALE_FACTOR}.
 */
function scaleOf(factor: number): number {
  if (!Number.isFinite(factor)) {
    return 1
  }

  let sign = 1

  if (factor < 0) {
    sign = -1
  }

  return sign * Math.max(MIN_SCALE_FACTOR, Math.abs(factor))
}

/**
 * The normal of every corner of a face, as the model holds them.
 *
 * @remarks
 * The level has three kinds of them: the normal of the face, the one of its second pair of corners (a face of a curve
 * has two), and the four the file stores. They are what the model keeps, and a turn has to write all of them.
 *
 * @param polygon The face to read.
 *
 * @returns The normals of the corners, in the vectors of the polygon.
 */
function normalsOf(polygon: ArxPolygon): ArxVector3[] {
  const normals = [polygon.norm, polygon.norm2]

  for (const normal of polygon.normals ?? []) {
    normals.push(normal)
  }

  return normals
}

/**
 * Moves the corners of faces by an offset.
 *
 * @remarks
 * The vertices of the polygons are the model every reader uses (the export, the picking, the wireframe), and the
 * positions of the meshes follow **in place**: a drag runs this on every frame, so the geometry is not built again
 * (a build of the big level is ~260 ms). A face owns three corners in the solid geometry (six for the two triangles of
 * a quad) and two per edge in the wireframe, and the polygons are in the order the geometry was built with.
 *
 * The tree of the picking is **refitted**, not built again: the moved faces are the only boxes that changed, and the
 * topology of the tree is the same. The index of the welded vertices is dropped: a move can break the weld of the
 * level, and the next drag or fill builds it from the positions.
 *
 * The delta is in the coordinates of the level (the game's), and the buffers are the mirrored scene
 * ({@link arxVector3toVector3}), so the buffer takes the mirrored delta.
 *
 * @param target The polygons and the buffers of the level.
 * @param faces The faces to move, by their index in {@link polygons}.
 * @param delta The offset of their corners, in the coordinates of the level.
 */
export function translatePolygonsOf(target: TransformTarget, faces: readonly number[], delta: ArxVector3): boolean {
  const moved = new Set(faces)
  const solid = target.solidMeshes[0]

  if (solid === undefined || moved.size === 0) {
    return false
  }

  const positions = solid.geometry.getAttribute('position') as BufferAttribute
  const wirePositions = target.wireframeGeometry.getAttribute('position') as BufferAttribute
  const bufferDelta = arxVector3toVector3(delta)
  let solidOffset = 0
  let wireOffset = 0

  for (let index = 0; index < target.polygons.length; index++) {
    const polygon = target.polygons[index]
    const quad = isQuad(polygon)
    let solidCount = 3
    let wireCount = 6
    let corners = 3

    if (quad) {
      solidCount = 6
      wireCount = 8
      corners = 4
    }

    if (moved.has(index)) {
      for (let corner = 0; corner < corners; corner++) {
        const vertex = polygon.vertices[corner]

        if (vertex !== undefined) {
          vertex.x = vertex.x + delta.x
          vertex.y = vertex.y + delta.y
          vertex.z = vertex.z + delta.z
        }
      }

      for (let vertex = 0; vertex < solidCount; vertex++) {
        const at = solidOffset + vertex
        positions.setXYZ(
          at,
          positions.getX(at) + bufferDelta.x,
          positions.getY(at) + bufferDelta.y,
          positions.getZ(at) + bufferDelta.z,
        )
      }

      for (let vertex = 0; vertex < wireCount; vertex++) {
        const at = wireOffset + vertex
        wirePositions.setXYZ(
          at,
          wirePositions.getX(at) + bufferDelta.x,
          wirePositions.getY(at) + bufferDelta.y,
          wirePositions.getZ(at) + bufferDelta.z,
        )
      }
    }

    solidOffset = solidOffset + solidCount
    wireOffset = wireOffset + wireCount
  }

  positions.needsUpdate = true
  wirePositions.needsUpdate = true
  solid.geometry.boundsTree?.refit()
  solid.geometry.computeBoundingSphere()
  target.wireframeGeometry.computeBoundingSphere()
  return true
}

/**
 * Turns the corners of faces around a point.
 *
 * @remarks
 * The same walk as {@link translatePolygons}, with a turn instead of an offset: the vertices of the polygons are the
 * model every reader uses, and the positions and the normals of the meshes follow **in place** (a drag runs this on
 * every frame, so the geometry is not built again). The **normals** turn with the corners, because the light of the
 * face is what the normals say: a face turned away from a lamp that kept its normal would be lit as if it did not
 * move.
 *
 * The turn of the model is in the coordinates of the level; the buffers are the mirrored scene
 * ({@link arxVector3toVector3}), where the same turn has the mirrored axis and the mirrored pivot — the mirror is a
 * half turn around Z, so the angle stays. The tree of the picking is refitted and the index of the welded vertices is
 * dropped, the way a move does it.
 *
 * @param target The polygons and the buffers of the level.
 * @param faces The faces to turn, by their index in {@link polygons}.
 * @param turn The pivot, the axis and the angle of the turn.
 */
export function rotatePolygonsOf(target: TransformTarget, faces: readonly number[], turn: PolygonTurn): boolean {
  const { angle, axis, pivot } = turn
  const turned = new Set(faces)
  const solid = target.solidMeshes[0]

  if (solid === undefined || turned.size === 0) {
    return false
  }

  if (angle === 0) {
    return false
  }

  const levelAxis = new Vector3(axis.x, axis.y, axis.z).normalize()

  if (levelAxis.lengthSq() === 0) {
    return false
  }

  const positions = solid.geometry.getAttribute('position') as BufferAttribute
  const normals = solid.geometry.getAttribute('normal') as BufferAttribute
  const wirePositions = target.wireframeGeometry.getAttribute('position') as BufferAttribute
  const levelPivot = new Vector3(pivot.x, pivot.y, pivot.z)
  const levelTurn = new Quaternion().setFromAxisAngle(levelAxis, angle)
  const sceneTurn = new Quaternion().setFromAxisAngle(arxVector3toVector3(levelAxis).normalize(), angle)
  const scenePivot = arxVector3toVector3(pivot).sub(arxVector3toVector3(target.scenePosition))
  const point = new Vector3()
  const direction = new Vector3()
  let solidOffset = 0
  let wireOffset = 0

  for (let index = 0; index < target.polygons.length; index++) {
    const polygon = target.polygons[index]
    const quad = isQuad(polygon)
    let solidCount = 3
    let wireCount = 6
    let corners = 3

    if (quad) {
      solidCount = 6
      wireCount = 8
      corners = 4
    }

    if (turned.has(index)) {
      for (let corner = 0; corner < corners; corner++) {
        const vertex = polygon.vertices[corner]

        if (vertex !== undefined) {
          point.set(vertex.x, vertex.y, vertex.z).sub(levelPivot).applyQuaternion(levelTurn).add(levelPivot)
          vertex.x = point.x
          vertex.y = point.y
          vertex.z = point.z
        }
      }

      for (const normal of normalsOf(polygon)) {
        direction.set(normal.x, normal.y, normal.z).applyQuaternion(levelTurn)
        normal.x = direction.x
        normal.y = direction.y
        normal.z = direction.z
      }

      for (let vertex = 0; vertex < solidCount; vertex++) {
        const at = solidOffset + vertex

        point
          .set(positions.getX(at), positions.getY(at), positions.getZ(at))
          .sub(scenePivot)
          .applyQuaternion(sceneTurn)
          .add(scenePivot)
        positions.setXYZ(at, point.x, point.y, point.z)

        direction.set(normals.getX(at), normals.getY(at), normals.getZ(at)).applyQuaternion(sceneTurn)
        normals.setXYZ(at, direction.x, direction.y, direction.z)
      }

      for (let vertex = 0; vertex < wireCount; vertex++) {
        const at = wireOffset + vertex

        point
          .set(wirePositions.getX(at), wirePositions.getY(at), wirePositions.getZ(at))
          .sub(scenePivot)
          .applyQuaternion(sceneTurn)
          .add(scenePivot)
        wirePositions.setXYZ(at, point.x, point.y, point.z)
      }
    }

    solidOffset = solidOffset + solidCount
    wireOffset = wireOffset + wireCount
  }

  positions.needsUpdate = true
  normals.needsUpdate = true
  wirePositions.needsUpdate = true
  solid.geometry.boundsTree?.refit()
  solid.geometry.computeBoundingSphere()
  target.wireframeGeometry.computeBoundingSphere()
  return true
}

/**
 * Scales the corners of faces around a point.
 *
 * @remarks
 * The third of the gestures of a selection, after {@link translatePolygons} and {@link rotatePolygons}: the corners
 * move away from the pivot along the three axes by the factors of `scale`, and the **normals** follow the inverse of
 * the factors (`n / s`, normalized), which is what a non-uniform scale asks of them — a face squashed on one axis
 * would otherwise keep the light of the shape it had.
 *
 * The model scales in the coordinates of the level, and the buffers are the mirrored scene, where the same factors
 * scale the same axes: the mirror flips the sign of two of them, and a factor is a length, not a direction. A factor
 * near zero is held at {@link MIN_SCALE_FACTOR}, so a step can always be undone.
 *
 * @param target The polygons and the buffers of the level.
 * @param faces The faces to scale, by their index in {@link polygons}.
 * @param pivot The point they scale around, in the coordinates of the level.
 * @param scale How far the corners move along the three axes, around 1.
 */
export function scalePolygonsOf(
  target: TransformTarget,
  faces: readonly number[],
  pivot: ArxVector3,
  scale: ArxVector3,
): boolean {
  const scaled = new Set(faces)
  const solid = target.solidMeshes[0]

  if (solid === undefined || scaled.size === 0) {
    return false
  }

  const factors = { x: scaleOf(scale.x), y: scaleOf(scale.y), z: scaleOf(scale.z) }

  if (factors.x === 1 && factors.y === 1 && factors.z === 1) {
    return false
  }

  const positions = solid.geometry.getAttribute('position') as BufferAttribute
  const normals = solid.geometry.getAttribute('normal') as BufferAttribute
  const wirePositions = target.wireframeGeometry.getAttribute('position') as BufferAttribute
  const levelPivot = new Vector3(pivot.x, pivot.y, pivot.z)
  const scenePivot = arxVector3toVector3(pivot).sub(arxVector3toVector3(target.scenePosition))
  const levelInverse = new Vector3(1 / factors.x, 1 / factors.y, 1 / factors.z)
  let solidOffset = 0
  let wireOffset = 0

  for (let index = 0; index < target.polygons.length; index++) {
    const polygon = target.polygons[index]
    const quad = isQuad(polygon)
    let solidCount = 3
    let wireCount = 6
    let corners = 3

    if (quad) {
      solidCount = 6
      wireCount = 8
      corners = 4
    }

    if (scaled.has(index)) {
      for (let corner = 0; corner < corners; corner++) {
        const vertex = polygon.vertices[corner]

        if (vertex !== undefined) {
          vertex.x = scaleAround(vertex.x, levelPivot.x, factors.x)
          vertex.y = scaleAround(vertex.y, levelPivot.y, factors.y)
          vertex.z = scaleAround(vertex.z, levelPivot.z, factors.z)
        }
      }

      for (const normal of normalsOf(polygon)) {
        const nx = normal.x * levelInverse.x
        const ny = normal.y * levelInverse.y
        const nz = normal.z * levelInverse.z
        const length = Math.hypot(nx, ny, nz)

        if (length > 0) {
          normal.x = nx / length
          normal.y = ny / length
          normal.z = nz / length
        }
      }

      for (let vertex = 0; vertex < solidCount; vertex++) {
        const at = solidOffset + vertex

        positions.setXYZ(
          at,
          scaleAround(positions.getX(at), scenePivot.x, factors.x),
          scaleAround(positions.getY(at), scenePivot.y, factors.y),
          scaleAround(positions.getZ(at), scenePivot.z, factors.z),
        )

        writeScaledNormalOf(normals, at, levelInverse)
      }

      for (let vertex = 0; vertex < wireCount; vertex++) {
        const at = wireOffset + vertex

        wirePositions.setXYZ(
          at,
          scaleAround(wirePositions.getX(at), scenePivot.x, factors.x),
          scaleAround(wirePositions.getY(at), scenePivot.y, factors.y),
          scaleAround(wirePositions.getZ(at), scenePivot.z, factors.z),
        )
      }
    }

    solidOffset = solidOffset + solidCount
    wireOffset = wireOffset + wireCount
  }

  positions.needsUpdate = true
  normals.needsUpdate = true
  wirePositions.needsUpdate = true
  solid.geometry.boundsTree?.refit()
  solid.geometry.computeBoundingSphere()
  target.wireframeGeometry.computeBoundingSphere()
  return true
}
