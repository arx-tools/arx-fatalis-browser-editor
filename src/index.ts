import { explode, implode, concatArrayBuffers, sliceArrayBufferAt } from 'node-pkware/simple'
import { getHeaderSize } from 'arx-header-size'
import { FTS } from 'arx-convert'
import type { ArxFTS } from 'arx-convert/types'
import { downloadBinaryAs, zipBuffers } from './download.js'
import { downloadBtn, isLoading } from './ui/ui.js'

// --------------------

async function wait(delayInMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, delayInMs)
  })
}

async function getFTS(level: number): Promise<ArxFTS> {
  console.log(`downloading level ${level} fts...`)

  const response = await fetch(
    `https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis/level${level}/fast.fts`,
  )
  if (!response.ok) {
    const errorResponse = await response.text()
    throw new Error(`Failed to load level ${level}: ${errorResponse}`)
  }

  console.log(`finished downloading level ${level} fts`)

  await wait(100)

  console.log(`unpacking level ${level} fts...`)

  const packedFts = await response.arrayBuffer()
  const headerSize = getHeaderSize(packedFts, 'fts')

  await wait(100)

  const [header, body] = sliceArrayBufferAt(packedFts, headerSize.total)

  await wait(100)

  const explodedBody = explode(body)
  await wait(100)

  const unpackedFts = concatArrayBuffers([header, explodedBody])

  await wait(100)

  const fts = FTS.load(unpackedFts)

  console.log(`finished unpacking level ${level} fts`)

  return fts
}

async function saveFTS(fts: ArxFTS, level: number): Promise<ArrayBuffer> {
  console.log(`packing level ${level} fts...`)

  await wait(100)

  console.time('FTS.save')
  const unpackedFts = FTS.save(fts) // 1739ms
  console.timeEnd('FTS.save')

  await wait(100)

  console.time('getHeaderSize')
  const headerSize = getHeaderSize(unpackedFts, 'fts') // 0ms
  console.timeEnd('getHeaderSize')

  await wait(100)

  console.time('sliceArrayBufferAt')
  const [header, body] = sliceArrayBufferAt(unpackedFts, headerSize.total) // 5ms
  console.timeEnd('sliceArrayBufferAt')

  await wait(100)

  console.time('implode')
  const implodedBody = implode(body, 'binary', 'large') // 14308ms in firefox, 9521ms in chrome
  console.timeEnd('implode')

  await wait(100)

  console.time('concatArrayBuffers')
  const packedFts = concatArrayBuffers([header, implodedBody]) // 3ms
  console.timeEnd('concatArrayBuffers')

  await wait(100)

  console.log(`finished packing level ${level} fts`)

  return packedFts
}

function changeStuff(fts: ArxFTS, level: number): void {
  console.log(`modifying level ${level} fts...`)
  for (const polygon of fts.polygons) {
    polygon.vertices[0].y = polygon.vertices[0].y - 10
  }

  console.log(`finished modifying level ${level} fts`)
}

// --------------------

const level = 11

isLoading.currentValue = true

const fts = await getFTS(level)
changeStuff(fts, level)

isLoading.currentValue = false

downloadBtn.addEventListener('click', async () => {
  isLoading.currentValue = true

  console.log('downloading')

  const packedFts = await saveFTS(fts, level)

  const zip = await zipBuffers({
    [`/game/graph/levels/level${level}/fast.fts`]: packedFts,
  })

  downloadBinaryAs('mod.zip', zip, 'application/zip')

  isLoading.currentValue = false
})
