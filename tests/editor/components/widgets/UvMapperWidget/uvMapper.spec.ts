import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import {
  clampUv,
  mismatchMessageOf,
  MAX_ZOOM,
  MIN_ZOOM,
  movedCorner,
  pannedBy,
  sameUvs,
  screenOfUv,
  snappedPoint,
  turnedUvs,
  uvSelectionOf,
  uvsOf,
  uvOfScreen,
  viewOf,
  zoomAfter,
  type StagePoint,
} from '../../../../../src/editor/components/widgets/UvMapperWidget/uvMapper.ts'

/**
 * A face of the test, with the uv of its corners.
 *
 * @param quad Whether it is a quad.
 * @param uvs The uv of the corners, as `[u, v]` pairs.
 *
 * @returns The polygon.
 */
function face(quad: boolean, uvs: ReadonlyArray<readonly [number, number]>): ArxPolygon {
  const vertices = uvs.map(([u, v]) => {
    return { x: 0, y: 0, z: 0, u, v }
  })
  let flags: number = ArxPolygonFlags.None

  if (quad) {
    flags = ArxPolygonFlags.Quad
  }

  while (vertices.length < 4) {
    vertices.push({ ...vertices.at(-1)! })
  }

  return {
    vertices: [vertices[0], vertices[1], vertices[2], vertices[3]],
    textureContainerId: 1,
    norm: { x: 0, y: 1, z: 0 },
    norm2: { x: 0, y: 1, z: 0 },
    transval: 0,
    area: 1,
    flags,
    room: 1,
  }
}

void describe('uvsOf', () => {
  void it('gives the three corners of a triangle and the four of a quad', () => {
    assert.deepEqual(
      uvsOf(
        face(false, [
          [0, 0],
          [1, 0],
          [1, 1],
        ]),
      ),
      [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
      ],
    )
    assert.equal(
      uvsOf(
        face(true, [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]),
      ).length,
      4,
    )
  })
})

void describe('clampUv', () => {
  void it('keeps a corner inside the texture', () => {
    assert.deepEqual(clampUv({ u: -0.2, v: 1.4 }), { u: 0, v: 1 })
    assert.deepEqual(clampUv({ u: 0.25, v: 0.5 }), { u: 0.25, v: 0.5 })
  })
})

void describe('the view of the widget', () => {
  const corners = [
    { u: 0.4, v: 0.4 },
    { u: 0.6, v: 0.4 },
    { u: 0.6, v: 0.6 },
    { u: 0.4, v: 0.6 },
  ]

  void it('centres the view on the middle of the face', () => {
    const view = viewOf(200, 1, corners)

    assert.deepEqual(view.centre, { u: 0.5, v: 0.5 })
    // the middle of the square is the middle of the face, and one unit of the uv is the side of the square
    assert.deepEqual(screenOfUv(view, { u: 0.5, v: 0.5 }), { x: 100, y: 100 })
    // the v goes down the file: a bigger v is lower on the square
    assert.deepEqual(screenOfUv(view, { u: 0.6, v: 0.4 }), { x: 120, y: 80 })
  })

  void it('draws the v down the file, the way the 3D view reads the texture', () => {
    const view = viewOf(200, 1, corners)

    // the first row of the image is the v of 0: it is the upper edge of the square (the game uploads the file as it is)
    assert.ok(screenOfUv(view, { u: 0.5, v: 0 }).y < screenOfUv(view, { u: 0.5, v: 1 }).y)
  })

  void it('zooms around the face', () => {
    const view = viewOf(200, 2, corners)

    assert.deepEqual(screenOfUv(view, { u: 0.5, v: 0.5 }), { x: 100, y: 100 })
    assert.deepEqual(screenOfUv(view, { u: 0.6, v: 0.5 }), { x: 140, y: 100 })
  })

  void it('reads the uv back from a pixel', () => {
    const view = viewOf(200, 1.5, corners)
    const uv = { u: 0.55, v: 0.45 }
    const back = uvOfScreen(view, screenOfUv(view, uv))

    assert.ok(Math.abs(back.u - uv.u) < 1e-9)
    assert.ok(Math.abs(back.v - uv.v) < 1e-9)
  })

  void it('pans the middle of the view away from the face', () => {
    const view = viewOf(200, 1, corners, { u: 0.1, v: -0.05 })

    assert.deepEqual(view.centre, { u: 0.6, v: 0.45 })
    assert.deepEqual(screenOfUv(view, { u: 0.6, v: 0.45 }), { x: 100, y: 100 })
  })

  void it('keeps a pixel outside the texture on its border', () => {
    const view = viewOf(200, 1, corners)

    // up and left of the face: the v of 0 is the top of the image
    assert.deepEqual(uvOfScreen(view, { x: -1000, y: -1000 }), { u: 0, v: 0 })
  })
})

