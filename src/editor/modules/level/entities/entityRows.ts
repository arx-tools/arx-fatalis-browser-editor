import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * The categories of the entities, in the order the list shows them.
 *
 * @remarks
 * The first segment of the `name` of a DLF interactive object is its category (`fix_inter/light_door`), and the words
 * are the names of the folders the game keeps the models in (`GRAPH/obj3d/interactive`), as the owner asked
 * (2026-11-22): the game works with these five folders, so the list has exactly these five sections, and an empty one is
 * still there.
 */
export const ENTITY_CATEGORIES = [
  { id: 'fix_inter', label: 'fix_inter' },
  { id: 'items', label: 'items' },
  { id: 'npc', label: 'npc' },
  { id: 'player', label: 'player' },
  { id: 'system', label: 'system' },
] as const

/**
 * The slot an entity belongs to, read from the first segment of its name.
 */
export type EntityCategory = (typeof ENTITY_CATEGORIES)[number]['id']

/**
 * One row of the entity list.
 */
export type EntityRow = {
  /**
   * The position of the object in the DLF.
   *
   * @remarks
   * The same name and identifier can stand in the level more than once, so the position is what tells the rows apart
   * (the row of a list needs a key of its own, and a duplicated key breaks the rendering of the filtered list).
   */
  readonly index: number
  /**
   * The identifier of the entity: the number at the end of its name in the game.
   */
  readonly identifier: number
  /**
   * The path the DLF carries: the category and the kind of the model, like `fix_inter/light_door`.
   */
  readonly name: string
  /**
   * The model of the entity: the last segment of its name, like `light_door`, without the `.asl` some of them carry.
   */
  readonly kind: string
  /**
   * The name the entity has in the game: the model and the identifier on four digits, like `light_door_0113`.
   */
  readonly entityName: string
  /**
   * The category of the entity.
   */
  readonly category: EntityCategory
}

/**
 * A group of rows of the entity list: one category.
 */
export type EntitySection = {
  /**
   * The category the rows belong to.
   */
  readonly category: EntityCategory
  /**
   * The word the list writes over the rows.
   */
  readonly label: string
  /**
   * The rows of the category, in the order of their identifiers.
   */
  readonly rows: readonly EntityRow[]
}

/**
 * Reads the category of an entity out of its name.
 *
 * @param name The name of the DLF object.
 *
 * @returns Its category, or `other` when the first segment is not one the game uses.
 */
export function categoryOf(name: string): EntityCategory | undefined {
  const [segment] = name.split('/', 1)
  const known = ENTITY_CATEGORIES.find((category) => {
    return category.id === segment
  })

  // the game has the five folders and nothing else: a name outside them is not an entity the list can place
  return known?.id
}

/**
 * Reads the rows of the entity list from the level.
 *
 * @param map The level to read.
 *
 * @returns One row per interactive object of the DLF which sits in one of the five folders, in the order of the
 * categories and the names of the entities.
 */
export function entityRowsOf(map: ArxMap): EntityRow[] {
  const rows: EntityRow[] = []

  for (const [index, object] of map.dlf.interactiveObjects.entries()) {
    const category = categoryOf(object.name)

    if (category === undefined) {
      continue
    }

    const segment = object.name.slice(object.name.lastIndexOf('/') + 1)
    let kind = segment

    if (kind.endsWith('.asl')) {
      kind = kind.slice(0, -4)
    }

    rows.push({
      index,
      identifier: object.identifier,
      name: object.name,
      kind,
      entityName: `${kind}_${String(object.identifier).padStart(4, '0')}`,
      category,
    })
  }

  return rows.toSorted((left, right) => {
    const order = ENTITY_CATEGORIES.findIndex((category) => {
      return category.id === left.category
    })
    const otherOrder = ENTITY_CATEGORIES.findIndex((category) => {
      return category.id === right.category
    })

    if (order !== otherOrder) {
      return order - otherOrder
    }

    // the rows of a folder read by name (2026-11-22, the owner): the identifier four digits wide sorts the same way the
    // game's names do, so `mice_0003` comes before `mice_0041`, and a kind the author looks for is together
    return left.entityName.localeCompare(right.entityName)
  })
}

/**
 * Groups the rows into the sections of the list.
 *
 * @remarks
 * The sections are the five folders the game has, always, so the list of a level reads the same whichever of them holds
 * an entity: the player folder has none in most of the levels, and its row still says what it is (2026-11-22, the
 * owner).
 *
 * @param rows The rows to group.
 *
 * @returns The five sections, in the order of the list.
 */
export function entitySectionsOf(rows: readonly EntityRow[]): EntitySection[] {
  return ENTITY_CATEGORIES.map((category): EntitySection => {
    return {
      category: category.id,
      label: category.label,
      rows: rows.filter((row) => {
        return row.category === category.id
      }),
    }
  })
}

/**
 * Keeps the rows a search lets through.
 *
 * @remarks
 * The search reads the path of the object and the name it has in the game: `light` finds the light doors and `0113` the
 * entity that carries that number, which is how the author knows an entity from the game's own logs.
 *
 * @param rows The rows to filter.
 * @param query The text of the search field.
 *
 * @returns The rows that match the text, in the order they came in.
 */
export function searchRows(rows: readonly EntityRow[], query: string): EntityRow[] {
  const text = query.trim().toLowerCase()

  if (text === '') {
    return [...rows]
  }

  return rows.filter((row) => {
    return row.name.toLowerCase().includes(text) || row.entityName.includes(text)
  })
}
