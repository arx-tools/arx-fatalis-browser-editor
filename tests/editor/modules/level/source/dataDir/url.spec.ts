import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dataFileUrl } from '../../../../../../src/editor/modules/level/source/dataDir/url.ts'

void describe('dataFileUrl', () => {
  void it('asks the development server for a folder of the disk', () => {
    assert.equal(
      dataFileUrl('/home/lali/arx/data', 'graph/levels/level8/fast.fts', true),
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=graph%2Flevels%2Flevel8%2Ffast.fts',
    )
    assert.equal(
      dataFileUrl('file:///home/lali/arx/data', 'graph/obj3d/textures/wall.jpg', true),
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=graph%2Fobj3d%2Ftextures%2Fwall.jpg',
    )
  })

  void it('takes a folder url as the base of the file', () => {
    assert.equal(
      dataFileUrl('https://example.com/data/', 'graph/levels/level8/fast.fts', true),
      'https://example.com/data/graph/levels/level8/fast.fts',
    )
    assert.equal(
      dataFileUrl('https://example.com/data', 'graph/levels/level8/fast.fts', false),
      'https://example.com/data/graph/levels/level8/fast.fts',
    )
  })

  void it('says why a folder of the disk needs the development server', () => {
    assert.throws(() => {
      return dataFileUrl('file:///home/lali/arx/data', 'graph/levels/level8/fast.fts', false)
    }, /needs its development server/u)
  })
})
