import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Color } from 'three'
import { createRoomOverlay } from '../../../../../src/editor/components/widgets/shared/roomOverlay.ts'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * Builds the blank level of the editor, whose faces are all in room 1.
 *
 * @returns The level, ready to be read.
 */
function mapOf(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * Reads the colour of a vertex of the room map.
 *
 * @param map The level to read.
 * @param vertex The index of the vertex.
 *
 * @returns The colour the map gives that vertex.
 */
function colorOf(map: ArxMap, vertex: number): Color {
  const attribute = map.solidMeshes[0].geometry.getAttribute('color')

  return new Color(attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex))
}

/**
 * Tells whether a colour is not brighter than another one, channel by channel.
 *
 * @param first The colour to read.
 * @param second The colour it is compared to.
 *
 * @returns True when no channel of the first is above the second.
 */
function isNoBrighter(first: Color, second: Color): boolean {
  return first.r <= second.r && first.g <= second.g && first.b <= second.b
}

void describe('createRoomOverlay', () => {
  void it('dims every room by default, and brightens the highlighted ones', () => {
    const map = mapOf()
    const overlay = createRoomOverlay(map, 'arx:1')

    // the map starts dark: the first vertex is the dimmed colour of room 1
    const dimmed = colorOf(map, 0)

    // the room in the highlight keeps its full colour
    overlay.setHighlight(new Set([1]))

    const full = colorOf(map, 0)

    assert.ok(isNoBrighter(dimmed, full))
    assert.ok(dimmed.r < full.r || dimmed.g < full.g || dimmed.b < full.b)

    // an empty highlight dims the room again
    overlay.setHighlight(new Set())

    const dimmedAgain = colorOf(map, 0)

    assert.deepEqual([dimmedAgain.r, dimmedAgain.g, dimmedAgain.b], [dimmed.r, dimmed.g, dimmed.b])
  })
})
