import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import {
  categoryOf,
  entityRowsOf,
  entitySectionsOf,
  searchRows,
} from '../../../../../src/editor/modules/level/entities/entityRows.ts'

/**
 * Builds the part of a level the list reads: the interactive objects of the DLF.
 *
 * @param objects The name, identifier pairs the level carries.
 *
 * @returns A level with those entities.
 */
function mapWith(objects: ReadonlyArray<readonly [string, number]>): ArxMap {
  return {
    dlf: {
      interactiveObjects: objects.map(([name, identifier]) => {
        return { name, identifier, position: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } }
      }),
    },
  } as unknown as ArxMap
}

void describe('categoryOf', () => {
  void it('reads the first segment of the name', () => {
    assert.strictEqual(categoryOf('fix_inter/light_door'), 'fix_inter')
    assert.strictEqual(categoryOf('items/provisions/pie'), 'items')
    assert.strictEqual(categoryOf('npc/goblin_base'), 'npc')
  })

  void it('has no category for a name the game does not use', () => {
    // the game works with the five folders, so a name outside them is not an entity the list can place
    assert.strictEqual(categoryOf('weird/thing'), undefined)
    assert.strictEqual(categoryOf('light_door'), undefined)
  })
})

void describe('entityRowsOf', () => {
  void it('lists the entities in the order of the categories and their identifiers', () => {
    const rows = entityRowsOf(
      mapWith([
        ['npc/goblin_base', 56],
        ['fix_inter/light_door', 113],
        ['items/provisions/pie', 3],
        ['fix_inter/door', 7],
      ]),
    )

    assert.deepStrictEqual(
      rows.map((row) => {
        return `${row.category}/${row.kind}#${String(row.identifier)}`
      }),
      ['fix_inter/door#7', 'fix_inter/light_door#113', 'items/pie#3', 'npc/goblin_base#56'],
    )
  })

  void it('keeps the last segment of a deep name as the kind', () => {
    const rows = entityRowsOf(mapWith([['items/provisions/pie', 3]]))

    assert.strictEqual(rows[0]?.kind, 'pie')
    assert.strictEqual(rows[0]?.name, 'items/provisions/pie')
  })

  void it('carries the place of the entity, so the list can jump to it', () => {
    const rows = entityRowsOf(mapWith([['system/marker', 17]]))

    assert.deepStrictEqual(rows[0]?.position, { x: 0, y: 0, z: 0 })
  })

  void it('sorts the rows of a folder by the name of the entity', () => {
    // the owner reads a folder by name (2026-11-22): the kinds in the alphabetical order, the numbers inside a kind
    const rows = entityRowsOf(
      mapWith([
        ['npc/mice', 41],
        ['npc/human_base', 36],
        ['npc/mice', 3],
        ['npc/human_base', 4],
      ]),
    )

    assert.deepStrictEqual(
      rows.map((row) => {
        return row.entityName
      }),
      ['human_base_0004', 'human_base_0036', 'mice_0003', 'mice_0041'],
    )
  })

  void it('names an entity the way the game does, with the identifier on four digits', () => {
    const rows = entityRowsOf(mapWith([['system/marker', 17]]))

    assert.strictEqual(rows[0]?.entityName, 'marker_0017')
  })

  void it('drops the asl a name carries', () => {
    const rows = entityRowsOf(mapWith([['items/flour_bag.asl', 3]]))

    assert.strictEqual(rows[0]?.kind, 'flour_bag')
    assert.strictEqual(rows[0]?.entityName, 'flour_bag_0003')
  })

  void it('keeps the position of the object, so two identical objects have two rows', () => {
    const rows = entityRowsOf(
      mapWith([
        ['fix_inter/door', 7],
        ['fix_inter/door', 7],
      ]),
    )

    assert.notStrictEqual(rows[0]?.index, rows[1]?.index)
  })

  void it('reads no row from a level without an entity', () => {
    assert.deepStrictEqual(entityRowsOf(mapWith([])), [])
  })

  void it('leaves an object out whose name is outside the five folders', () => {
    assert.deepStrictEqual(entityRowsOf(mapWith([['weird/thing', 1]])), [])
  })
})

void describe('entitySectionsOf', () => {
  void it('groups the rows by category, in the order of the list', () => {
    const sections = entitySectionsOf(
      entityRowsOf(
        mapWith([
          ['system/marker', 2],
          ['fix_inter/door', 7],
          ['fix_inter/gate', 9],
        ]),
      ),
    )

    assert.deepStrictEqual(
      sections.map((section) => {
        return [section.label, section.rows.length]
      }),
      [
        ['fix_inter', 2],
        ['items', 0],
        ['npc', 0],
        ['system', 1],
      ],
    )
  })

  void it('keeps the folders of the game, even the ones a level has nothing in', () => {
    const sections = entitySectionsOf(entityRowsOf(mapWith([['npc/mice', 1]])))

    assert.deepStrictEqual(
      sections.map((section) => {
        return section.category
      }),
      ['fix_inter', 'items', 'npc', 'system'],
    )
  })

  void it('has no section for the player folder: a level never places one', () => {
    assert.deepStrictEqual(
      entitySectionsOf([]).map((section) => {
        return section.category
      }),
      ['fix_inter', 'items', 'npc', 'system'],
    )
  })
})

void describe('searchRows', () => {
  const rows = entityRowsOf(
    mapWith([
      ['fix_inter/light_door', 113],
      ['fix_inter/door', 7],
      ['items/provisions/pie', 3],
    ]),
  )

  void it('keeps every row for an empty search', () => {
    assert.strictEqual(searchRows(rows, '  ').length, 3)
  })

  void it('reads the name of the entity', () => {
    assert.deepStrictEqual(
      searchRows(rows, 'door').map((row) => {
        return row.identifier
      }),
      [7, 113],
    )
  })

  void it('reads the identifier of the entity', () => {
    // the author knows the number from the logs of the game
    assert.deepStrictEqual(
      searchRows(rows, '113').map((row) => {
        return row.identifier
      }),
      [113],
    )
  })

  void it('reads the name of the game, with its four digits', () => {
    assert.deepStrictEqual(
      searchRows(rows, 'light_door_0113').map((row) => {
        return row.identifier
      }),
      [113],
    )
  })
})
