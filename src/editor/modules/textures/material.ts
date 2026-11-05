/**
 * The material of a texture: what the game hears under a foot and what a filter of the editor groups the textures by.
 *
 * @remarks
 * The game does not store the material of a texture anywhere: it **reads it from the name** of the file
 * (`GetMaterialString` in `src/scene/Interactive.cpp` of Arx Libertatis), and the names are full of aliases — a
 * `[rock]_wall1.bmp` is stone, a `[marble]_floor.bmp` is stone too, and the game even has a `shit` texture that sounds
 * like wet mud. The table below is the function of the game, in its order: the **first** alias a name contains decides,
 * so a `[stone]_moss_wall.bmp` is stone and not carpet.
 *
 * The game's own convention for the textures a level's **surfaces** draw with is the **bracketed** material:
 * `[stone]_human_wall3.bmp`, `(fabric)_gobelin_bed.jpg`. A name without one is a texture of an **item**
 * (`item_stone_riddle.jpg`, `aliciaroom_mur02.jpg`): the game's function still finds the word of the table in some of
 * them, but they are not level surfaces, so the editor reads a material from the bracketed word only and offers the
 * rest as item textures (2026-11-04, the owner). The two groups are the `Arx Fatalis materials` and `Arx Fatalis items`
 * of the filter.
 *
 * @see https://github.com/arx/ArxLibertatis/blob/1.2.1/src/scene/Interactive.cpp
 */

/**
 * The materials the game knows.
 *
 * @remarks
 * The order is the order of the function of the game, and it is the order of the filter of the textures widget too, so
 * the two lists read the same way. `unknown` is the last: the game calls it that, and a face with an unknown material
 * gets a plain footstep.
 */
export const TEXTURE_MATERIALS = ['stone', 'wood', 'wet', 'gravel', 'metal', 'ice', 'carpet', 'unknown'] as const

/**
 * The material of a texture, as the game's function names it.
 */
export type TextureMaterial = (typeof TEXTURE_MATERIALS)[number]

/**
 * The bracketed pieces of a texture name: the place the game writes the material of a surface.
 *
 * @remarks
 * Every bracketed piece of the name is read (`[stone]`, `(fabric)`, `(fabrics)`, `[wood]`), and the material of the name
 * is the first alias of one of them — a `[stone]_moss_wall.bmp` is stone. A name without a bracket is not a material
 * texture, whatever the letters of it are: `item_stone_riddle.jpg` is an item.
 */
/**
 * The bracketed pieces of a name, in lower case.
 *
 * @remarks
 * The scan is written out instead of a regular expression: a name is a short string, and the regexp of a bracketed piece
 * of it trips the safe-regexp rule of the linter (an unanchored group over a negated class). The pieces keep the order
 * they are written in, so the first one with a material alias decides.
 *
 * @param name The name of the texture.
 *
 * @returns Every piece the name holds in brackets, like `stone` for `[stone]_wall1.bmp`.
 */
function bracketedPiecesOf(name: string): string[] {
  const lower = name.toLowerCase()
  const pieces: string[] = []
  let index = 0

  while (index < lower.length) {
    const character = lower.charAt(index)
    let closing = ''

    if (character === '[') {
      closing = ']'
    } else if (character === '(') {
      closing = ')'
    }

    if (closing === '') {
      index = index + 1

      continue
    }

    const close = lower.indexOf(closing, index + 1)

    if (close === -1) {
      break
    }

    pieces.push(lower.slice(index + 1, close))
    index = close + 1
  }

  return pieces
}

/**
 * The aliases of a material: the pieces of a texture name that make it one.
 */
export interface MaterialAliases {
  /**
   * The material the aliases give.
   */
  readonly material: TextureMaterial
  /**
   * The pieces of a name the game looks for, in the order it looks for them.
   */
  readonly aliases: readonly string[]
}

/**
 * The alias table of the game, in its order.
 *
 * @remarks
 * `boost::contains(origin, "…")` is a plain substring search, so a texture called `something_stoneish.bmp` is stone:
 * the table cannot be read as "the name starts with an alias". The order is what decides the `[stone]_moss_…` case, and
 * the list is here instead of being spread over an `if` chain, so a test can walk it.
 */
export const MATERIAL_ALIASES: readonly MaterialAliases[] = [
  { material: 'stone', aliases: ['stone', 'marble', 'rock'] },
  { material: 'wood', aliases: ['wood'] },
  { material: 'wet', aliases: ['wet', 'mud', 'blood', 'bone', 'flesh', 'shit'] },
  { material: 'gravel', aliases: ['soil', 'gravel', 'earth', 'dust', 'sand', 'straw'] },
  { material: 'metal', aliases: ['metal', 'iron', 'glass', 'rust'] },
  { material: 'ice', aliases: ['ice'] },
  { material: 'carpet', aliases: ['fabric', 'moss'] },
]

/**
 * The name of a material, for the rows of the user interface.
 *
 * @param material The material to name.
 *
 * @returns The name with a capital letter, like `Stone` or `Unknown`.
 */
export function materialLabelOf(material: TextureMaterial): string {
  return material.charAt(0).toUpperCase() + material.slice(1)
}

/**
 * Reads the material of a texture from the name of its file.
 *
 * @remarks
 * The material is the word in the **brackets** of the name, so a `[stone]_human_wall1.bmp` is stone and an
 * `item_stone_riddle.jpg` is not: a name without a bracketed material is `unknown`, which is what the filter of the
 * editor calls an item texture.
 *
 * The comparison ignores the case: the files of the game are lower case, but a texture of a level may come from
 * anywhere, and a capital `[Stone]` is the same material.
 *
 * @param name The name of the texture, like `[stone]_human_wall1.bmp`.
 *
 * @returns The material of the texture.
 */
export function materialOf(name: string): TextureMaterial {
  for (const piece of bracketedPiecesOf(name)) {
    for (const row of MATERIAL_ALIASES) {
      for (const alias of row.aliases) {
        if (piece.includes(alias)) {
          return row.material
        }
      }
    }
  }

  return 'unknown'
}

/**
 * What a texture of the game is: the material of a surface, or the picture of an item.
 *
 * @remarks
 * The two groups the owner asked the source filter to tell apart (`Arx Fatalis materials` / `Arx Fatalis items`): a
 * texture with a bracketed material is the surface of a level, the rest is an item or a picture.
 */
export type TextureKind = 'item' | 'material'

/**
 * Reads what a texture of the game is for.
 *
 * @param name The name of the texture, like `[stone]_human_wall1.bmp` or `item_stone_riddle.jpg`.
 *
 * @returns `material` for a bracketed material, `item` for everything else.
 */
export function textureKindOf(name: string): TextureKind {
  if (materialOf(name) === 'unknown') {
    return 'item'
  }

  return 'material'
}
