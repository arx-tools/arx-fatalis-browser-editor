import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * The root of the editor sources.
 */
const sourceRoot = fileURLToPath(new URL('../../src/editor/', import.meta.url))

/**
 * The palette: the only file that may spell out a colour.
 */
const paletteFile = path.join(sourceRoot, 'palette.scss')

/**
 * A colour literal: a hex, or an rgb/hsl function with a number inside. A palette token is written as
 * `$name` (or `rgba($name, 0.5)`), so a raw value is easy to spot.
 */
const colourPattern = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*(?:\d|#)/gi

/**
 * Collects the style sources below a directory.
 *
 * @param directory The directory to walk.
 *
 * @returns The `.vue` and `.scss` files, with absolute paths.
 */
async function styleFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return await styleFiles(full)
      }

      if (entry.name.endsWith('.vue') || entry.name.endsWith('.scss')) {
        return [full]
      }

      return []
    }),
  )

  return nested.flat()
}

/**
 * The `<style>` blocks of a `.vue` file, with the body in a named group.
 */
const stylePattern = /<style\b[^>]*>(?<body>[\s\S]*?)<\/style>/g

/**
 * Reads the style part of a source file.
 *
 * @param file The file to read.
 * @param text The content of the file.
 *
 * @returns The `<style>` blocks of a `.vue` file, or the whole content of a `.scss` file.
 */
function styleOf(file: string, text: string): string {
  if (!file.endsWith('.vue')) {
    return text
  }

  return Array.from(text.matchAll(stylePattern), (match) => {
    return match.groups?.body ?? ''
  }).join('\n')
}

/**
 * Lists the colour literals of a style source.
 *
 * @param file The file to read.
 *
 * @returns One `name: literals` line when the file has a raw colour, `null` for a clean file.
 */
async function offenceOf(file: string): Promise<string | null> {
  const style = styleOf(file, await readFile(file, 'utf8'))
  const matches = style.match(colourPattern)

  if (matches === null) {
    return null
  }

  return `${path.relative(sourceRoot, file)}: ${matches.join(', ')}`
}

void describe('the palette', () => {
  void it('is the only file that spells out a colour', async () => {
    const files = await styleFiles(sourceRoot)
    const reported = await Promise.all(
      files.map(async (file) => {
        if (path.resolve(file) === path.resolve(paletteFile)) {
          return null
        }

        return await offenceOf(file)
      }),
    )
    const offenders = reported.filter((offence): offence is string => {
      return offence !== null
    })

    assert.deepEqual(offenders, [])
  })

  void it('defines the tokens the shell is built on', async () => {
    const palette = await readFile(paletteFile, 'utf8')
    const tokens = [
      'surface-app',
      'surface-widget',
      'surface-float',
      'surface-panel',
      'border',
      'text',
      'text-muted',
      'text-icon',
      'text-strong',
      'accent',
      'danger',
      'ok',
      'interactive',
      'ink',
    ]

    const missing = tokens.filter((token) => {
      return !palette.includes(`$${token}:`)
    })

    assert.deepEqual(missing, [])
  })
})
