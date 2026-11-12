import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import {
  clampUv,
  containsFacePoint,
  cornerNameOf,
  maximizedUvs,
  mismatchMessageOf,
  MAX_ZOOM,
  MIN_ZOOM,
  movedCorner,
  movedUvs,
  numberOfText,
  pannedBy,
  perimeterOf,
  quarteredUvs,
  quarterOfUvs,
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

void describe('cornerNameOf', () => {
  void it('names the corners of a face with the letters of its uv, in the order of the model', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((index) => {
        return cornerNameOf(index)
      }),
      ['A', 'B', 'C', 'D'],
    )
  })

  void it('falls back to the number of a corner past the letters', () => {
    assert.equal(cornerNameOf(4), '5')
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

void describe('numberOfText', () => {
  void it('reads a number a user typed', () => {
    assert.equal(numberOfText('0.5'), 0.5)
    assert.equal(numberOfText('-0.25'), -0.25)
    assert.equal(numberOfText('1'), 1)
  })

  void it('ignores the spaces around the number', () => {
    assert.equal(numberOfText('  0.75  '), 0.75)
  })

  void it('reads a comma as the decimal point', () => {
    assert.equal(numberOfText('0,5'), 0.5)
  })

  void it('reads nothing from an empty or a half typed field', () => {
    assert.equal(numberOfText(''), undefined)
    assert.equal(numberOfText(' '.repeat(3)), undefined)
    assert.equal(numberOfText('.'), undefined)
    assert.equal(numberOfText('-'), undefined)
  })

  void it('reads nothing from a text or an infinity', () => {
    assert.equal(numberOfText('abc'), undefined)
    assert.equal(numberOfText('1e3'), undefined)
    assert.equal(numberOfText('Infinity'), undefined)
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

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['textures'], textureName: undefined })
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

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv'], textureName: '[stone]_wall1.bmp' })
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

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv', 'textures'], textureName: undefined })
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

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv'], textureName: '[stone]_wall1.bmp' })
  })

  void it('gives no texture name when the level has no name for it', () => {
    const polygons = level([
      [4, quadUvs],
      [
        4,
        [
          [0.5, 0.5],
          [1, 0.5],
          [0.5, 1],
          [1, 1],
        ],
      ],
    ])
    const selection = uvSelectionOf({ indices: [0, 1], polygons, textureNameOf: nameOf })

    assert.deepEqual(selection, { kind: 'mismatch', reasons: ['uv'], textureName: undefined })
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

  void it('turns the picture clockwise: every corner takes the uv of the one after it around', () => {
    // the way around is a, b, d, c, and it is counter-clockwise as the face is seen (a v of 0 is the top of the image),
    // so the picture turns clockwise when the content of a corner moves a step back on the ring
    const turned = turnedUvs(quad(), 'rotate-cw')

    assert.deepEqual(uvOf(turned), ['1/1', '1/0', '0/1', '0/0'])
  })

  void it('rotates it back counter-clockwise', () => {
    const once = turnedUvs(quad(), 'rotate-cw')
    const back = turnedUvs(once, 'rotate-ccw')

    assert.deepEqual(uvOf(back), uvOf(quad()))

    // the two turns are each other's inverse: the counter-clockwise one is the other permutation
    const other = turnedUvs(quad(), 'rotate-ccw')

    assert.deepEqual(uvOf(other), ['0/0', '0/1', '1/0', '1/1'])
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

    assert.deepEqual(uvOf(rotated), ['1/0', '0/0', '0/1'])
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

void describe('quarteredUvs', () => {
  /**
   * Four corners of a quad, in the stored order (top left, top right, bottom left, bottom right).
   *
   * @param u0 The left edge.
   * @param v0 The top edge.
   * @param u1 The right edge.
   * @param v1 The bottom edge.
   *
   * @returns The corners of a rectangle of the texture.
   */
  function rect(u0: number, v0: number, u1: number, v1: number): Array<{ u: number; v: number }> {
    return [
      { u: u0, v: v0 },
      { u: u1, v: v0 },
      { u: u0, v: v1 },
      { u: u1, v: v1 },
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

  void it('puts a quad that is not on a quarter on the top left one, each corner on its nearest point', () => {
    const quartered = quarteredUvs(rect(0, 0, 1, 1))

    assert.deepEqual(uvOf(quartered), ['0/0', '0.5/0', '0/0.5', '0.5/0.5'])
  })

  void it('gives every point of the quarter its own corner, even when two corners are close', () => {
    // two corners near the middle of the texture: without the pairing they would take the same point of the quarter
    const quartered = quarteredUvs([
      { u: 0.45, v: 0.45 },
      { u: 0.42, v: 0.48 },
      { u: 0.05, v: 0.05 },
      { u: 0.06, v: 0.02 },
    ])

    assert.deepEqual(uvOf(quartered).toSorted(), ['0/0', '0/0.5', '0.5/0', '0.5/0.5'].toSorted())
  })

  void it('walks the quarters clockwise on every click', () => {
    const topLeft = rect(0, 0, 0.5, 0.5)
    const topRight = quarteredUvs(topLeft)
    const bottomRight = quarteredUvs(topRight)
    const bottomLeft = quarteredUvs(bottomRight)
    const back = quarteredUvs(bottomLeft)

    assert.deepEqual(uvOf(topRight), ['0.5/0', '1/0', '0.5/0.5', '1/0.5'])
    assert.deepEqual(uvOf(bottomRight), ['0.5/0.5', '1/0.5', '0.5/1', '1/1'])
    assert.deepEqual(uvOf(bottomLeft), ['0/0.5', '0.5/0.5', '0/1', '0.5/1'])
    assert.deepEqual(uvOf(back), uvOf(topLeft))
  })

  void it('keeps the points a corner already has, whatever order they come in', () => {
    // the points of the top left quarter, in another order: the click takes them to the next quarter, and the corners
    // keep their own point of the square
    const shuffled = [
      { u: 0.5, v: 0.5 },
      { u: 0, v: 0 },
      { u: 0.5, v: 0 },
      { u: 0, v: 0.5 },
    ]

    assert.equal(quarterOfUvs(shuffled), 0)
    assert.equal(quarterOfUvs(rect(0, 0, 1, 1)), undefined)
    assert.equal(quarterOfUvs(shuffled.slice(0, 3)), undefined)
  })

  void it('leaves a triangle alone', () => {
    const triangle = [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 0, v: 1 },
    ]

    assert.deepEqual(quarteredUvs(triangle), triangle)
  })
})

void describe('maximizedUvs', () => {
  void it('stretches the quad over the whole texture', () => {
    const stretched = maximizedUvs([
      { u: 0.2, v: 0.1 },
      { u: 0.4, v: 0.1 },
      { u: 0.2, v: 0.3 },
      { u: 0.4, v: 0.3 },
    ])

    assert.deepEqual(
      stretched.map((corner) => {
        return `${corner.u}/${corner.v}`
      }),
      ['0/0', '1/0', '0/1', '1/1'],
    )
  })

  void it('leaves a triangle alone', () => {
    const triangle = [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 0, v: 1 },
    ]

    assert.deepEqual(maximizedUvs(triangle), triangle)
  })
})

void describe('perimeterOf', () => {
  void it('walks a quad as a, b, d, c, and a triangle as it is stored', () => {
    assert.deepEqual(
      perimeterOf([
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
        { u: 1, v: 1 },
      ]),
      [0, 1, 3, 2],
    )
    assert.deepEqual(
      perimeterOf([
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
      ]),
      [0, 1, 2],
    )
  })
})

void describe('containsFacePoint', () => {
  /**
   * The view of the test: a 100 pixel square, the whole texture on it.
   *
   * @returns The view of the test, the whole texture on the hundred pixels.
   */
  function view(): { size: number; zoom: number; centre: { u: number; v: number } } {
    return { size: 100, zoom: 1, centre: { u: 0.5, v: 0.5 } }
  }

  void it('takes a point inside the quad', () => {
    const corners = [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 0, v: 1 },
      { u: 1, v: 1 },
    ]

    // the stored order is a bowtie, and the shape is the perimeter: the middle of the square is inside it
    assert.equal(containsFacePoint(corners, view(), { x: 50, y: 50 }), true)
    assert.equal(containsFacePoint(corners, view(), { x: 10, y: 10 }), true)
  })

  void it('leaves a point outside of it', () => {
    // the left half of the texture: the perimeter of these four corners is the right half of the square
    const corners = [
      { u: 0.5, v: 0 },
      { u: 1, v: 0 },
      { u: 0.5, v: 1 },
      { u: 1, v: 1 },
    ]

    assert.equal(containsFacePoint(corners, view(), { x: 40, y: 40 }), false)
    assert.equal(containsFacePoint(corners, view(), { x: 75, y: 50 }), true)
    assert.equal(containsFacePoint(corners, view(), { x: 20, y: 50 }), false)
  })

  void it('takes nothing when the face has no corner', () => {
    assert.equal(containsFacePoint([], view(), { x: 50, y: 50 }), false)
  })
})

void describe('movedUvs', () => {
  void it('moves every corner by the same step', () => {
    const moved = movedUvs(
      [
        { u: 0.2, v: 0.2 },
        { u: 0.4, v: 0.2 },
        { u: 0.2, v: 0.4 },
        { u: 0.4, v: 0.4 },
      ],
      { u: 0.1, v: -0.1 },
    )

    assert.deepEqual(
      moved.map((corner) => {
        return `${corner.u.toFixed(3)}/${corner.v.toFixed(3)}`
      }),
      ['0.300/0.100', '0.500/0.100', '0.300/0.300', '0.500/0.300'],
    )
  })

  void it('stops the face at the edge of the texture, without deforming it', () => {
    const moved = movedUvs(
      [
        { u: 0.8, v: 0.8 },
        { u: 0.9, v: 0.8 },
        { u: 0.8, v: 0.9 },
        { u: 0.9, v: 0.9 },
      ],
      { u: 0.5, v: 0.5 },
    )

    assert.deepEqual(
      moved.map((corner) => {
        return `${corner.u}/${corner.v}`
      }),
      ['0.9/0.9', '1/0.9', '0.9/1', '1/1'],
    )
  })

  void it('moves a face that is wider than the texture freely, it can not be kept inside it', () => {
    const moved = movedUvs(
      [
        { u: 0, v: 0 },
        { u: 2, v: 0 },
        { u: 0, v: 1 },
        { u: 2, v: 1 },
      ],
      { u: 0.3, v: 0 },
    )

    assert.deepEqual(
      moved.map((corner) => {
        return `${corner.u}/${corner.v}`
      }),
      ['0.3/0', '2.3/0', '0.3/1', '2.3/1'],
    )
  })
})
