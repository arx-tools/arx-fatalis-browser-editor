import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Sprite, Texture } from 'three'
import type { ArxInteractiveObject, ArxVector3 } from 'arx-convert/types'
import {
  createEntityMarkers,
  entityMarkerIndexAt,
  setEntityMarkerHighlight,
} from '../../../../../src/editor/components/widgets/shared/entityMarkers.ts'

/**
 * An interactive object of a level, at a place.
 *
 * @param name The path of the entity, like `items/provisions/pie`.
 * @param position Where it stands, in the game's coordinates.
 *
 * @returns The entity, as the DLF holds it.
 */
function entity(name: string, position: ArxVector3): ArxInteractiveObject {
  return {
    identifier: 1,
    name,
    position,
    orientation: { a: 0, b: 0, g: 0 },
    properties: [],
  } as unknown as ArxInteractiveObject
}

/**
 * The ring the markers share, without a canvas: the tests of the markers do not need a drawing.
 *
 * @returns A texture of the size of a marker.
 */
function textureOf(): Texture {
  return new Texture()
}

/**
 * The ring of the selection among the children of a group.
 *
 * @param group The group of the markers.
 *
 * @returns The sprite of the ring.
 */
function ringOf(group: ReturnType<typeof createEntityMarkers>): Sprite {
  const ring = group.children.find((child) => {
    return child.name === 'entity-selection-ring'
  })

  assert.ok(ring instanceof Sprite)

  return ring as Sprite
}

void describe('createEntityMarkers', () => {
  void it('puts a marker at every entity, and one ring for the selection', () => {
    const group = createEntityMarkers(
      [entity('items/provisions/pie', { x: 0, y: 0, z: 0 }), entity('npc/human_base', { x: 10, y: 0, z: 0 })],
      textureOf(),
    )

    const markers = group.children.filter((child) => {
      return typeof child.userData.entityIndex === 'number'
    })

    assert.equal(markers.length, 2)
    assert.equal(group.children.length, 3)
    assert.equal(ringOf(group).visible, false)
  })
})

void describe('setEntityMarkerHighlight', () => {
  void it('draws the white ring of the selection over the marker of the entity', () => {
    const group = createEntityMarkers(
      [entity('items/provisions/pie', { x: 0, y: 0, z: 0 }), entity('npc/human_base', { x: 10, y: 0, z: 0 })],
      textureOf(),
    )
    const ring = ringOf(group)

    setEntityMarkerHighlight(group, 1, undefined)

    const selected = group.children.find((child) => {
      return child.userData.entityIndex === 1
    })

    assert.equal(ring.visible, true)
    assert.deepEqual(
      [ring.position.x, ring.position.y, ring.position.z],
      [selected?.position.x, selected?.position.y, selected?.position.z],
    )
    // the markers themselves keep their own size: the selection is the ring, not a bigger marker
    assert.equal(selected?.scale.x, 14)
  })

  void it('hides the ring when nothing is selected, and opens the marker under the crosshair', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 0, z: 0 })], textureOf())

    setEntityMarkerHighlight(group, 0, undefined)
    assert.equal(ringOf(group).visible, true)

    setEntityMarkerHighlight(group, undefined, 0)

    assert.equal(ringOf(group).visible, false)
    assert.ok(ringOf(group).scale.x > 0)
  })
})

void describe('entityMarkerIndexAt', () => {
  void it('reads the entity of the marker under the crosshair', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 0, z: 0 })], textureOf())
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(entityMarkerIndexAt(camera, group), 0)
  })

  void it('reads nothing when the crosshair points away from every marker', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 40, z: 0 })], textureOf())
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(entityMarkerIndexAt(camera, group), undefined)
  })
})
