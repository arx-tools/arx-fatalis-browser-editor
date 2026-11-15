import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene, type Vector3 } from 'three'
import type { ArxPortal } from 'arx-convert/types'
import { portalLinePositions } from '../../../../generator/meshes.ts'

/**
 * The colour of the outline of a portal: the cyan of the game's own debug view.
 *
 * @remarks
 * The later room and portal round gives the line a state (the game draws a portal it can see through in green and the
 * blocked ones in red), so this is the plain colour of the first slice, not a decision about the states.
 */
const PORTAL_COLOR = 0x00_ff_ff

/**
 * The outline of the portals of a level, over the mesh of a view.
 */
export interface PortalOverlay {
  /**
   * The lines to put into the scene of a view.
   */
  readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>
  /**
   * Shows or hides the outline.
   *
   * @param visible Whether the outline should be drawn.
   */
  readonly setVisible: (visible: boolean) => void
  /**
   * Rebuilds the points of the lines from a new list of portals.
   *
   * @remarks
   * The portals of a flat level are derived from its rooms, so an edit of the rooms changes them under a view that is
   * already on the screen: the geometry keeps its buffers and takes the new points.
   *
   * @param next The portals to draw.
   * @param nextOffset The scene position of the level, already mirrored.
   */
  readonly setPortals: (next: readonly ArxPortal[], nextOffset: Vector3) => void
  /**
   * Frees the geometry and the material of the overlay.
   */
  readonly dispose: () => void
}

/**
 * Builds the outline of the portals of a level.
 *
 * @remarks
 * It is an overlay like the wireframe: the level itself does not carry the portals in its mesh, so the lines are built
 * from the `fts.portals` of the map, and every view that draws them has its own wrapper. The line does not test the
 * depth: a portal is a hole in a wall, and the room it opens to is behind the wall, so the outline has to be visible
 * through it. A new wrapper is built with every level load, so an edit that changes the portals rebuilds it.
 *
 * @param scene The scene to put the lines into.
 * @param portals The portals of the level.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The overlay, ready to be shown.
 */
export function attachPortalLines(scene: Scene, portals: readonly ArxPortal[], offset: Vector3): PortalOverlay {
  const geometry = new BufferGeometry()
  const material = new LineBasicMaterial({
    color: PORTAL_COLOR,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const lines = new LineSegments(geometry, material)

  // after the wireframe (5): the outline of a portal reads over the lines of the faces around it
  lines.renderOrder = 6

  let visible = false

  /**
   * Writes the points of the newest portals into the geometry.
   *
   * @param next The portals to draw.
   * @param nextOffset The scene position of the level, already mirrored.
   */
  function setPortals(next: readonly ArxPortal[], nextOffset: Vector3): void {
    geometry.setAttribute('position', new BufferAttribute(portalLinePositions(next, nextOffset), 3))
    // the points moved, so the sphere the view culls with is the one of the old points until it is read again
    geometry.computeBoundingSphere()
  }

  setPortals(portals, offset)

  return {
    lines,
    setPortals,
    setVisible: (next: boolean): void => {
      if (next === visible) {
        return
      }

      visible = next

      if (next) {
        scene.add(lines)
      } else {
        scene.remove(lines)
      }
    },
    dispose: (): void => {
      scene.remove(lines)
      geometry.dispose()
      material.dispose()
    },
  }
}
