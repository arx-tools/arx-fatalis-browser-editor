import { type BufferGeometry, LineSegments, MeshBasicMaterial, WireframeGeometry } from 'three'
import { Color } from '../Color.js'

export function createWireframe(geometry: BufferGeometry): LineSegments {
  return new LineSegments(
    new WireframeGeometry(geometry),
    new MeshBasicMaterial({
      color: Color.white.darken(50).getHex(),
    }),
  )
}
