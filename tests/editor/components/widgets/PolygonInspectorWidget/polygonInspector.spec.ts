import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import {
  flagNamesOf,
  inspectorRows,
} from '../../../../../src/editor/components/widgets/PolygonInspectorWidget/polygonInspector.ts'

/**
 * A polygon of the test: a flat quad with a known area and room.
 *
 * @param flags The flag bits of the polygon.
 *
 * @returns The polygon, as the FTS stores it.
 */
function polygon(flags: number): ArxPolygon {
  const normal = { x: 0, y: 1, z: 0 }

  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 10, y: 0, z: 0, u: 1, v: 0 },
      { x: 10, y: 0, z: 10, u: 1, v: 1 },
      { x: 0, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId: 7,
    norm: normal,
    norm2: normal,
    transval: 0,
    area: 1234.4,
    flags,
    room: 3,
  }
}

void describe('inspectorRows', () => {
  void it('shows a dash for every row when the ray hits nothing', () => {
    const rows = inspectorRows(undefined)

    assert.deepEqual(
      rows.map((row) => {
        return row.label
      }),
      ['Index', 'Shape', 'Texture', 'Area', 'Room', 'Flags'],
    )
    assert.deepEqual(
      rows.filter((row) => {
        return row.value !== '—'
      }),
      [],
    )
  })

  void it('describes the face under the crosshair', () => {
    const rows = inspectorRows({
      index: 1276,
      polygon: polygon(ArxPolygonFlags.Quad),
      textureName: '[stone]_human_wall1.bmp',
    })

    assert.deepEqual(rows, [
      { label: 'Index', value: '1276' },
      { label: 'Shape', value: 'Quad' },
      { label: 'Texture', value: '[stone]_human_wall1.bmp' },
      { label: 'Area', value: '1 234' },
      { label: 'Room', value: '3' },
      { label: 'Flags', value: 'None' },
    ])
  })

  void it('knows a triangle from a quad by its flags', () => {
    const rows = inspectorRows({
      index: 1,
      polygon: polygon(ArxPolygonFlags.None),
      textureName: undefined,
    })

    assert.deepEqual(
      rows.filter((row) => {
        return row.label === 'Shape'
      }),
      [{ label: 'Shape', value: 'Triangle' }],
    )
  })

  void it('falls back to the id of a texture the level does not name', () => {
    const rows = inspectorRows({
      index: 1,
      polygon: polygon(ArxPolygonFlags.Quad),
      textureName: undefined,
    })

    assert.deepEqual(
      rows.filter((row) => {
        return row.label === 'Texture'
      }),
      [{ label: 'Texture', value: '#7' }],
    )
  })

  void it('writes the flags of the face, but not the shape', () => {
    const rows = inspectorRows({
      index: 1,
      polygon: polygon(ArxPolygonFlags.Quad | ArxPolygonFlags.DoubleSided | ArxPolygonFlags.Transparent),
      textureName: 'a.bmp',
    })

    assert.deepEqual(
      rows.filter((row) => {
        return row.label === 'Flags'
      }),
      [{ label: 'Flags', value: 'DoubleSided, Transparent' }],
    )
  })
})

void describe('flagNamesOf', () => {
  void it('gives nothing for a face without flags', () => {
    assert.deepEqual(flagNamesOf(ArxPolygonFlags.None), [])
  })

  void it('names every flag that is set', () => {
    assert.deepEqual(flagNamesOf(ArxPolygonFlags.DoubleSided | ArxPolygonFlags.NoShadow), ['NoShadow', 'DoubleSided'])
  })

  void it('leaves the shape out: a quad is not a property of the list', () => {
    assert.deepEqual(flagNamesOf(ArxPolygonFlags.Quad), [])
  })

  void it('keeps the order of the flag list, whatever order the bits were set in', () => {
    const one = flagNamesOf(ArxPolygonFlags.Transparent | ArxPolygonFlags.Water | ArxPolygonFlags.NoShadow)
    const other = flagNamesOf(ArxPolygonFlags.NoShadow | ArxPolygonFlags.Transparent | ArxPolygonFlags.Water)

    assert.deepEqual(one, ['NoShadow', 'Transparent', 'Water'])
    assert.deepEqual(one, other)
  })
})
