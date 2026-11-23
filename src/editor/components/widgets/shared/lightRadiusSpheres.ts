import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three'
import type { ArxLight } from 'arx-convert/types'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { fallEndSphereVisible, fallStartSphereVisible } from '../../../modules/level/edit/lightSpheres.ts'

/**
 * The segments of a latitude ring: the same 64 the debug view of the game draws.
 */
const SECTIONS = 64

/**
 * The color of the fall start sphere: the green of the debug view of the game.
 */
const FALL_START_SPHERE_COLOR = new Color(0, 1, 0)

/**
 * The color of the fall end sphere: the red of the debug view of the game.
 */
const FALL_END_SPHERE_COLOR = new Color(1, 0, 0)

/**
 * The opacity of the spheres: the alpha the debug view of the game draws them with (200 of 255).
 */
const SPHERE_OPACITY = 200 / 255

/**
 * The rings the debug view of the game draws around a sphere of a radius.
 *
 * @remarks
 * The game takes one ring for every 10 units of the radius, and at least 7 (`DrawLine.cpp`, `drawLineSphere`): a small
 * light gets a coarse globe, a big one a dense wireframe. The rings are the latitudes, so the sphere is a set of
 * horizontal circles, not the three great circles of an axis-aligned wireframe (2026-11-23, the owner, TODO 249).
 *
 * @param radius The radius of the sphere, in the units of the level.
 *
 * @returns The count of the rings the game's rule asks for.
 */
export function ringsOf(radius: number): number {
  return Math.max(7, Math.floor(radius / 10))
}

/**
 * Builds the latitude rings of a sphere.
 *
 * @remarks
 * The rings are the ones `drawLineSphere` of the game draws: the latitudes `i * pi / (rings - 1)` for every ring but
 * the two poles, each a closed circle of {@link SECTIONS} segments, as line segments.
 *
 * @param rings The count of the rings of the sphere.
 *
 * @returns The geometry of the rings, at the radius of one.
 */
function latitudeRingGeometry(rings: number): BufferGeometry {
  const points: number[] = []

  for (let ring = 1; ring < rings - 1; ring++) {
    const latitude = ring * (Math.PI / (rings - 1))

    for (let segment = 0; segment < SECTIONS; segment++) {
      const from = (segment / SECTIONS) * Math.PI * 2
      const to = ((segment + 1) / SECTIONS) * Math.PI * 2

      points.push(
        Math.cos(from) * Math.sin(latitude),
        Math.sin(from) * Math.sin(latitude),
        Math.cos(latitude),
        Math.cos(to) * Math.sin(latitude),
        Math.sin(to) * Math.sin(latitude),
        Math.cos(latitude),
      )
    }
  }

  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))

  return geometry
}

/**
 * Makes the line material of a sphere.
 *
 * @param color The RGB the lines of the sphere are drawn with.
 *
 * @returns The material of the three great circles of the sphere.
 */
function lineMaterialOf(color: Color): LineBasicMaterial {
  return new LineBasicMaterial({
    color,
    transparent: true,
    opacity: SPHERE_OPACITY,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  })
}

/**
 * One of the two spheres of the overlay: the group, the lines and the material of it.
 */
type Sphere = {
  readonly group: Group
  readonly lines: LineSegments
  readonly material: LineBasicMaterial
  rings: number
}

/**
 * Builds the lines of a sphere, in the color of the material.
 *
 * @param material The line material of the sphere.
 *
 * @returns The sphere, with an empty set of lines until a radius arrives.
 */
function sphereOf(material: LineBasicMaterial): Sphere {
  const lines = new LineSegments(new BufferGeometry(), material)
  const group = new Group()

  group.add(lines)
  group.renderOrder = 10

  return { group, lines, material, rings: 0 }
}

/**
 * Gives a sphere the rings of a radius, when the count of the rings changes.
 *
 * @param sphere The sphere to shape.
 * @param radius The radius of the light, in the units of the level.
 */
function shapeOf(sphere: Sphere, radius: number): void {
  const rings = ringsOf(radius)

  if (sphere.rings === rings) {
    return
  }

  sphere.lines.geometry.dispose()
  sphere.lines.geometry = latitudeRingGeometry(rings)
  sphere.rings = rings
}

/**
 * The debug spheres of the falloff of the edited light.
 *
 * @remarks
 * The two spheres of the game's debug view: the fall start in green and the fall end in red, at the place of the light,
 * with the radius the light has. The editor shows them for the light the editor **edits**, on the two switches of the
 * light editor (2026-11-23, the owner, TODO 249): the view draws them while a switch is on, and a switch of the view
 * takes them off the frame with the other lights. The spheres are lines with the additive blend of the game, and depth
 * test, so a wall hides the half behind it.
 */
export type LightRadiusSpheres = {
  /**
   * The group of the two spheres: the caller adds it to its scene, and sets the visibility of the light display.
   */
  readonly group: Group
  /**
   * Puts the spheres on the light, or takes them off the frame when there is none.
   *
   * @param light The edited light, or `undefined` when the editor edits no light.
   */
  readonly update: (light: ArxLight | undefined) => void
  /**
   * Disposes the geometry and the materials of the spheres.
   */
  readonly dispose: () => void
}

/**
 * Builds the debug spheres of the falloff of a light.
 *
 * @returns The group of the two spheres, with the update and the dispose of the overlay.
 */
export function createLightRadiusSpheres(): LightRadiusSpheres {
  const fallStart = sphereOf(lineMaterialOf(FALL_START_SPHERE_COLOR))
  const fallEnd = sphereOf(lineMaterialOf(FALL_END_SPHERE_COLOR))
  const group = new Group()

  group.name = 'light-radius-spheres'
  group.add(fallStart.group, fallEnd.group)

  return {
    group,
    update: (light: ArxLight | undefined): void => {
      const startOn = light !== undefined && fallStartSphereVisible.value && light.fallStart > 0
      const endOn = light !== undefined && fallEndSphereVisible.value && light.fallEnd > 0

      fallStart.group.visible = startOn
      fallEnd.group.visible = endOn

      if (light === undefined) {
        return
      }

      const position = arxVector3toVector3(light.position)

      shapeOf(fallStart, light.fallStart)
      shapeOf(fallEnd, light.fallEnd)
      fallStart.group.scale.setScalar(light.fallStart)
      fallStart.group.position.copy(position)
      fallEnd.group.scale.setScalar(light.fallEnd)
      fallEnd.group.position.copy(position)
    },
    dispose: (): void => {
      for (const sphere of [fallStart, fallEnd]) {
        sphere.lines.geometry.dispose()
        sphere.material.dispose()
      }

      group.clear()
    },
  }
}
