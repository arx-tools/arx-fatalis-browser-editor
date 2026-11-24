import {
  CanvasTexture,
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
 * How much bigger the marker of the entity under the crosshair is.
 */
const HOVER_SCALE = 1.35

/**
 * How much bigger the marker of the selected entity is.
 */
const SELECTED_SCALE = 1.7

/**
 * Builds the texture of a marker: a ring, so the level stays visible through it.
 *
 * @returns The texture of the markers, which they all share.
 */
export function createEntityMarkerTexture(): Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  canvas.width = size
  canvas.height = size

  const center = size / 2
  const radius = center - 6

  if (context !== null) {
    context.strokeStyle = '#ffffff'
    context.lineWidth = 8
    context.beginPath()
    context.arc(center, center, radius, 0, Math.PI * 2)
    context.stroke()
  }

  const texture = new CanvasTexture(canvas)

  texture.name = 'entity-marker-ring'

  return texture
}

/**
 * Builds a marker for every entity of the level.
 *
 * @remarks
 * The marker is a sprite at the place of the entity, in the local space of the level (the same one the polygons and the
 * spike use), tinted by the folder the entity comes from. The index of the entity in the DLF list travels on the sprite,
 * so the pick of the crosshair reads it back.
 *
 * @param entities The interactive objects of the level, in the order of the DLF.
 * @param texture The texture of the ring, which every marker shares.
 *
 * @returns The group of the markers.
 */
export function createEntityMarkers(entities: readonly ArxInteractiveObject[], texture: Texture): Group {
  const group = new Group()

  group.name = 'entity-markers'

  for (const [index, entity] of entities.entries()) {
    const category = categoryOf(entity.name)
    const color = ENTITY_MARKER_COLORS[category ?? 'other']
    const material = new SpriteMaterial({
      map: texture,
      color: new Color(color),
      transparent: true,
      depthWrite: false,
      blending: undefined,
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
      return child.visible
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
 * Draws the selected entity and the one under the crosshair bigger than the rest.
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
  for (const child of markers.children) {
    const index: unknown = child.userData.entityIndex

    if (typeof index !== 'number') {
      continue
    }

    let scale = 1

    if (index === selected) {
      scale = SELECTED_SCALE
    } else if (index === hover) {
      scale = HOVER_SCALE
    }

    child.scale.set(ENTITY_MARKER_SIZE * scale, ENTITY_MARKER_SIZE * scale, 1)
  }
}

/**
 * Frees the materials of the markers.
 *
 * @param group The group {@link createEntityMarkers} built.
 */
export function disposeEntityMarkers(group: Group): void {
  for (const child of group.children) {
    if (child instanceof Sprite) {
      child.material.dispose()
    }
  }
}
