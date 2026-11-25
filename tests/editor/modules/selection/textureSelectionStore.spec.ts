import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { textureKeyOf, textureSelectionStore } from '../../../../src/editor/modules/selection/textureSelectionStore.ts'

void describe('textureKeyOf', () => {
  void it('keeps the source, and drops the extension the way the catalog does', () => {
    assert.equal(textureKeyOf({ source: 'arx', name: '[stone]_Wall.BMP' }), 'arx:[stone]_wall')
    assert.equal(textureKeyOf({ source: 'custom', name: 'jorge-[stone].jpg' }), 'custom:jorge-[stone]')
  })

  void it('tells the two sources of one name apart', () => {
    assert.notEqual(
      textureKeyOf({ source: 'arx', name: 'wall.bmp' }),
      textureKeyOf({ source: 'custom', name: 'wall.bmp' }),
    )
  })
})

void describe('textureSelectionStore', () => {
  void it('takes the pick, and drops it', () => {
    const texture = { source: 'arx' as const, name: '[stone]_wall.bmp' }

    textureSelectionStore.select(texture)
    assert.equal(textureSelectionStore.texture.value, texture)

    textureSelectionStore.clear()
    assert.equal(textureSelectionStore.texture.value, undefined)
  })
})
