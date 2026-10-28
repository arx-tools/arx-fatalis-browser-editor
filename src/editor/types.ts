/**
 * The state of something that is loaded or produced in the background.
 *
 * @remarks
 * - `idle`: nothing started yet
 * - `loading`: the work is running
 * - `ready`: the result is there
 * - `error`: it failed, and the reason is next to this state
 *
 * The four states are general on purpose: the level of the 3D view is the first user, and the other
 * widgets (the statistics, the lighting, the anchors) will load their own data the same way.
 */
export type LoadingStatus = 'idle' | 'loading' | 'ready' | 'error'
