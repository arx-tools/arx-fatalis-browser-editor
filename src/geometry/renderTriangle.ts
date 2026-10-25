import { BufferAttribute, BufferGeometry, type Triangle, WireframeGeometry } from 'three'

export function createTriangle(triangle: Triangle): BufferGeometry {
  const geometry = new BufferGeometry()

  // prettier-ignore
  const vertices = new Float32Array([
    ...triangle.a,
    ...triangle.b,
    ...triangle.c
  ])

  geometry.setAttribute('position', new BufferAttribute(vertices, 3))

  return new WireframeGeometry(geometry)
}