void describe('pannedBy', () => {
  const corners = [
    { u: 0.4, v: 0.4 },
    { u: 0.6, v: 0.4 },
    { u: 0.6, v: 0.6 },
    { u: 0.4, v: 0.6 },
  ]

  void it('moves the texture with the pointer', () => {
    const view = viewOf(200, 2, corners)
    const before = screenOfUv(view, { u: 0.5, v: 0.5 })
    const pan = pannedBy({ u: 0, v: 0 }, { x: 30, y: 20 }, 200, 2)
    const after = screenOfUv(viewOf(200, 2, corners, pan), { u: 0.5, v: 0.5 })

    assert.ok(Math.abs(after.x - before.x - 30) < 1e-9)
    assert.ok(Math.abs(after.y - before.y - 20) < 1e-9)
  })

  void it('takes a smaller step of the uv in a smaller square', () => {
    const wide = pannedBy({ u: 0, v: 0 }, { x: 40, y: 0 }, 400, 1)
    const narrow = pannedBy({ u: 0, v: 0 }, { x: 40, y: 0 }, 200, 1)

    assert.ok(Math.abs(narrow.u) > Math.abs(wide.u))
    assert.ok(Math.abs(wide.u + 0.1) < 1e-9)
  })

  void it('adds the step to the pan it is given', () => {
    assert.deepEqual(pannedBy({ u: 0.25, v: 0.5 }, { x: 0, y: 0 }, 200, 1), { u: 0.25, v: 0.5 })
  })
})

void describe('zoomAfter', () => {
  void it('keeps the zoom between the two ends', () => {
    assert.equal(zoomAfter(MIN_ZOOM, 400), MIN_ZOOM)
    assert.equal(zoomAfter(MAX_ZOOM, -400), MAX_ZOOM)
  })

  void it('turns the same step in and back', () => {
    const zoomed = zoomAfter(2, -100)

    assert.ok(zoomed > 2)
    assert.ok(Math.abs(zoomAfter(zoomed, 100) - 2) < 1e-9)
  })
})

void describe('movedCorner', () => {
  void it('moves one corner and keeps the others', () => {
    const corners = [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
    ]

    assert.deepEqual(movedCorner(corners, 1, { u: 0.5, v: 0.25 }), [
      { u: 0, v: 0 },
      { u: 0.5, v: 0.25 },
      { u: 1, v: 1 },
    ])
  })

  void it('keeps the moved corner inside the texture', () => {
    assert.deepEqual(movedCorner([{ u: 0.5, v: 0.5 }], 0, { u: 2, v: -1 }), [{ u: 1, v: 0 }])
  })
})

void describe('sameUvs', () => {
  void it('tells two sets of corners apart', () => {
    assert.equal(
      sameUvs(
        [
          { u: 0, v: 0 },
          { u: 1, v: 1 },
        ],
        [
          { u: 0, v: 0 },
          { u: 1, v: 1 },
        ],
      ),
      true,
    )
    assert.equal(
      sameUvs(
        [
          { u: 0, v: 0 },
          { u: 1, v: 1 },
        ],
        [
          { u: 0, v: 0 },
          { u: 1, v: 0.999 },
        ],
      ),
      false,
    )
    assert.equal(sameUvs([{ u: 0, v: 0 }], []), false)
  })
})

