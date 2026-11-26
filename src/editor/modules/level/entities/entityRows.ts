import type { ArxInteractiveObject, ArxVector3 } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * How far the camera stands from an entity when the list jumps to it.
 *
 * @remarks
 * The same distance the light inspector jumps with (2026-11-22, the owner: 300 units is fine for the first round): the
 * entity lands in the middle of the view the camera already looks toward.
 */
export const ENTITY_JUMP_DISTANCE = 300

/**
 * The categories of the entities, in the order the list shows them.
 *
 * @remarks
 * The first segment of the `name` of a DLF interactive object is its category (`fix_inter/light_door`), and the words
 * are the names of the folders the game keeps the models in (`GRAPH/obj3d/interactive`), as the owner asked
 * (2026-11-22): the list has one section per folder the game actually places, so an empty one still tells what it is. The
 * `player` folder is not among them: the player is not an entity of a level, and the folder never holds one (the owner,
 * 2026-11-22).
 */
export const ENTITY_CATEGORIES = [
  { id: 'fix_inter', label: 'fix_inter' },
  { id: 'items', label: 'items' },
  { id: 'npc', label: 'npc' },
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
  /**
   * Where the entity stands, in the game's coordinates.
   */
  readonly position: ArxVector3
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
 * Reads the model of an entity out of its path: the last segment, without the `.asl` some of them carry.
 *
 * @param name The name of the DLF object, like `fix_inter/light_door`.
 *
 * @returns The model, like `light_door`.
 */
export function entityKindOf(name: string): string {
  const segment = name.slice(name.lastIndexOf('/') + 1)

  if (segment.endsWith('.asl')) {
    return segment.slice(0, -4)
  }

  return segment
}

/**
 * Reads the name an entity has in the game: the model and the identifier on four digits, like `light_door_0113`.
 *
 * @remarks
 * The list and the entity editor write the same name (2026-11-22, the owner: the rows read the game's names), so the
 * rule lives here once.
 *
 * @param object The interactive object of the DLF.
 *
 * @returns The name of the entity in the game.
 */
export function entityNameOf(object: ArxInteractiveObject): string {
  return `${entityKindOf(object.name)}_${String(object.identifier).padStart(4, '0')}`
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

    rows.push({
      index,
      identifier: object.identifier,
      name: object.name,
      kind: entityKindOf(object.name),
      entityName: entityNameOf(object),
      category,
      position: object.position,
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
 * The sections are the folders the game places entities from, always, so the list of a level reads the same whichever
 * of them holds an entity (2026-11-22, the owner).
 *
 * @param rows The rows to group.
 *
 * @returns The sections, in the order of the list.
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
