import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchLevelFiles, levelFileNames, levelFileUrls } from '../../../../src/_editor/modules/view3d/levelSource.ts'

/**
 * A fake fetch which answers with the bytes of the url.
 *
 * @remarks
 * The response is a real `Response` (node has it), so it behaves like the one the browser gives back,
 * without a network.
 *
 * @param failOn `true` to answer with a 404 for every request.
 *
 * @returns The fake fetch and the urls it was called with.
 */
function fakeFetch(failOn = false): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = []

  async function fetchImpl(input: string): Promise<Response> {
    calls.push(input)

    // the body is the url itself, read through the response API the caller uses
    const body = await new Response(input).arrayBuffer()
    let status = 200
    let statusText = 'OK'

    if (failOn) {
      status = 404
      statusText = 'Not Found'
    }

    return new Response(body, { status, statusText })
  }

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

void describe('levelFileNames', () => {
  void it('follows the naming of the game data', () => {
    assert.deepEqual(levelFileNames(11), { dlf: 'level11.dlf', fts: 'fast.fts', llf: 'level11.llf' })
  })
})

void describe('levelFileUrls', () => {
  void it('points at the pkware-test-files repository', () => {
    const urls = levelFileUrls(11)

    assert.ok(urls.fts.startsWith('https://raw.githubusercontent.com/arx-tools/pkware-test-files/'))
    assert.ok(urls.fts.endsWith('/arx-fatalis/level11/fast.fts'))
    assert.ok(urls.dlf.endsWith('/arx-fatalis/level11/level11.dlf'))
    assert.ok(urls.llf.endsWith('/arx-fatalis/level11/level11.llf'))
  })
})

void describe('fetchLevelFiles', () => {
  void it('downloads the three files', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const files = await fetchLevelFiles(11, fetchImpl)

    assert.equal(calls.length, 3)
    // every buffer holds the url it came from, so the three landed in the right slot
    assert.equal(new TextDecoder().decode(files.dlf), levelFileUrls(11).dlf)
    assert.equal(new TextDecoder().decode(files.fts), levelFileUrls(11).fts)
    assert.equal(new TextDecoder().decode(files.llf), levelFileUrls(11).llf)
  })

  void it('fails when a file can not be downloaded', async () => {
    const { fetchImpl } = fakeFetch(true)

    await assert.rejects(fetchLevelFiles(11, fetchImpl), /Failed to download/u)
  })
})
