import { Vector3, type BufferGeometry, type Face } from 'three'

export function getVerticesByFace(face: Face, geometry: BufferGeometry): Vector3[] {
  const vertices = geometry.getAttribute('position')

  const a = new Vector3(vertices.getX(face.a), vertices.getY(face.a), vertices.getZ(face.a))
  const b = new Vector3(vertices.getX(face.b), vertices.getY(face.b), vertices.getZ(face.b))
  const c = new Vector3(vertices.getX(face.c), vertices.getY(face.c), vertices.getZ(face.c))

  return [a, b, c]
}
