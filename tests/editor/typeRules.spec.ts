import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

/**
 * The source and the test files the rule of the interfaces reads.
 *
 * @param root The folder to walk.
 *
 * @returns The paths of the TypeScript and Vue files, without the ambient ones and the archived code.
 */
async function codeFilesOf(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const file = path.join(entry.parentPath, entry.name)

    if (!file.endsWith('.ts') && !file.endsWith('.vue')) {
      continue
    }

    // the ambient types of the tools and the archived code of `_old` are not the code the rule is about
    if (file.endsWith('.d.ts') || file.includes(`${path.sep}_old${path.sep}`)) {
      continue
    }

    files.push(file)
  }

  return files
}

/**
 * Reads the names a class implements.
 *
 * @param text The text of a file.
 *
 * @returns The names of the implemented types.
 */
function implementedNamesOf(text: string): string[] {
  const names: string[] = []
  const pattern = /\bimplements[\t ]+(?<clause>[^{]+)/gu
  let match = pattern.exec(text)

  while (match !== null) {
    const clause = match.groups?.clause ?? ''

    for (const part of clause.split(',')) {
      const name = /^[^\s<]+/u.exec(part.trim())?.[0]

      if (name !== undefined && name !== '') {
        names.push(name)
      }
    }

    match = pattern.exec(text)
  }

  return names
}

void describe('the interfaces of the code', () => {
  void it('are only the contracts a class implements', async () => {
    const files = [...(await codeFilesOf('src')), ...(await codeFilesOf('tests'))]
    const implemented = new Set<string>()
    const interfaces: Array<{ file: string; name: string }> = []

    for (const file of files) {
      const text = await readFile(file, 'utf8')

      for (const name of implementedNamesOf(text)) {
        implemented.add(name)
      }

      const pattern = /^[\t ]*(?:export[\t ]+)?interface[\t ]+(?<name>[$A-Z_a-z][\w$]*)/gmu
      let match = pattern.exec(text)

      while (match !== null) {
        interfaces.push({ file, name: match.groups?.name ?? '' })
        match = pattern.exec(text)
      }
    }

    const offenders = interfaces
      .filter((candidate) => {
        return !implemented.has(candidate.name)
      })
      .map((candidate) => {
        return `${candidate.file}: ${candidate.name}`
      })

    assert.deepEqual(offenders, [])
  })
})
