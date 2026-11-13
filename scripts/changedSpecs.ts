/**
 * Which browser tests a change reaches.
 *
 * @remarks
 * A browser test drives the whole application, so nothing in the code says which spec a widget breaks: the reach is a
 * table, not a graph. The table lists the sources each spec covers, and:
 *
 * - a changed spec runs itself,
 * - a changed source runs every spec that covers it,
 * - a changed source that no spec covers (the shell, the stores, the generator: everything shared) reaches the whole
 * suite, because a change there can reach any spec,
 * - a change to the test configuration reaches the whole suite too.
 *
 * The table is kept honest by the ci: a spec it does not pick up on a change still runs on the push
 * (`.github/workflows/test.yml`).
 */

/**
 * A spec of the browser suite and the sources it covers.
 */
export interface SpecCoverage {
  /**
   * The path of the spec, from the repository root.
   */
  readonly spec: string
  /**
   * The sources the spec drives, as globs of the repository root.
   */
  readonly covers: readonly string[]
}

/**
 * What a change reaches.
 */
export interface Reach {
  /**
   * The specs to run, oldest first. Ignored when {@link Reach.whole} is set.
   */
  readonly specs: readonly string[]
  /**
   * Whether the change reaches the whole suite.
   */
  readonly whole: boolean
  /**
   * What each changed file reached, for the log of the run.
   */
  readonly notes: readonly string[]
}

/**
 * The specs of the suite, and the sources each of them covers.
 *
 * @remarks
 * The paths are globs of the repository root: `**` for any number of folders, `*` for any number of characters inside
 * one folder. A spec the table does not name is still a spec of the suite; it simply has no path that reaches it, so it
 * runs when the whole suite runs.
 */
export const coverage: readonly SpecCoverage[] = [
  {
    spec: 'tests/e2e/dataDirDialog.spec.ts',
    covers: [
      'src/editor/components/DataDirPicker.vue',
      'src/editor/modules/level/source/dataDir.ts',
      'src/editor/modules/level/source/dataDir/**',
    ],
  },
  {
    spec: 'tests/e2e/deletion.spec.ts',
    covers: ['src/editor/modules/level/edit/deletion.ts', 'src/generator/arxMap/removal.ts'],
  },
  {
    spec: 'tests/e2e/editor.spec.ts',
    covers: [
      'src/editor/components/EditorHeader.vue',
      'src/editor/components/LoadingOverlay.vue',
      'src/editor/components/MapsToOpen.vue',
      'src/editor/components/MissingMapPrompt.vue',
    ],
  },
  {
    spec: 'tests/e2e/export.spec.ts',
    covers: ['src/editor/components/ExportMap.vue', 'src/editor/modules/export/**', 'src/generator/manifest.ts'],
  },
  {
    spec: 'tests/e2e/fixed-views.spec.ts',
    covers: ['src/editor/components/widgets/FixedViewWidget/**', 'src/editor/components/widgets/camera/**'],
  },
  {
    spec: 'tests/e2e/history.spec.ts',
    covers: ['src/editor/modules/history/**'],
  },
  {
    spec: 'tests/e2e/inspector.spec.ts',
    covers: [
      'src/editor/components/widgets/PolygonInspectorWidget/**',
      'src/editor/components/widgets/RoomInspectorWidget/**',
    ],
  },
  {
    spec: 'tests/e2e/layoutDrag.spec.ts',
    covers: ['src/editor/modules/layout/dragDrop.ts', 'src/editor/modules/layout/hitTest.ts'],
  },
  {
    spec: 'tests/e2e/layoutEmpty.spec.ts',
    covers: ['src/editor/modules/layout/layoutNode.ts', 'src/editor/modules/layout/placement.ts'],
  },
  {
    spec: 'tests/e2e/layoutLock.spec.ts',
    covers: ['src/editor/modules/layout/lock.ts'],
  },
  {
    spec: 'tests/e2e/layoutPresets.spec.ts',
    covers: ['src/editor/modules/layout/layoutPresets.ts', 'src/editor/modules/layout/widgetKinds.ts'],
  },
  {
    spec: 'tests/e2e/layoutUndo.spec.ts',
    covers: ['src/editor/modules/layout/layoutApply.ts', 'src/editor/modules/layout/layoutHistory.ts'],
  },
  {
    spec: 'tests/e2e/levelDataDir.spec.ts',
    covers: [
      'src/editor/modules/level/source/dataDir.ts',
      'src/editor/modules/level/source/dataDir/**',
      'src/editor/modules/level/source/levelSource.ts',
    ],
  },
  {
    spec: 'tests/e2e/levelZip.spec.ts',
    covers: [
      'src/editor/modules/level/source/editorSettings.ts',
      'src/editor/modules/level/source/packedFile.ts',
      'src/editor/modules/level/source/zipSource.ts',
    ],
  },
  {
    spec: 'tests/e2e/posePerMap.spec.ts',
    covers: ['src/editor/modules/level/source/maps.ts', 'src/editor/modules/level/source/maps/**'],
  },
  {
    spec: 'tests/e2e/rooms.spec.ts',
    covers: [
      'src/editor/components/widgets/RoomInspectorWidget/**',
      'src/editor/components/widgets/shared/roomOverlay.ts',
      'src/editor/modules/rooms/**',
    ],
  },
  {
    spec: 'tests/e2e/selection.spec.ts',
    covers: ['src/editor/components/widgets/SelectionInspectorWidget/**', 'src/editor/modules/selection/**'],
  },
  {
    spec: 'tests/e2e/textures.spec.ts',
    covers: [
      'src/editor/components/widgets/TextureBrowserWidget/**',
      'src/editor/modules/level/edit/levelTextures.ts',
      'src/editor/modules/level/edit/levelTextures/**',
      'src/editor/modules/textures/**',
    ],
  },
  {
    spec: 'tests/e2e/tooltip.spec.ts',
    covers: ['src/editor/components/Tooltip.vue', 'src/editor/modules/layout/tooltip.ts'],
  },
  {
    spec: 'tests/e2e/uiText.spec.ts',
    covers: ['src/editor/**/*.vue'],
  },
  {
    spec: 'tests/e2e/uvMapper.spec.ts',
    covers: ['src/editor/components/widgets/UvMapperWidget/**', 'src/editor/modules/level/edit/uvMapping.ts'],
  },
]

