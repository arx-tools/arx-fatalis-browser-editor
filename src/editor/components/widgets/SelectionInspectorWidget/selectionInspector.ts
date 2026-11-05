import type { ArxPolygon } from 'arx-convert/types'
import { formatCount } from '../../../modules/format.ts'
import type { TextureGroup } from '../../../modules/textures/search.ts'

/**
 * Where a texture of the selection comes from, as the selection inspector groups it.
 *
 * @remarks
 * The two sources of the texture list ({@link TextureSource}), and `missing` for a face whose texture no source of the
 * editor has: the level names a file that is neither in its zip nor in the data directory, so the faces draw with the
 * placeholder. The group is there to say that out loud — a texture that is not found is worth a look.
 */
export type SelectionTextureSource = TextureGroup | 'missing'

/**
 * The name a face without a texture container shows as.
 */
const NO_TEXTURE = '(no texture)'

/**
 * The caption of the groups, in the order the widget shows them.
 */
const GROUP_LABELS: Readonly<Record<SelectionTextureSource, string>> = {
  'arx-materials': 'Arx Fatalis materials',
  'arx-items': 'Arx Fatalis items',
  custom: 'Custom',
  missing: 'Missing',
}

/**
 * The order of the groups.
 */
const GROUP_ORDER: readonly SelectionTextureSource[] = ['arx-materials', 'arx-items', 'custom', 'missing']

/**
 * One texture of the selection, with how many faces draw with it.
 */
export interface SelectedTexture {
  /**
   * The name the level calls the texture.
   */
  readonly name: string
  /**
   * How many selected faces draw with it.
   */
  readonly count: number
}

/**
 * The textures of the selection that come from one source.
 */
export interface SelectionTextureGroup {
  /**
   * Where the textures come from.
   */
  readonly source: SelectionTextureSource
  /**
   * The caption of the group, like `Arx Fatalis`.
   */
  readonly label: string
  /**
   * How many selected faces the group has.
   */
  readonly faces: number
  /**
   * The textures of the group, the ones with the most faces first.
   */
  readonly textures: readonly SelectedTexture[]
}

/**
 * The numbers the selection inspector shows.
 */
export interface SelectionSummary {
  /**
   * How many faces are selected.
   */
  readonly count: number
  /**
   * How many distinct textures the selected faces draw with.
   */
  readonly textureCount: number
  /**
   * The rows of the widget, above the groups.
   */
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>
  /**
   * The groups of textures, empty when nothing is selected.
   */
  readonly groups: readonly SelectionTextureGroup[]
}

/**
 * A face of the level, as the selection inspector reads it.
 */
export interface SelectionInput {
  /**
   * The selected faces, by their index in the level.
   */
  readonly faces: readonly number[]
  /**
   * Every polygon of the level.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * The name of the texture of a container, or `undefined` when the level has no container with the id.
   */
  readonly textureNameOf: (textureContainerId: number) => string | undefined
  /**
   * The group a texture name belongs to, or `undefined` when no source of the editor has a file for it.
   */
  readonly groupOfName: (name: string) => TextureGroup | undefined
}

/**
 * Adds a face to the counts of the selection.
 *
 * @param counts The textures of one source, with how many faces they have.
 * @param name The name of the texture of the face.
 */
function countOf(counts: Map<string, SelectedTexture>, name: string): void {
  const found = counts.get(name)

  if (found === undefined) {
    counts.set(name, { name, count: 1 })
  } else {
    counts.set(name, { name, count: found.count + 1 })
  }
}

/**
 * Reads the numbers the selection inspector shows.
 *
 * @remarks
 * The **count of the faces** is the one the statistics widget used to show (the selection store counts a quad once), and
 * it moved here with the textures: what the user selected is what the inspector is about. Under it, the textures of the
 * selected faces are grouped by where they come from, and inside a group the texture with the most faces comes first —
 * the biggest area of the selection is what a paint is about to change.
 *
 * A selected index the level does not have (an edit moved the faces, and the selection was not dropped yet) is skipped:
 * the summary is about the level that is on the screen.
 *
 * @param input The selection and the level it points at.
 *
 * @returns The rows and the groups of the widget.
 */
export function selectionSummaryOf(input: SelectionInput): SelectionSummary {
  const { faces, polygons, textureNameOf, groupOfName } = input
  const counts = new Map<SelectionTextureSource, Map<string, SelectedTexture>>()
  let count = 0

  for (const index of faces) {
    const polygon = polygons[index]

    if (polygon === undefined) {
      continue
    }

    count = count + 1

    const known = textureNameOf(polygon.textureContainerId)
    const name = known ?? NO_TEXTURE
    let source: SelectionTextureSource = 'missing'

    if (known !== undefined) {
      source = groupOfName(known) ?? 'missing'
    }

    let group = counts.get(source)

    if (group === undefined) {
      group = new Map<string, SelectedTexture>()
      counts.set(source, group)
    }

    countOf(group, name)
  }

  const groups: SelectionTextureGroup[] = []
  let textureCount = 0

  for (const source of GROUP_ORDER) {
    const group = counts.get(source)

    if (group === undefined) {
      continue
    }

    const textures = group
      .values()
      .toArray()
      .toSorted((one, other) => {
        if (one.count !== other.count) {
          return other.count - one.count
        }

        return one.name.localeCompare(other.name)
      })

    textureCount = textureCount + textures.length
    groups.push({
      source,
      label: GROUP_LABELS[source],
      faces: textures.reduce((sum, texture) => {
        return sum + texture.count
      }, 0),
      textures,
    })
  }

  return {
    count,
    textureCount,
    rows: [
      { label: 'Selected faces', value: formatCount(count) },
      { label: 'Textures', value: formatCount(textureCount) },
    ],
    groups,
  }
}
