/**
 * The meshes of a level: the geometry, the wireframe, the material, the picking and the portal outline.
 *
 * @remarks
 * The parts live in files of their own under `meshes/`: `conversion.ts` (the axes of the game), `runs.ts` (the slices of
 * a buffer), `geometry.ts` (the solid geometry of the polygons), `bvh.ts` (the tree of the picking), `material.ts` (the
 * material of the level), `wireframe.ts` (the lines of the mesh) and `portals.ts` (the outline of the portals). This
 * module is the public face of the folder: the generator and the editor import the meshes from here, so a part can move
 * inside the folder without a change outside it (2026-11-24, the 97).
 */
export * from './meshes/bvh.ts'
export * from './meshes/conversion.ts'
export * from './meshes/geometry.ts'
export * from './meshes/material.ts'
export * from './meshes/portals.ts'
export * from './meshes/runs.ts'
export * from './meshes/wireframe.ts'