void describe('uvSelectionOf', () => {
  /**
   * A level of the test: polygons on a container, with the uv of the corners.
   *
   * @param entries The polygons, as `[container, uvs]`.
   *
   * @returns The polygons of the level.
   */
  function level(entries: ReadonlyArray<readonly [number, ReadonlyArray<readonly [number, number]>]>): ArxPolygon[] {
    return entries.map(([container, uvs]) => {
      const polygon = face(uvs.length === 4, uvs)

      return { ...polygon, textureContainerId: container }
    })
  }

  /**
   * The names of the containers of the test.
   *
   * @param id The container id.
   *
   * @returns The name of the texture.
   */
  function nameOf(id: number): string | undefined {
    return new Map([
      [1, '[stone]_wall1.bmp'],
      [2, '[wood]_door.bmp'],
      [3, '[stone]_wall1.bmp'],
    ]).get(id)
  }

  const quadUvs = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const

  void it('gives nothing for an empty selection', () => {
    assert.deepEqual(uvSelectionOf({ indices: [], polygons: [], textureNameOf: nameOf }), { kind: 'empty' })
  })

  void it('edits one face', () => {
    const selection = uvSelectionOf({ indices: [0], polygons: level([[1, quadUvs]]), textureNameOf: nameOf })

    assert.deepEqual(selection, {
      kind: 'ready',
      faces: [0],
      corners: [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
        { u: 1, v: 1 },
      ],
    })
  })

  void it('edits many faces that share their texture and their uv', () => {
    // two faces of the level on the same container, with the same corners: one shape on the texture
    const polygons = level([
      [1, quadUvs],
      [1, quadUvs],
    ])
    const selection = uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf })

    assert.equal(selection.kind, 'ready')

    if (selection.kind !== 'ready') {
      return
    }

    assert.deepEqual(selection.faces, [0, 1])
  })

  void it('edits faces on two containers that name the same texture', () => {
    // the containers 1 and 3 name the same file: the game draws the same texture, so the mapper may edit them together
    const polygons = level([
      [1, quadUvs],
      [3, quadUvs],
    ])

    assert.equal(uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf }).kind, 'ready')
  })

  void it('refuses faces with different textures', () => {
    const polygons = level([
      [1, quadUvs],
      [2, quadUvs],
    ])
    const selection = uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf })

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['textures'] })
  })

  void it('refuses faces with the same texture and other uv', () => {
    const polygons = level([
      [1, quadUvs],
      [
        1,
        [
          [0.5, 0.5],
          [1, 0.5],
          [0.5, 1],
          [1, 1],
        ],
      ],
    ])
    const selection = uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf })

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv'] })
  })

  void it('names both reasons, the uv first', () => {
    const polygons = level([
      [1, quadUvs],
      [
        2,
        [
          [0.5, 0.5],
          [1, 0.5],
          [0.5, 1],
          [1, 1],
        ],
      ],
    ])
    const selection = uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf })

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv', 'textures'] })
  })

  void it('refuses a triangle with a quad', () => {
    // a triangle has three corners: it can not share the uv of a quad, whatever the numbers are
    const polygons = [
      ...level([
        [1, quadUvs],
        [1, quadUvs],
      ]),
      face(false, [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    ]
    const selection = uvSelectionOf({ indices: [0, 2], polygons, textureNameOf: nameOf })

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv'] })
  })

  void it('skips an index the level does not have', () => {
    const selection = uvSelectionOf({ indices: [0, 5], polygons: level([[1, quadUvs]]), textureNameOf: nameOf })

    assert.equal(selection.kind, 'ready')
  })
})

void describe('mismatchMessageOf', () => {
  void it('writes the reason of the refusal', () => {
    assert.equal(mismatchMessageOf(['uv']), "Can't edit UV on selection: mismatching UV mapping")
    assert.equal(mismatchMessageOf(['textures']), "Can't edit UV on selection: mismatching textures")
    assert.equal(
      mismatchMessageOf(['uv', 'textures']),
      "Can't edit UV on selection: mismatching UV mapping, mismatching textures",
    )
  })
})

void describe('snappedPoint', () => {
  /**
   * Reads the two numbers of a place the snap gave, rounded to the thousandth (the cosine of 45 degrees is not exact).
   *
   * @param place Where the snapped drag ended on the square.
   *
   * @returns The x and y of it, rounded.
   */
  function numbers(place: StagePoint): [number, number] {
    return [Math.round(place.x * 1000) / 1000, Math.round(place.y * 1000) / 1000]
  }

  const origin = { x: 100, y: 100 }

  void it('lays the pointer on the horizontal axis', () => {
    // a little more down than across: the axis is the 0 degree one, and the down is dropped
    assert.deepEqual(numbers(snappedPoint(origin, { x: 140, y: 110 })), [140, 100])
  })

  void it('lays it on the vertical axis', () => {
    assert.deepEqual(numbers(snappedPoint(origin, { x: 110, y: 140 })), [100, 140])
  })

  void it('goes to the nearer axis, not to the diagonal', () => {
    // 35 degrees across: the nearest of the four axes is the horizontal one, and the down is dropped
    assert.deepEqual(numbers(snappedPoint(origin, { x: 140, y: 128 })), [140, 100])
  })

  void it('lays it on the 180 degree axis', () => {
    assert.deepEqual(numbers(snappedPoint(origin, { x: 60, y: 140 })), [60, 100])
  })

  void it('lays it on the 270 degree axis', () => {
    assert.deepEqual(numbers(snappedPoint(origin, { x: 90, y: 40 })), [100, 40])
  })

  void it('stays at the corner when the pointer did not move', () => {
    assert.deepEqual(numbers(snappedPoint(origin, origin)), [100, 100])
  })
})

