import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MATERIAL_ALIASES,
  materialLabelOf,
  materialOf,
  TEXTURE_MATERIALS,
  textureKindOf,
} from '../../../../src/editor/modules/textures/material.ts'

void describe('materialOf', () => {
  void it('reads the material of a surface from the bracketed word of its name', () => {
    assert.equal(materialOf('[stone]_human_wall1.bmp'), 'stone')
    assert.equal(materialOf('[wood]-fake-floor.jpg'), 'wood')
    assert.equal(materialOf('[wet]_ground.bmp'), 'wet')
    assert.equal(materialOf('[sand]_floor.bmp'), 'gravel')
    assert.equal(materialOf('[iron]_gate.bmp'), 'metal')
    assert.equal(materialOf('[ice]_cave.bmp'), 'ice')
    assert.equal(materialOf('[moss]_wall.bmp'), 'carpet')
  })

  void it('knows the aliases of the game: a rock and a marble are stone, a shit is wet', () => {
    assert.equal(materialOf('[rock]_wall1.bmp'), 'stone')
    assert.equal(materialOf('[marble]_floor.bmp'), 'stone')
    assert.equal(materialOf('[mud]_puddle.png'), 'wet')
    assert.equal(materialOf('[blood]_splat.bmp'), 'wet')
    assert.equal(materialOf('[shit]_pile.bmp'), 'wet')
    assert.equal(materialOf('[dust]_fire_dust.bmp'), 'gravel')
    assert.equal(materialOf('[glass]_human_stained_glass_window.jpg'), 'metal')
    assert.equal(materialOf('(fabric)_gobelin_bed.jpg'), 'carpet')
    assert.equal(materialOf('(fabrics)_straw_mattress.bmp'), 'carpet')
  })

  void it('takes the first alias of the name, the way the game does', () => {
    // the game walks its table in order, so a stone with moss on it is stone and not carpet
    assert.equal(materialOf('[stone]_moss_wall.bmp'), 'stone')
    assert.equal(materialOf('[marble]_wood_crate.bmp'), 'stone')
  })

  void it('reads a material from the brackets only, not from the letters of the name', () => {
    // an item is not a surface: the game's function would find the word in `item_stone_riddle.jpg`, the editor does not
    assert.equal(materialOf('item_stone_riddle.jpg'), 'unknown')
    assert.equal(materialOf('aliciaroom_mur02.jpg'), 'unknown')
    assert.equal(materialOf('(fx)_armor.jpg'), 'unknown')
    assert.equal(materialOf('[wall]_stone_floor.bmp'), 'unknown')
  })

  void it('ignores the case of the name', () => {
    assert.equal(materialOf('[STONE]_Wall.BMP'), 'stone')
  })

  void it('says unknown for a name without an alias', () => {
    assert.equal(materialOf('nothing_here.bmp'), 'unknown')
    assert.equal(materialOf('jorge-[stone].jpg'), 'stone')
  })
})

void describe('textureKindOf', () => {
  void it('calls a surface a material and an item an item', () => {
    assert.equal(textureKindOf('[stone]_human_wall1.bmp'), 'material')
    assert.equal(textureKindOf('(fabric)_gobelin_bed.jpg'), 'material')
    assert.equal(textureKindOf('jorge-[stone].jpg'), 'material')
    assert.equal(textureKindOf('item_stone_riddle.jpg'), 'item')
    assert.equal(textureKindOf('item_amulet_red.bmp'), 'item')
    assert.equal(textureKindOf('aliciaroom_mur02.jpg'), 'item')
  })
})

void describe('the table of the materials', () => {
  void it('names every material once, and the unknown one not at all', () => {
    const named = MATERIAL_ALIASES.map((row) => {
      return row.material
    })

    assert.deepEqual(
      named,
      TEXTURE_MATERIALS.filter((material) => {
        return material !== 'unknown'
      }),
    )
  })

  void it('has an alias for every material', () => {
    assert.deepEqual(
      MATERIAL_ALIASES.filter((row) => {
        return row.aliases.length === 0
      }),
      [],
    )
  })

  void it('writes the name of a material for the user interface', () => {
    assert.equal(materialLabelOf('stone'), 'Stone')
    assert.equal(materialLabelOf('unknown'), 'Unknown')
  })
})