/**
 * The files a change of which reaches the whole suite.
 */
export const wholeSuite: readonly string[] = [
  'package-lock.json',
  'playwright.config.*',
  'tests/e2e/support/**',
  'vite.config.ts',
]

/**
 * Matches one part of a path against one part of a glob.
 *
 * @param part The part of the path, which is never empty.
 * @param glob The part of the glob: a piece of text with `*` in it for any number of characters.
 *
 * @returns True when the part is the one the glob names.
 */
function partMatches(part: string, glob: string): boolean {
  const pieces = glob.split('*')

  if (pieces.length === 1) {
    return part === glob
  }

  const first = pieces[0] ?? ''

  if (!part.startsWith(first)) {
    return false
  }

  let at = first.length

  for (let index = 1; index < pieces.length; index = index + 1) {
    const piece = pieces[index] ?? ''

    if (index === pieces.length - 1) {
      return part.endsWith(piece) && part.length - piece.length >= at
    }

    const found = part.indexOf(piece, at)

    if (found === -1) {
      return false
    }

    at = found + piece.length
  }

  return true
}

/**
 * Matches the parts of a path against the parts of a glob.
 *
 * @param pathParts The parts of the path, which may run out before the glob does.
 * @param globParts The parts of the glob, which a `**` may take any number of.
 *
 * @returns True when the parts are the ones the glob names.
 */
function partsMatch(pathParts: readonly string[], globParts: readonly string[]): boolean {
  let restGlob = globParts
  let restPath = pathParts

  for (;;) {
    const [globPart, ...afterGlob] = restGlob

    if (globPart === undefined) {
      return restPath.length === 0
    }

    if (globPart === '**') {
      // any number of folders: the rest of the glob is tried from every place it can start at
      for (let skipped = 0; skipped <= restPath.length; skipped = skipped + 1) {
        if (partsMatch(restPath.slice(skipped), afterGlob)) {
          return true
        }
      }

      return false
    }

    const [pathPart, ...afterPath] = restPath

    if (pathPart === undefined || !partMatches(pathPart, globPart)) {
      return false
    }

    restGlob = afterGlob
    restPath = afterPath
  }
}

/**
 * Tells whether a path matches a glob of the table.
 *
 * @param path The path of the repository root.
 * @param glob The glob: `**` for any number of folders, `*` for any number of characters inside one folder.
 *
 * @returns True when the path is one the glob names.
 */
export function matches(path: string, glob: string): boolean {
  return partsMatch(path.split('/'), glob.split('/'))
}

/**
 * Reads what a change reaches.
 *
 * @param files The paths of the change, from the repository root.
 *
 * @returns The specs to run, or the whole suite, with a note per file.
 */
export function reachOf(files: readonly string[]): Reach {
  const specs = new Set<string>()
  const notes: string[] = []
  let whole = false

  for (const file of files) {
    if (file.startsWith('tests/e2e/') && file.endsWith('.spec.ts')) {
      specs.add(file)
      notes.push(`${file}: the spec itself`)
    } else if (
      wholeSuite.some((glob) => {
        return matches(file, glob)
      })
    ) {
      whole = true
      notes.push(`${file}: the suite itself`)
    } else {
      const reached = coverage.filter((entry) => {
        return entry.covers.some((glob) => {
          return matches(file, glob)
        })
      })

      if (reached.length > 0) {
        for (const entry of reached) {
          specs.add(entry.spec)
        }

        notes.push(`${file}: ${String(reached.length)} spec(s)`)
      } else if (file.startsWith('src/')) {
        whole = true
        notes.push(`${file}: no spec covers it, it is shared`)
      }
    }
  }

  return { specs: [...specs], whole, notes }
}