void describe('turnedUvs', () => {
  /**
   * Four corners of a quad, each with its own uv, in the stored order.
   *
   * @remarks
   * The stored order is two edges (`a-b` and `c-d`), so the corners are the top left, the top right, the bottom left
   * and the bottom right: the way around is `a, b, d, c`.
   *
   * @returns The corners.
   */
  function quad(): Array<{ u: number; v: number }> {
    return [
      { u: 0, v: 1 },
      { u: 1, v: 1 },
      { u: 0, v: 0 },
      { u: 1, v: 0 },
    ]
  }

  /**
   * The uv of the corners, as `u,v` strings.
   *
   * @param corners The corners to read.
   *
   * @returns The uv of each corner, in the stored order.
   */
  function uvOf(corners: ReadonlyArray<{ readonly u: number; readonly v: number }>): string[] {
    return corners.map((corner) => {
      return `${corner.u}/${corner.v}`
    })
  }

  void it('rotates the quad clockwise: every corner takes the uv of the one before it around', () => {
    // the way around is a, b, d, c: the top left takes the uv of the bottom left, the top right the top left's, and so
    // on — the picture on the face turns a quarter clockwise
    const turned = turnedUvs(quad(), 'rotate-cw')

    assert.deepEqual(uvOf(turned), ['0/0', '0/1', '1/0', '1/1'])
  })

  void it('rotates it back counter-clockwise', () => {
    const once = turnedUvs(quad(), 'rotate-cw')
    const back = turnedUvs(once, 'rotate-ccw')

    assert.deepEqual(uvOf(back), uvOf(quad()))
  })

  void it('flips the quad horizontally', () => {
    // the two ends of the first edge and the two ends of the edge across it swap
    const turned = turnedUvs(quad(), 'flip-h')

    assert.deepEqual(uvOf(turned), ['1/1', '0/1', '1/0', '0/0'])
  })

  void it('flips the quad vertically', () => {
    // the top left and the bottom left swap, and the top right and the bottom right
    const turned = turnedUvs(quad(), 'flip-v')

    assert.deepEqual(uvOf(turned), ['0/0', '1/0', '0/1', '1/1'])
  })

  void it('keeps the uv values: a turn only lays them on other corners', () => {
    const turns = ['rotate-ccw', 'rotate-cw', 'flip-h', 'flip-v'] as const
    const sorted = turns.map((turn) => {
      return uvOf(turnedUvs(quad(), turn)).toSorted()
    })
    const expected = uvOf(quad()).toSorted()

    assert.deepEqual(sorted, [expected, expected, expected, expected])
  })

  void it('turns a triangle around itself', () => {
    const triangle = [
      { u: 0, v: 1 },
      { u: 1, v: 0 },
      { u: 0, v: 0 },
    ]
    const rotated = turnedUvs(triangle, 'rotate-cw')
    const back = turnedUvs(rotated, 'rotate-ccw')
    const flippedH = turnedUvs(triangle, 'flip-h')
    const flippedV = turnedUvs(triangle, 'flip-v')

    assert.deepEqual(uvOf(rotated), ['0/0', '0/1', '1/0'])
    assert.deepEqual(uvOf(back), uvOf(triangle))
    assert.deepEqual(uvOf(flippedH), ['1/0', '0/1', '0/0'])
    assert.deepEqual(uvOf(flippedV), ['0/0', '1/0', '0/1'])
  })

  void it('copies the corners, so the model is not shared with the answer', () => {
    const corners = quad()
    const turned = turnedUvs(corners, 'flip-h')

    ;(turned[0] as { u: number }).u = 0.5

    assert.equal(corners[1]?.u, 1)
  })
})
