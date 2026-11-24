import type { ArxPolygon } from 'arx-convert/types'

/**
 * A group of faces of the current level.
 *
 * @remarks
 * The members are the **polygons** of the level, not their indices: a step that takes faces out (or puts them back) moves
 * the indices, and a group has to go with the faces it was made of. The indices are the form of the storage, so a group
 * is resolved into polygons when the level opens and written back as indices when it is saved.
 *
 * A group that lost its faces is still a group: its members stay here (an undo of the delete brings the same polygons
 * back), and the count the widget shows is the members that are still in the level.
 */
export type FaceGroup = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * The polygons of the group.
   */
  readonly members: ReadonlySet<ArxPolygon>
  /**
   * Whether the mesh draws the faces of the group.
   *
   * @remarks
   * A hidden group is a view state, not an edit: its faces stay in the level, and the mesh leaves them out (the picking
   * can not reach them, and the export skips them). The eye of the row toggles it.
   */
  readonly visible: boolean
}

/**
 * One row of the group inspector: a group and how many of its faces are in the level.
 */
export type FaceGroupRow = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * What the row shows: the name of the group, or the default of the id.
   */
  readonly label: string
  /**
   * How many faces of the group are still in the level.
   */
  readonly faceCount: number
  /**
   * Whether the group is drawn: the eye of the row shows it.
   */
  readonly visible: boolean
}
