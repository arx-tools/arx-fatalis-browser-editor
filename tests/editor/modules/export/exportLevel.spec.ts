import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DLF, FTS, LLF } from 'arx-convert'
import type { ArxColor, ArxLLF, ArxPolygon } from 'arx-convert/types'
import JSZip from 'jszip'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import {
  buildExportDlf,
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
      [levelFilePath(level, 'dlf'), levelFilePath(level, 'fts'), levelFilePath(level, 'llf')].toSorted(),
    )

    const scene = await archive.file(levelFilePath(level, 'fts'))?.async('arraybuffer')

    assert.notEqual(scene, undefined)
    assert.ok((scene?.byteLength ?? 0) > 0)
  })
})
