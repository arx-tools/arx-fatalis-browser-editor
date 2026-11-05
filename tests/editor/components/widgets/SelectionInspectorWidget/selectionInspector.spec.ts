import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import {
  selectionSummaryOf,
  type SelectionInput,
} from '../../../../../src/editor/components/widgets/SelectionInspectorWidget/selectionInspector.ts'
import type { TextureGroup } from '../../../../../src/editor/modules/textures/search.ts'

/**
 * A triangle of the test, on the given texture container.
 *
 * @param textureContainerId The container the face draws with.
 *
 * @returns The polygon.
 */
function triangle(textureContainerId: number): ArxPolygon {
  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 1, y: 0, z: 0, u: 1, v: 0 },
      { x: 1, y: 0, z: 1, u: 1, v: 1 },
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
    ],
    textureContainerId,
    norm: { x: 0, y: 1, z: 0 },
    norm2: { x: 0, y: 1, z: 0 },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.None,
    room: 1,
  }
}

/**
 * The containers of the test level, by their id.
 */
const containers = new Map<number, string>([
  [1, '[stone]_wall1.bmp'],
  [2, '[wood]_door.bmp'],
  [7, 'custom-wall.png'],
  [9, 'nowhere.png'],
])

/**
 * The group of the textures of the test: the walls are the game's surfaces, the dropped one is the level's, and
 * `nowhere.png` is not found (a texture of a level the data directory does not have).
 */
const groups = new Map<string, TextureGroup>([
  ['[stone]_wall1.bmp', 'arx-materials'],
  ['[wood]_door.bmp', 'arx-materials'],
  ['custom-wall.png', 'custom'],
])

/**
 * Builds the input of the summary.
 *
 * @param faces The indices of the selected polygons.
 * @param polygons Every polygon of the level.
 *
 * @returns The input of the summary, read against the containers of the test level.
 */
function input(faces: readonly number[], polygons: readonly ArxPolygon[]): SelectionInput {
  return {
    faces,
    polygons,
    textureNameOf: (id): string | undefined => {
      return containers.get(id)
    },
    groupOfName: (name): TextureGroup | undefined => {
      return groups.get(name)
    },
  }
}

void describe('selectionSummaryOf', () => {
  void it('counts the selected faces, the way the statistics widget did', () => {
    const polygons = [triangle(1), triangle(1), triangle(2)]
    const summary = selectionSummaryOf(input([0, 1, 2], polygons))

    assert.deepEqual(summary.rows, [
      { label: 'Selected faces', value: '3' },
      { label: 'Textures', value: '2' },
    ])
    assert.equal(summary.count, 3)
    assert.equal(summary.textureCount, 2)
  })

  void it('groups the textures by where they come from', () => {
    const polygons = [triangle(1), triangle(1), triangle(2), triangle(7)]
    const summary = selectionSummaryOf(input([0, 1, 2, 3], polygons))

    assert.deepEqual(
      summary.groups.map((group) => {
        return { source: group.source, label: group.label, faces: group.faces, textures: group.textures }
      }),
      [
        {
          source: 'arx-materials',
          label: 'Arx Fatalis materials',
          faces: 3,
          textures: [
            { name: '[stone]_wall1.bmp', count: 2 },
            { name: '[wood]_door.bmp', count: 1 },
          ],
        },
        { source: 'custom', label: 'Custom', faces: 1, textures: [{ name: 'custom-wall.png', count: 1 }] },
      ],
    )
  })

  void it('puts a texture no source has into the missing group', () => {
    const summary = selectionSummaryOf(input([0], [triangle(9)]))

    assert.deepEqual(
      summary.groups.map((group) => {
        return { source: group.source, label: group.label, faces: group.faces }
      }),
      [{ source: 'missing', label: 'Missing', faces: 1 }],
    )
  })

  void it('names a face without a container', () => {
    const summary = selectionSummaryOf(input([0], [triangle(404)]))

    assert.deepEqual(summary.groups[0]?.textures, [{ name: '(no texture)', count: 1 }])
  })

  void it('keeps the order of the groups, whatever the faces are', () => {
    const summary = selectionSummaryOf(input([0, 1, 2], [triangle(9), triangle(7), triangle(1)]))

    assert.deepEqual(
      summary.groups.map((group) => {
        return group.source
      }),
      ['arx-materials', 'custom', 'missing'],
    )
  })

  void it('skips a selected index the level does not have', () => {
    const summary = selectionSummaryOf(input([0, 5], [triangle(1)]))

    assert.equal(summary.count, 1)
    assert.deepEqual(summary.rows[0], { label: 'Selected faces', value: '1' })
  })

  void it('shows nothing for an empty selection, and the rows still line up', () => {
    const summary = selectionSummaryOf(input([], []))

    assert.deepEqual(summary.rows, [
      { label: 'Selected faces', value: '0' },
      { label: 'Textures', value: '0' },
    ])
    assert.deepEqual(summary.groups, [])
  })
})
