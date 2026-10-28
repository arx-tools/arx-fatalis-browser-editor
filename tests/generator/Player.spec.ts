import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxDLF, ArxRotation, ArxVector3 } from 'arx-convert/types'
import { Player } from '../../src/generator/Player.ts'

/**
 * The spawn of the test level.
 */
interface Spawn {
  /**
   * The `posEdit` of the level.
   */
  readonly position: ArxVector3
  /**
   * The `angleEdit` of the level.
   */
  readonly orientation: ArxRotation
}

/**
 * A DLF of the test: only the header's player matters for the {@link Player}.
 *
 * @param spawn The spawn the level should have.
 *
 * @returns The DLF, with everything else left out.
 */
function dlfOf(spawn: Spawn): ArxDLF {
  return { header: { player: spawn } } as unknown as ArxDLF
}

void describe('Player', () => {
  void it('takes the position of the DLF', () => {
    const spawn: Spawn = { position: { x: -1716.36, y: 384.4, z: 5227.66 }, orientation: { a: 0, b: 0, g: 0 } }
    const player = new Player(dlfOf(spawn))

    assert.deepEqual(player.position, spawn.position)
  })

  void it('takes the orientation of the DLF', () => {
    const spawn: Spawn = { position: { x: 0, y: 0, z: 0 }, orientation: { a: 22.54, b: 104.52, g: 0 } }
    const player = new Player(dlfOf(spawn))

    assert.deepEqual(player.orientation, spawn.orientation)
  })

  void it('exposes the values the DLF holds', () => {
    const dlf = dlfOf({ position: { x: 1, y: 2, z: 3 }, orientation: { a: 0, b: 90, g: 0 } })
    const player = new Player(dlf)

    assert.equal(player.position, dlf.header.player.position)
    assert.equal(player.orientation, dlf.header.player.orientation)
  })
})
