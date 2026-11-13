/**
 * Runs the browser tests a change reaches, instead of the whole suite.
 *
 * @remarks
 * The suite is the slow gate of the repository (two browsers, a level that has to load in every test), so the hook of a
 * commit runs the specs the change reaches, and the ci runs the whole suite on every push
 * (`.github/workflows/test.yml`). Which spec a file reaches is in [`changedSpecs.ts`](changedSpecs.ts), with the table
 * that says it.
 *
 * The script reads the change from `git status`, so it says the same in the hook (the staged files) and in a hand run
 * (everything that differs from the commit).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { reachOf } from './changedSpecs.ts'

/**
 * Reads the files of the change: the changed and the new ones, as `git status` sees them.
 *
 * @returns The paths, from the repository root.
 */
function changedFiles(): string[] {
  const output = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' })

  return output
    .split('\n')
    .filter((line) => {
      return line.length > 4
    })
    .map((line) => {
      const path = line.slice(3)

      // a rename says `old -> new`: the new name is the one that matters
      if (path.includes(' -> ')) {
        return path.slice(path.indexOf(' -> ') + 4)
      }

      return path
    })
}

const files = changedFiles()

if (files.length === 0) {
  console.log('e2e: nothing changed, no spec to run')

  process.exit(0)
}

const reach = reachOf(files)

console.log('e2e: the change reaches:')

for (const note of reach.notes) {
  console.log(`  ${note}`)
}

let args: string[] = []

if (!reach.whole) {
  args = [...reach.specs]
}

if (args.length === 0) {
  console.log('e2e: the whole suite')
} else {
  console.log(`e2e: ${String(args.length)} spec(s)`)
}

const result = spawnSync('npx', ['playwright', 'test', ...args], { stdio: 'inherit' })

process.exit(result.status ?? 1)
