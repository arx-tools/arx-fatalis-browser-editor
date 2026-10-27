import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ArxPolygonFlags,
  type ArxFTS,
  type ArxPolygon,
  type ArxTextureContainer,
  type ArxVector3,
} from 'arx-convert/types'
import { Vector3 } from 'three'
import {
  arxPolygonsToGeometry,
  arxVector3toVector3,
  createLevelGeometry,
  createLevelMaterial,
  visiblePolygons,
} from '../../src/_generator/meshes.ts'
import { Color } from '../../src/_generator/Color.ts'

/**
 * A position of the test.
 *
 * @param x The first channel of the coordinates.
 * @param y The second channel of the coordinates.
 * @param z The third channel of the coordinates.
 *
 * @returns The point those three channels describe.
 */
function position(x: number, y: number, z: number): ArxVector3 {
  return { x, y, z }
}

/**
 * A flat polygon of the test, with four vertices at the same height.
 *
 * @param isQuad `true` for a quad, `false` for a triangle.
 * @param container The id of the texture container it uses.
 *
 * @returns It, with four vertices and the same normal in every corner.
 */
function polygon(isQuad: boolean, container = 1): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (isQuad) {
    flags = ArxPolygonFlags.Quad
  }

  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 10, y: 0, z: 0, u: 1, v: 0 },
      { x: 10, y: 0, z: 10, u: 1, v: 1 },
      { x: 0, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId: container,
    norm: position(0, 1, 0),
    norm2: position(0, 1, 0),
    transval: 0,
    area: 100,
    flags,
    room: 1,
  }
}

/**
 * A scene of the test: one real container and, optionally, the invisible one.
 *
 * @param polygons The shapes of the scene.
 * @param withInvisible `true` to add the `alpha.bmp` container the level hides.
 *
 * @returns A scene with the two containers and the given shapes.
 */
function scene(polygons: ArxPolygon[], withInvisible = false): ArxFTS {
  const containers = [{ id: 1, filename: 'stone.bmp' }]

  if (withInvisible) {
    containers[1] = { id: 2, filename: 'alpha.bmp' }
  }

  return {
    header: { mScenePosition: position(0, 0, 0) },
    textureContainers: containers as unknown as ArxTextureContainer[],
    polygons,
    cells: [],
    anchors: [],
    portals: [],
    rooms: [],
    roomDistances: [],
  } as unknown as ArxFTS
}

/**
 * Rounds the positions of a geometry and normalizes the mirrored zeros.
 *
 * @param geometry The geometry to read.
 *
 * @returns The positions, rounded to integers and without the mirrored zeros.
 */
function roundedPositions(geometry: ReturnType<typeof arxPolygonsToGeometry>): number[] {
  return [...geometry.getAttribute('position').array].map((value) => {
    return Math.round(value) + 0
  })
}

void describe('arxVector3toVector3', () => {
  void it('mirrors the X and Y axes', () => {
    assert.deepEqual(arxVector3toVector3(position(1, 2, 3)).toArray(), [-1, -2, 3])
  })
})

void describe('arxPolygonsToGeometry', () => {
  void it('splits a triangle into one triangle', () => {
    const geometry = arxPolygonsToGeometry([polygon(false)], new Vector3())

    assert.equal(geometry.getAttribute('position').count, 3)
    assert.equal(geometry.getAttribute('normal').count, 3)
    assert.equal(geometry.getAttribute('uv').count, 3)
  })

  void it('splits a quad into two triangles along b-c', () => {
    const geometry = arxPolygonsToGeometry([polygon(true)], new Vector3())
    const positions = roundedPositions(geometry)

    assert.equal(geometry.getAttribute('position').count, 6)

    // the first triangle is a, b, c, the second one is c, b, d
    assert.deepEqual(positions.slice(0, 9), [0, 0, 0, -10, 0, 0, -10, 0, 10])
    assert.deepEqual(positions.slice(9), [-10, 0, 10, -10, 0, 0, 0, 0, 10])
  })

  void it('shifts the geometry by the offset', () => {
    const geometry = arxPolygonsToGeometry([polygon(false)], new Vector3(100, 200, 300))

    assert.deepEqual(roundedPositions(geometry).slice(0, 3), [-100, -200, -300])
  })
})

void describe('visiblePolygons', () => {
  void it('keeps the polygons with a real texture', () => {
    const level = scene([polygon(false)])

    assert.equal(visiblePolygons(level).length, 1)
  })

  void it('drops the ones with an alpha container', () => {
    const level = scene([polygon(false, 1), polygon(false, 2)], true)

    assert.equal(visiblePolygons(level).length, 1)
  })
})

void describe('createLevelMaterial', () => {
  void it('is a flat lambert material in the preview grey', () => {
    const material = createLevelMaterial()

    assert.equal(material.color.getHex(), Color.fromCSS('#b8b2a8').getHex())
    assert.equal(material.vertexColors, false)
  })

  void it('gives a new material every time, so a mesh can own its own', () => {
    assert.notEqual(createLevelMaterial(), createLevelMaterial())
  })
})

void describe('createLevelGeometry', () => {
  void it('builds the geometry of the visible polygons', () => {
    const level = scene([polygon(true), polygon(true, 2)], true)
    const geometry = createLevelGeometry(level)

    assert.equal(geometry.getAttribute('position').count, 6)
  })

  void it('gives an empty geometry for an empty scene', () => {
    const geometry = createLevelGeometry(scene([]))

    assert.equal(geometry.getAttribute('position').count, 0)
  })
})
