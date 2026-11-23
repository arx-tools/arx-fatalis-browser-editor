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
 *
 * A release commit moves only the version in `package.json` and `package-lock.json`; the lock reaches the whole suite,
 * so its diff is read, and a change that touches nothing but version numbers is left out of the change (see
 * {@link isVersionOnlyDiff}). `SKIP_E2E=1` skips the browser tests for one commit, and the lint, the type check and the
 * unit tests of the hook still run.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import process from 'node:process'
import { isVersionOnlyDiff, reachOf } from './changedSpecs.ts'

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

/**
 * Tells whether the change of a file is only the version of the package.
 *
 * @param path The path of the file.
 *
 * @returns True when the file is a package file whose diff only moves version numbers.
 */
function isVersionOnlyChange(path: string): boolean {
  if (path !== 'package.json' && path !== 'package-lock.json') {
    return false
  }

  try {
    const diff = execFileSync('git', ['diff', 'HEAD', '--', path], { encoding: 'utf8' })

    return isVersionOnlyDiff(diff)
  } catch {
    // a file git can not diff is a change like any other
    return false
  }
}

if (process.env.SKIP_E2E === '1') {
  console.log('e2e: skipped (SKIP_E2E is set)')

  process.exit(0)
}

const files = changedFiles().filter((path) => {
  return !isVersionOnlyChange(path)
})

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
