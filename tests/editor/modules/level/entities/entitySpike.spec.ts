import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { goreTexturesOf } from '../../../../../src/editor/modules/level/entities/entitySpike.ts'

/**
 * A model whose textures are the names given.
 *
 * @param names The file names of the texture containers of the model.
 *
 * @returns The part of an FTL {@link goreTexturesOf} reads.
 */
function modelOf(...names: string[]): { textureContainers: Array<{ filename: string }> } {
  return {
    textureContainers: names.map((filename) => {
      return { filename }
    }),
  }
}

void describe('goreTexturesOf', () => {
  void it('finds the texture of the gore among the textures of the body', () => {
    const gore = goreTexturesOf(modelOf('npc_human_hero_naked_body.bmp', 'npc_gore.bmp'))

    assert.deepEqual([...(gore ?? [])], [1])
  })

  void it('finds every texture of the gore', () => {
    // the model of a spider carries two of them, and the game hides all the faces of the name
    const gore = goreTexturesOf(modelOf('npc_gore.bmp', 'npc_spider_body.bmp', '[blood]_gore_spider.jpg'))

    const found = [...(gore ?? [])].toSorted((a, b) => {
      return a - b
    })

    assert.deepEqual(found, [0, 2])
  })

  void it('matches the name without its case', () => {
    assert.deepEqual([...(goreTexturesOf(modelOf('NPC_GORE.BMP')) ?? [])], [0])
  })

  void it('gives nothing when the model has no gore', () => {
    assert.equal(goreTexturesOf(modelOf('npc_human_hero_naked_body.bmp')), undefined)
  })
})
