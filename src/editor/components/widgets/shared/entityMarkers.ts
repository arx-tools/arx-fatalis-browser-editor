import {
  AdditiveBlending,
  Color,
  Group,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector2,
  type Camera,
  type Texture,
} from 'three'
import type { ArxInteractiveObject } from 'arx-convert/types'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { categoryOf, type EntityCategory } from '../../../modules/level/entities/entityRows.ts'
import { createRingTexture } from './lightSelectionOverlay.ts'

/**
 * The color a marker draws an entity with, by the folder the game places it from.
 *
 * @remarks
 * The four folders are the ones of the entity list: the fixed interactive objects, the items, the non-player characters
 * and the system objects (a marker, a sound). The colors are quiet, because a level of the game holds hundreds of these
 * markers at once.
 */
export const ENTITY_MARKER_COLORS: Record<EntityCategory | 'other', string> = {
  fix_inter: '#c9a227',
  items: '#7fb069',
  npc: '#4d8fd6',
  system: '#9a9a9a',
  other: '#9a9a9a',
}

/**
 * How big a marker is in the space of the level.
 */
export const ENTITY_MARKER_SIZE = 14

/**
 * How much bigger the ring of the mark is than the marker.
 */
const RING_SCALE = 1.35

/**
 * The name the group and its two rings carry, so a walk of the children finds them.
 */
const HOVER_RING_NAME = 'entity-hover-ring'
const FOCUS_RING_NAME = 'entity-focus-ring'

/**
 * What the markers and their two rings draw with: one ring of a marker, and the white and the yellow ring of the marks.
 */
export type EntityMarkerTextures = {
  readonly focus: Texture
  readonly hover: Texture
  readonly marker: Texture
}

/**
 * Builds the three textures the markers share: the ring of a marker, and the white and the yellow ring of the marks.
 *
 * @returns The textures of the markers.
 */
export function createEntityMarkerTextures(): EntityMarkerTextures {
  return {
    focus: createRingTexture(true),
    hover: createRingTexture(false),
    marker: createRingTexture(false),
  }
}

/**
 * Builds the ring of a state: the hover is the white ring, the selection the one filled with the yellow of the selected
 * faces, the same mark the lights use.
 *
 * @param textures The textures of the markers.
 * @param name The name of the ring in the group.
 * @param texture Which of the textures it draws with.
 *
 * @returns The sprite of the ring.
 */
function ringOf(textures: EntityMarkerTextures, name: string, texture: 'focus' | 'hover'): Sprite {
  const material = new SpriteMaterial({
    map: textures[texture],
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  const sprite = new Sprite(material)

  sprite.name = name
  // the ring belongs to the entity display: it stays over the fill of the selected polygons, with the marker
  sprite.renderOrder = 11
  sprite.visible = false

  return sprite
}

/**
 * Builds a marker for every entity of the level.
 *
 * @remarks
 * The marker is a sprite at the place of the entity, in the local space of the level (the same one the polygons and the
 * spike use), tinted by the folder the entity comes from. The index of the entity in the DLF list travels on the sprite,
 * so the pick of the crosshair reads it back. Two rings travel with the group: the white one of the entity under the
 * crosshair and the yellow one of the selected entity, the mark the lights use (2026-11-24, the owner).
 *
 * @param entities The interactive objects of the level, in the order of the DLF.
 * @param textures What the markers draw with: the real rings, or a plain texture in a test that has no canvas.
 *
 * @returns The group of the markers.
 */
export function createEntityMarkers(
  entities: readonly ArxInteractiveObject[],
  textures: EntityMarkerTextures = createEntityMarkerTextures(),
): Group {
  const group = new Group()

  group.name = 'entity-markers'
  group.userData.textures = textures

  for (const [index, entity] of entities.entries()) {
    const category = categoryOf(entity.name)
    const color = ENTITY_MARKER_COLORS[category ?? 'other']
    const material = new SpriteMaterial({
      map: textures.marker,
      color: new Color(color),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const sprite = new Sprite(material)

    sprite.userData.entityIndex = index
    // the markers sit over the level: a selected room or a filled face must not hide the entity in it
    sprite.renderOrder = 10
    sprite.scale.set(ENTITY_MARKER_SIZE, ENTITY_MARKER_SIZE, 1)
    sprite.position.copy(arxVector3toVector3(entity.position))
    group.add(sprite)
  }

  group.add(ringOf(textures, HOVER_RING_NAME, 'hover'), ringOf(textures, FOCUS_RING_NAME, 'focus'))

  return group
}

/**
 * Reads the entity whose marker the crosshair of a view points at.
 *
 * @param camera The camera of the view.
 * @param markers The group {@link createEntityMarkers} built.
 *
 * @returns The index of the entity in the DLF list, or `undefined` when no marker is under the crosshair.
 */
export function entityMarkerIndexAt(camera: Camera, markers: Group): number | undefined {
  const raycaster = new Raycaster()

  raycaster.setFromCamera(new Vector2(0, 0), camera)

  const hit = raycaster.intersectObjects(
    markers.children.filter((child) => {
      return child.visible && typeof child.userData.entityIndex === 'number'
    }),
    false,
  )[0]
  const index: unknown = hit?.object.userData.entityIndex

  if (typeof index === 'number') {
    return index
  }

  return undefined
}

/**
 * Draws the white ring of the entity under the crosshair and the yellow one of the selected entity.
 *
 * @remarks
 * The marks are the ones of the lights: the hover is the white ring, the selection the ring filled with the yellow of the
 * selected faces, and the selected state wins over the hover. The markers themselves keep their own size: the ring is a
 * mark on the marker, not a bigger marker (2026-11-24, the owner).
 *
 * @param markers The group {@link createEntityMarkers} built.
 * @param selected The index of the selected entity, or `undefined`.
 * @param hover The index of the entity under the crosshair, or `undefined`.
 */
export function setEntityMarkerHighlight(
  markers: Group,
  selected: number | undefined,
  hover: number | undefined,
): void {
  let hoverRing: Sprite | undefined
  let focusRing: Sprite | undefined

  for (const child of markers.children) {
    if (child.name === HOVER_RING_NAME && child instanceof Sprite) {
      hoverRing = child
    }

    if (child.name === FOCUS_RING_NAME && child instanceof Sprite) {
      focusRing = child
    }
  }

  if (hoverRing !== undefined) {
    hoverRing.visible = false
  }

  if (focusRing !== undefined) {
    focusRing.visible = false
  }

  for (const child of markers.children) {
    const index: unknown = child.userData.entityIndex

    if (typeof index !== 'number') {
      continue
    }

    if (index !== selected && index !== hover) {
      continue
    }

    let ring = hoverRing

    if (index === selected) {
      ring = focusRing
    }

    if (ring === undefined) {
      continue
    }

    const size = ENTITY_MARKER_SIZE * RING_SCALE

    ring.position.copy(child.position)
    ring.scale.set(size, size, 1)
    ring.visible = true
  }
}

/**
 * Frees the materials of the markers and the textures of the rings.
 *
 * @param group The group {@link createEntityMarkers} built.
 */
export function disposeEntityMarkers(group: Group): void {
  for (const child of group.children) {
    if (child instanceof Sprite) {
      child.material.dispose()
    }
  }

  const { textures } = group.userData

  if (typeof textures === 'object' && textures !== null) {
    for (const texture of Object.values(textures)) {
      if (typeof texture === 'object' && texture !== null && 'dispose' in texture) {
        ;(texture as { dispose: () => void }).dispose()
      }
    }
  }
}
