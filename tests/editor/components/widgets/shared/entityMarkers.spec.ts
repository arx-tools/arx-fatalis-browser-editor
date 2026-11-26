import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Sprite, Texture } from 'three'
import type { ArxInteractiveObject, ArxVector3 } from 'arx-convert/types'
import {
  createEntityMarkers,
  type EntityMarkerTextures,
  entityMarkerIndexAt,
  setEntityMarkerHighlight,
  updateEntityMarkers,
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
 * The textures of the markers, without a canvas: the tests read the marks, not the drawing.
 *
 * @returns Three plain textures, one for each use of the markers.
 */
function texturesOf(): EntityMarkerTextures {
  return { focus: new Texture(), hover: new Texture(), marker: new Texture() }
}

/**
 * Finds the sprite of one of the two rings the group carries.
 *
 * @param group The group of the markers.
 * @param name The name of the ring, as the group keeps it.
 *
 * @returns The sprite the name was given to.
 */
function ringOf(group: ReturnType<typeof createEntityMarkers>, name: string): Sprite {
  const ring = group.children.find((child) => {
    return child.name === name
  })

  assert.ok(ring instanceof Sprite)

  return ring as Sprite
}

void describe('createEntityMarkers', () => {
  void it('puts a marker at every entity, and the two rings of the marks', () => {
    const group = createEntityMarkers(
      [entity('items/provisions/pie', { x: 0, y: 0, z: 0 }), entity('npc/human_base', { x: 10, y: 0, z: 0 })],
      texturesOf(),
    )

    const markers = group.children.filter((child) => {
      return typeof child.userData.entityIndex === 'number'
    })

    assert.equal(markers.length, 2)
    assert.equal(group.children.length, 4)
    assert.equal(ringOf(group, 'entity-hover-ring').visible, false)
    assert.equal(ringOf(group, 'entity-focus-ring').visible, false)
  })
})

void describe('setEntityMarkerHighlight', () => {
  void it('draws the yellow ring of the selection over the marker of the entity', () => {
    const group = createEntityMarkers(
      [entity('items/provisions/pie', { x: 0, y: 0, z: 0 }), entity('npc/human_base', { x: 10, y: 0, z: 0 })],
      texturesOf(),
    )
    const focus = ringOf(group, 'entity-focus-ring')

    setEntityMarkerHighlight(group, 1, undefined)

    const selected = group.children.find((child) => {
      return child.userData.entityIndex === 1
    })

    assert.equal(focus.visible, true)
    assert.equal(ringOf(group, 'entity-hover-ring').visible, false)
    assert.deepEqual(
      [focus.position.x, focus.position.y, focus.position.z],
      [selected?.position.x, selected?.position.y, selected?.position.z],
    )
    // the markers themselves keep their own size: the mark is the ring, not a bigger marker
    assert.equal(selected?.scale.x, 14)
  })

  void it('draws the white ring on the hover, and the yellow wins over it', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 0, z: 0 })], texturesOf())

    setEntityMarkerHighlight(group, undefined, 0)

    assert.equal(ringOf(group, 'entity-hover-ring').visible, true)
    assert.equal(ringOf(group, 'entity-focus-ring').visible, false)

    // a hovered entity that is also selected is the yellow ring, the way the lights read
    setEntityMarkerHighlight(group, 0, 0)

    assert.equal(ringOf(group, 'entity-hover-ring').visible, false)
    assert.equal(ringOf(group, 'entity-focus-ring').visible, true)

    // nothing hovered, nothing selected: both rings go
    setEntityMarkerHighlight(group, undefined, undefined)

    assert.equal(ringOf(group, 'entity-hover-ring').visible, false)
    assert.equal(ringOf(group, 'entity-focus-ring').visible, false)
  })
})

void describe('entityMarkerIndexAt', () => {
  void it('reads the entity of the marker under the crosshair', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 0, z: 0 })], texturesOf())
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(entityMarkerIndexAt(camera, group), 0)
  })

  void it('reads nothing when the crosshair points away from every marker', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 40, z: 0 })], texturesOf())
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(entityMarkerIndexAt(camera, group), undefined)
  })
})

void describe('updateEntityMarkers', () => {
  void it('moves the markers to the places the entities have now', () => {
    const group = createEntityMarkers(
      [entity('items/provisions/pie', { x: 0, y: 0, z: 0 }), entity('npc/human_base', { x: 10, y: 0, z: 0 })],
      texturesOf(),
    )

    updateEntityMarkers(group, [
      entity('items/provisions/pie', { x: 5, y: -20, z: 7 }),
      entity('npc/human_base', { x: 10, y: 0, z: 0 }),
    ])

    const marker = group.children.find((child) => {
      return child.userData.entityIndex === 0
    })

    // the space of the view mirrors x and y of the game, the way it builds the level
    assert.deepEqual([marker?.position.x, marker?.position.y, marker?.position.z], [-5, 20, 7])
  })

  void it('leaves the ring of the selection to the caller, so a moved marker draws it again', () => {
    const group = createEntityMarkers([entity('items/provisions/pie', { x: 0, y: 0, z: 0 })], texturesOf())

    updateEntityMarkers(group, [entity('items/provisions/pie', { x: 0, y: -40, z: 0 })])

    // only the caller knows what is selected: the update moves the markers and nothing else
    assert.equal(ringOf(group, 'entity-focus-ring').visible, false)
  })
})
