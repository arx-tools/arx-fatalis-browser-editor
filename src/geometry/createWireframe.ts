import { Color } from '@src/Color.js'
import { type BufferGeometry, LineSegments, MeshBasicMaterial, WireframeGeometry } from 'three'

export function createWireframe(geometry: BufferGeometry): LineSegments {
  return new LineSegments(
    new WireframeGeometry(geometry),
    new MeshBasicMaterial({
      color: Color.white.darken(50).getHex(),
    }),
  )
}
