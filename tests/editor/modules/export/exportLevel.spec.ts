import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxLLF, ArxPolygon } from 'arx-convert/types'
import JSZip from 'jszip'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import { SETTINGS_PATH, SOURCE_FOLDER } from '../../../../src/editor/modules/level/source/editorSettings.ts'
import type { StoredPose } from '../../../../src/editor/modules/level/source/maps/mapPoses.ts'
import {
  buildExportDlf,
  buildExportManifest,
  buildExportFts,
  buildExportLlf,
  exportLevelFiles,
  exportLevelZip,
  levelFilePath,
} from '../../../../src/editor/modules/export/exportLevel.ts'
import { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { unpackArxFile } from '../../../../src/generator/files.ts'
import { Settings } from '../../../../src/generator/Settings.ts'

/**
 * Builds the Flat level (an 11×11 floor) as a map.
 *
 * @returns The map, ready to be edited.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * A polygon of the test, with the fields the palette reads.
 *
 * @param colorIndex The place of its first colour in the palette of the LLF.
 * @param quad Whether it is a quad (four colours) or a triangle (three).
 *
 * @returns The polygon, with the place of its colours in the palette.
 */
function polygonOf(colorIndex: number, quad: boolean): ArxPolygon {
  let flags = 0

  if (quad) {
    flags = 64
  }

  return {
    flags,
    room: 1,
    vertices: [
      { llfColorIdx: colorIndex },
      { llfColorIdx: colorIndex + 1 },
      { llfColorIdx: colorIndex + 2 },
      { llfColorIdx: colorIndex + 3 },
    ],
  } as unknown as ArxPolygon
}

/**
 * A colour of the test, from its red channel.
 *
 * @param red The red channel.
 *
 * @returns The colour, grey.
 */
function colorOf(red: number): ArxColor {
  return { r: red, g: red, b: red, a: 255 }
}

void describe('buildExportLlf', () => {
  void it('rebuilds the palette in the order of the polygons of the screen', () => {
    const llf: ArxLLF = {
      header: { lastModifiedBy: '', lastModifiedAt: 0, numberOfPolygonsInFTS: 2 },
      lights: [],
      colors: [colorOf(1), colorOf(2), colorOf(3), colorOf(4), colorOf(5), colorOf(6), colorOf(7)],
    }
    // the second polygon (a quad, four colours from index 3) comes first, then the first (a triangle, from 0)
    const polygons = [polygonOf(3, true), polygonOf(0, false)]
    const exported = buildExportLlf(llf, polygons)

    assert.deepEqual(
      exported.colors.map((color) => {
        return color.r
      }),
      [4, 5, 6, 7, 1, 2, 3],
    )
    assert.equal(exported.header.numberOfPolygonsInFTS, 2)
  })

  void it('writes white for a vertex the palette does not have', () => {
    const llf: ArxLLF = {
      header: { lastModifiedBy: '', lastModifiedAt: 0, numberOfPolygonsInFTS: 1 },
      lights: [],
      colors: [colorOf(1)],
    }
    const exported = buildExportLlf(llf, [polygonOf(0, false)])

    assert.deepEqual(
      exported.colors.map((color) => {
        return color.r
      }),
      [1, 255, 255],
    )
  })

  void it('keeps a level without a palette without one', () => {
    const llf: ArxLLF = {
      header: { lastModifiedBy: '', lastModifiedAt: 0, numberOfPolygonsInFTS: 1 },
      lights: [],
      colors: [],
    }
    const exported = buildExportLlf(llf, [polygonOf(0, false)])

    assert.deepEqual(exported.colors, [])
    assert.equal(exported.header.numberOfPolygonsInFTS, 1)
  })
})

void describe('buildExportDlf', () => {
  void it('writes the count of the polygons of the export', () => {
    const map = flatMap()
    const exported = buildExportDlf(map.dlf, 120)

    assert.equal(exported.header.numberOfPolygonsInFTS, 120)
    // everything else is the description of the loaded level
    assert.deepEqual(exported.interactiveObjects, map.dlf.interactiveObjects)
    assert.equal(exported.header.levelIdx, map.dlf.header.levelIdx)
  })

  void it('writes the index the user gave the level', () => {
    const map = flatMap()
    const exported = buildExportDlf(map.dlf, 120, 13)

    assert.equal(exported.header.levelIdx, 13)
    assert.equal(exported.header.numberOfPolygonsInFTS, 120)
  })
})

/**
 * The build of the editor the manifest tests write, so the block is the same on every run.
 */
const editorBuild = {
  name: 'arx-fatalis-browser-editor',
  version: '0.23.1',
  commit: 'abc1234',
  builtAt: '2026-11-12',
  url: 'https://example.com/editor',
}

/**
 * The moment the manifest tests were written at.
 */
const exportedAt = '2026-11-12T20:30:00.000Z'

/**
 * The files of the level of the given index, in the order the export writes them.
 *
 * @param level The index of the level.
 *
 * @returns The paths inside the archive.
 */
function filesOf(level: number): string[] {
  return [levelFilePath(level, 'fts'), levelFilePath(level, 'dlf'), levelFilePath(level, 'llf')]
}

void describe('buildExportManifest', () => {
  void it('signs the archive with the build of the editor', () => {
    const manifest = buildExportManifest({
      seed: '590085197',
      files: filesOf(13),
      metadata: undefined,
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.deepEqual(manifest, {
      seed: 590_085_197,
      name: undefined,
      version: undefined,
      description: undefined,
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: { ...editorBuild, exportedAt },
      files: filesOf(13),
    })
  })

  void it('leaves the seed out when there is none', () => {
    const manifest = buildExportManifest({
      seed: undefined,
      files: filesOf(8),
      metadata: undefined,
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.equal(manifest.seed, undefined)
    assert.deepEqual(manifest.files, filesOf(8))
  })

  void it('keeps a seed that is not a number as the text it is', () => {
    const manifest = buildExportManifest({
      seed: 'the seed of my map',
      files: filesOf(8),
      metadata: undefined,
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.equal(manifest.seed, 'the seed of my map')
  })

  void it('writes a seed of digits as the number the generator writes', () => {
    const manifest = buildExportManifest({
      seed: '590085197',
      files: filesOf(8),
      metadata: undefined,
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.equal(manifest.seed, 590_085_197)
  })

  void it('keeps the keys of the zip the level came from', () => {
    const manifest = buildExportManifest({
      seed: '12345',
      files: filesOf(1),
      metadata: {
        name: 'arx-map-lalees-minigame',
        version: '2.1.1',
        description: 'A map',
        author: { name: 'Lajos Meszaros' },
        project: { homepage: 'https://example.com/the-mod' },
        seed: 999,
        files: ['/the/files/of/the/zip'],
      },
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.equal(manifest.name, 'arx-map-lalees-minigame')
    assert.equal(manifest.version, '2.1.1')
    assert.equal(manifest.description, 'A map')
    assert.deepEqual(manifest.author, { name: 'Lajos Meszaros' })
    assert.deepEqual(manifest.project, { homepage: 'https://example.com/the-mod' })

    // the seed of the dialog wins over the one of the base, and the files are the ones of this archive
    assert.equal(manifest.seed, 12_345)
    assert.deepEqual(manifest.files, filesOf(1))

    // the author of the zip is kept when the dialog has none
    assert.deepEqual(manifest.author, { name: 'Lajos Meszaros' })
  })

  void it('writes the author and the page the dialog read over the ones of the zip', () => {
    const manifest = buildExportManifest({
      seed: '12345',
      files: filesOf(1),
      metadata: { author: { name: 'The old author' }, project: { homepage: 'https://example.com/old' } },
      author: { name: 'Lali' },
      project: { homepage: 'https://example.com/me' },
      roomNames: { '35': "Maria's shop storefront" },
      editor: editorBuild,
      exportedAt,
    })

    assert.deepEqual(manifest.author, { name: 'Lali' })
    assert.deepEqual(manifest.project, { homepage: 'https://example.com/me' })
    assert.deepEqual(manifest.roomNames, { '35': "Maria's shop storefront" })
  })

  void it('writes the seed of the base when the dialog has none', () => {
    const manifest = buildExportManifest({
      seed: undefined,
      files: filesOf(1),
      metadata: { seed: 987 },
      author: undefined,
      project: undefined,
      roomNames: undefined,
      editor: editorBuild,
      exportedAt,
    })

    assert.equal(manifest.seed, 987)
  })
})

void describe('buildExportFts', () => {
  void it('keeps the polygons and rebuilds the rooms and the distances', () => {
    const map = flatMap()
    const polygons = map.polygons.slice(0, 10)
    const exported = buildExportFts(map.fts, polygons)

    assert.equal(exported.polygons.length, 10)

    const roomPolygons = exported.rooms.flatMap((room) => {
      return room.polygons
    })

    assert.equal(roomPolygons.length, 10)
    assert.equal(exported.roomDistances.length, exported.rooms.length ** 2)
    assert.ok(
      exported.roomDistances.every((distance) => {
        return distance.distance === -1
      }),
    )
  })

  void it('measures the rooms through the portals, so a wall is a wall in the game too', () => {
    const map = flatMap()
    const polygons = map.polygons.map((polygon, index) => {
      const third = Math.floor((index / map.polygons.length) * 3)

      return { ...polygon, room: third + 1 }
    })

    /**
     * Builds a portal with its crossing point at a place on the x axis.
     *
     * @param first One room.
     * @param second The other room.
     * @param x Where the quad crosses.
     *
     * @returns The door between the two rooms.
     */
    function portalOf(first: number, second: number, x: number): (typeof map.fts.portals)[number] {
      const corner = { position: { x, y: 0, z: 0 } }

      return {
        room1: first,
        room2: second,
        usePortal: 0,
        polygon: { type: 0, vertices: [corner, corner, corner, corner] },
      } as unknown as (typeof map.fts.portals)[number]
    }

    // a chain of three rooms: 1 and 3 are only reachable through 2, so their pair has a path distance and the pairs
    // that share a portal keep the straight line
    const fts = {
      ...map.fts,
      rooms: [...map.fts.rooms, { portals: [], polygons: [] }, { portals: [], polygons: [] }],
      portals: [portalOf(1, 2, 0), portalOf(2, 3, 10)],
    }
    const exported = buildExportFts(fts, polygons)
    const size = exported.rooms.length
    const secondRow = size * 2
    const thirdRow = size * 3

    assert.equal(size, 4)
    assert.equal(exported.roomDistances[1 + secondRow].distance, -1)
    assert.equal(exported.roomDistances[2 + size].distance, -1)
    assert.ok(exported.roomDistances[1 + thirdRow].distance > 0)
  })

  void it('drops a portal of a room that lost its polygons', () => {
    const map = flatMap()

    // a portal into a room that is not there any more (the room id is past the polygons of the export)
    const portal = {
      room1: 1,
      room2: 9,
      usePortal: 0,
      polygon: { type: 0, vertices: [] },
    } as unknown as (typeof map.fts.portals)[number]
    const fts = { ...map.fts, portals: [portal] }
    const exported = buildExportFts(fts, map.polygons.slice(0, 5))

    assert.deepEqual(exported.portals, [])
  })

  void it('refuses a level without a polygon', () => {
    const map = flatMap()

    assert.throws(() => {
      return buildExportFts(map.fts, [])
    }, /no polygon left/u)
  })
})

void describe('exportLevelFiles', () => {
  void it('writes the three packed files of the edited level', () => {
    const map = flatMap()

    map.deletePolygons([0])

    const files = exportLevelFiles(map)
    const scene = FTS.load(unpackArxFile(files.fts, 'fts'))

    assert.equal(scene.polygons.length, 120)
    assert.equal(
      scene.rooms.flatMap((room) => {
        return room.polygons
      }).length,
      120,
    )

    const description = DLF.load(unpackArxFile(files.dlf, 'dlf'))
    const lighting = LLF.load(unpackArxFile(files.llf, 'llf'))

    assert.equal(description.header.numberOfPolygonsInFTS, 120)
    assert.equal(lighting.header.numberOfPolygonsInFTS, 120)
  })

  void it('writes the index of the dialog into the description', () => {
    const map = flatMap()
    const files = exportLevelFiles(map, { levelIndex: 13 })
    const description = DLF.load(unpackArxFile(files.dlf, 'dlf'))

    assert.equal(description.header.levelIdx, 13)
  })
})

void describe('exportLevelZip', () => {
  void it('reports the steps of the export, in the order they run', async () => {
    const map = flatMap()
    const steps: number[] = []

    await exportLevelZip(map, (percent) => {
      steps.push(percent)
    })

    assert.deepEqual(steps, [0, 10, 70, 80, 90, 100])
  })

  void it('zips the files under the paths of the game', async () => {
    const map = flatMap()
    const level = map.dlf.header.levelIdx
    const { name, data } = await exportLevelZip(map)
    const archive = await JSZip.loadAsync(data)

    assert.equal(name, 'mod.zip')
    assert.deepEqual(
      Object.values(archive.files)
        .filter((entry) => {
          return !entry.dir
        })
        .map((entry) => {
          return entry.name
        })
        .toSorted(),
      [
        levelFilePath(level, 'dlf'),
        levelFilePath(level, 'fts'),
        levelFilePath(level, 'llf'),
        SETTINGS_PATH,
        'manifest.json',
      ].toSorted(),
    )

    const scene = await archive.file(levelFilePath(level, 'fts'))?.async('arraybuffer')

    assert.notEqual(scene, undefined)
    assert.ok((scene?.byteLength ?? 0) > 0)
  })

  void it('keeps the level it was made from, and its steps, when the level has some', async () => {
    const map = flatMap()
    const record = { version: 1, kind: 'deleteFaces', faces: [0] } as const
    const { data } = await exportLevelZip(map, undefined, {
      levelIndex: 13,
      seed: '590085197',
      exportedAt: '2026-11-12T20:30:00.000Z',
      history: { records: [record], position: 1 },
    })
    const archive = await JSZip.loadAsync(data)
    const entries = Object.values(archive.files).map((entry) => {
      return entry.name
    })

    // the source goes under the folder of the editor, with the paths of the game, and the steps beside the manifest
    const level = map.dlf.header.levelIdx
    const written = new Set(entries)
    function sourcePath(kind: 'fts' | 'dlf' | 'llf'): string {
      return `editor/source/${levelFilePath(level, kind).replace(/^\//u, '')}`
    }

    assert.ok(written.has(sourcePath('fts')))
    assert.ok(written.has(sourcePath('dlf')))
    assert.ok(written.has(sourcePath('llf')))
    assert.ok(written.has(SETTINGS_PATH))

    // the source is the level the map was built from, byte for byte
    const source = await archive.file(sourcePath('fts'))?.async('arraybuffer')

    assert.deepEqual(new Uint8Array(source ?? new ArrayBuffer(0)), new Uint8Array(map.source.fts))

    // the steps are in the settings of the editor, with the fingerprint of that level, so a replay lands on it
    const settings = JSON.parse((await archive.file(SETTINGS_PATH)?.async('string')) ?? '{}') as {
      readonly history?: {
        readonly version?: number
        readonly fingerprint?: string
        readonly records?: readonly unknown[]
        readonly position?: number
      }
    }

    assert.equal(settings.history?.version, 2)
    assert.equal(settings.history?.fingerprint, map.fingerprint)
    assert.deepEqual(settings.history?.records, [record])
    assert.equal(settings.history?.position, 1)

    // and the manifest lists every file of the archive: the level, the source and the settings
    const manifest = JSON.parse((await archive.file('manifest.json')?.async('string')) ?? '{}') as {
      readonly files?: readonly string[]
    }

    assert.deepEqual(manifest.files, [
      levelFilePath(13, 'fts'),
      levelFilePath(13, 'dlf'),
      levelFilePath(13, 'llf'),
      SETTINGS_PATH,
      sourcePath('fts'),
      sourcePath('dlf'),
      sourcePath('llf'),
    ])
  })

  void it('writes the settings of the editor without a source when the level has no steps', async () => {
    const camera: StoredPose = { position: [120, -60, 430], rotation: [10, 45, 0] }
    const { data } = await exportLevelZip(flatMap(), undefined, { camera })
    const archive = await JSZip.loadAsync(data)
    const entries = new Set(
      Object.values(archive.files).map((entry) => {
        return entry.name
      }),
    )

    // the pose of the camera is the state of the editor: it goes into the settings, and the settings into the manifest
    assert.ok(entries.has(SETTINGS_PATH))
    assert.equal(
      [...entries].some((entry) => {
        return entry.startsWith(SOURCE_FOLDER)
      }),
      false,
    )

    const settings = JSON.parse((await archive.file(SETTINGS_PATH)?.async('string')) ?? '{}') as {
      readonly camera?: unknown
      readonly history?: unknown
    }

    assert.deepEqual(settings.camera, camera)
    assert.equal(settings.history, undefined)
  })

  void it('writes the level under the index and the seed of the dialog', async () => {
    const map = flatMap()
    const { data } = await exportLevelZip(map, undefined, {
      levelIndex: 13,
      seed: '590085197',
      exportedAt: '2026-11-12T20:30:00.000Z',
    })
    const archive = await JSZip.loadAsync(data)
    const raw = (await archive.file('manifest.json')?.async('string')) ?? '{}'

    // the manifest says what the level is made with, and the three files are under the index of the dialog
    const manifest = JSON.parse(raw) as Record<string, unknown>

    assert.deepEqual(manifest.files, [...filesOf(13), SETTINGS_PATH])
    assert.equal(manifest.seed, 590_085_197)

    // one signing key, the editor's: two of them would say the same thing twice
    assert.equal('generator' in manifest, false)

    // the block of the editor is the build, and a key without a value is not written at all
    assert.deepEqual(manifest.editor, {
      name: 'arx-fatalis-browser-editor',
      version: 'local',
      commit: 'local',
      builtAt: 'local',
      url: 'https://github.com/arx-tools/arx-fatalis-browser-editor',
      exportedAt: '2026-11-12T20:30:00.000Z',
    })
    assert.equal('name' in manifest, false)
    assert.equal('camera' in manifest, false)
    assert.notEqual(archive.file(levelFilePath(13, 'fts')), null)
    assert.notEqual(archive.file(levelFilePath(13, 'dlf')), null)
    assert.notEqual(archive.file(levelFilePath(13, 'llf')), null)

    // the description carries the index too, so the game reads the level as the level 13
    const description = (await archive.file(levelFilePath(13, 'dlf'))?.async('arraybuffer')) ?? new ArrayBuffer(0)

    assert.ok(description.byteLength > 0)
    assert.equal(DLF.load(unpackArxFile(description, 'dlf')).header.levelIdx, 13)
  })
})
