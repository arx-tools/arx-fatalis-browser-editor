import { factoryPreset, factoryPresets, defaultLayout, type PresetId } from './layoutPresets.ts'
import { collectKinds, layoutEquals, parseLayoutNode, type LayoutNode } from './layoutNode.ts'

/**
 * The history of one layout: the states it went through, and where the user is in them.
 *
 * @remarks
 * Every preset of the header carries its **own** history: a tweak made while the `Painter` layout is on belongs to the
 * `Painter`, and switching to the `Editor` and back does not lose it. The first state is the tree of the factory preset,
 * so the undo walks the tweaks back to the pristine layout, and the states after the cursor are the redo side (a new
 * tweak drops them, the way an editor does).
 *
 * The history is stored (`persistedRef`), so a reload keeps what the user did to every layout. The keys of the browser
 * (`Ctrl+Z`/`Ctrl+Y`) belong to the **map** history: the layout steps are the buttons of the dropdown only.
 */

/**
 * The states of one layout and the place the user is in them.
 */
export interface LayoutHistory {
  /**
   * The states, the first one being the tree of the factory preset.
   */
  readonly states: readonly LayoutNode[]
  /**
   * The index of the state on the screen.
   */
  readonly index: number
}

/**
 * The histories of every preset, by the identifier of the preset.
 */
export type LayoutHistories = Readonly<Partial<Record<PresetId, LayoutHistory>>>

/**
 * How many states one layout keeps: a drag settles one step per quarter of a second, so a long session would grow the
 * storage without a bound. The oldest state is dropped (the factory tree of the preset included), and the cursor moves
 * with it.
 */
const MAX_STATES = 40

/**
 * Builds the history of a layout that has only its own tree.
 *
 * @param state The tree of the preset.
 *
 * @returns The history with one state.
 */
export function createLayoutHistory(state: LayoutNode): LayoutHistory {
  return { states: [state], index: 0 }
}

/**
 * Reads the state the history shows.
 *
 * @param history The history to read.
 *
 * @returns The tree on the screen.
 */
export function stateOf(history: LayoutHistory): LayoutNode {
  return history.states[history.index] ?? history.states[0] ?? defaultLayout
}

/**
 * Puts a new state on the history.
 *
 * @remarks
 * A state that is the same tree as the one on the screen is not an undo step: the pass of the sizes and the sync of the
 * layout reach the same tree twice, and a step the user can not tell apart only makes the history longer. A new state
 * drops the redo side, the way an editor does.
 *
 * @param history The history to extend.
 * @param state The tree the layout has now.
 *
 * @returns The history with the state at the end, or the history itself when the tree did not change.
 */
export function withLayoutState(history: LayoutHistory, state: LayoutNode): LayoutHistory {
  if (layoutEquals(stateOf(history), state)) {
    return history
  }

  const states = [...history.states.slice(0, history.index + 1), state]
  const overflow = Math.max(0, states.length - MAX_STATES)

  return { states: states.slice(overflow), index: states.length - 1 - overflow }
}

/**
 * Tells whether the layout has a step to take back.
 *
 * @param history The history to read.
 *
 * @returns True when the cursor is not on the first state.
 */
export function canUndoOf(history: LayoutHistory): boolean {
  return history.index > 0
}

/**
 * Tells whether the layout has a step to make again.
 *
 * @param history The history to read.
 *
 * @returns True when the cursor is not on the last state.
 */
export function canRedoOf(history: LayoutHistory): boolean {
  return history.index < history.states.length - 1
}

/**
 * Takes the layout one state back.
 *
 * @param history The history to step in.
 *
 * @returns The history with the cursor one earlier, or the history itself when it is on the first state.
 */
export function undoOf(history: LayoutHistory): LayoutHistory {
  if (!canUndoOf(history)) {
    return history
  }

  return { states: history.states, index: history.index - 1 }
}

/**
 * Makes the next state of the layout again.
 *
 * @param history The history to step in.
 *
 * @returns The history with the cursor one later, or the history itself when it is on the last state.
 */
export function redoOf(history: LayoutHistory): LayoutHistory {
  if (!canRedoOf(history)) {
    return history
  }

  return { states: history.states, index: history.index + 1 }
}

/**
 * The signature of a value, for telling one build of a preset from another.
 *
 * @remarks
 * The factory presets are code: a new widget on one of them changes its tree, and the states a stored history holds are
 * then of another dock. The signature of the tree (a hash of its JSON) says whether the history was written with this
 * build of the preset.
 *
 * @param value The value to sign.
 *
 * @returns The signature, as hex.
 */
function signatureOf(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x81_1c_9d_c5

  for (let index = 0; index < text.length; index++) {
    hash = hash ^ (text.codePointAt(index) ?? 0)
    hash = Math.imul(hash, 0x01_00_01_93)
  }

  return (hash >>> 0).toString(16)
}

/**
 * The signature of the factory tree of a preset.
 *
 * @param id The preset to sign.
 *
 * @returns The signature of its factory layout.
 */
export function factorySignatureOf(id: PresetId): string {
  return signatureOf(factoryPreset(id)?.layout ?? defaultLayout)
}

/**
 * Writes the histories down, with the signature of the factory tree of every preset.
 *
 * @remarks
 * The signature is what a later build reads to tell a history of this dock from one of another: without it a preset
 * that lost or gained a widget would keep walking its old states.
 *
 * @param histories The histories to write.
 *
 * @returns The value the storage keeps.
 */
export function serializeLayoutHistories(histories: LayoutHistories): string {
  const value: Record<string, unknown> = {}

  for (const [id, history] of Object.entries(histories) as Array<[PresetId, LayoutHistory | undefined]>) {
    if (history === undefined) {
      continue
    }

    value[id] = { states: history.states, index: history.index, factory: factorySignatureOf(id) }
  }

  return JSON.stringify(value)
}

/**
 * Tells whether a stored history of an older build may still be used.
 *
 * @remarks
 * The first values of the editor had no signature. Their first state is the factory tree of the build that wrote them,
 * so a preset whose factory grew a widget since (the `Viewer` and its render performance readout, 2026-11-09) can be
 * told: a kind of the factory that no state holds at its start is a widget the history never saw. A preset whose
 * factory is the same keeps its history, and the states are the ones of this dock.
 *
 * @param state The first state of the stored history.
 * @param id The preset the history belongs to.
 *
 * @returns True when the stored history may still walk the dock.
 */
function hasFactoryKinds(state: LayoutNode, id: PresetId): boolean {
  const kinds = new Set(collectKinds(state))

  return collectKinds(factoryPreset(id)?.layout ?? defaultLayout).every((kind) => {
    return kinds.has(kind)
  })
}

/**
 * Reads the history of a preset: the stored one, or a fresh history of the factory tree.
 *
 * @param histories The histories of the session.
 * @param id The preset to read.
 *
 * @returns The history of that preset.
 */
export function historyOf(histories: LayoutHistories, id: PresetId): LayoutHistory {
  const stored = histories[id]

  if (stored !== undefined && stored.states.length > 0) {
    return stored
  }

  return createLayoutHistory(factoryPreset(id)?.layout ?? defaultLayout)
}

/**
 * Puts a history back, keeping the others.
 *
 * @param histories The histories of the session.
 * @param id The preset the history belongs to.
 * @param history The history to store.
 *
 * @returns The histories, with the one of the preset replaced.
 */
export function withHistory(histories: LayoutHistories, id: PresetId, history: LayoutHistory): LayoutHistories {
  return { ...histories, [id]: history }
}

/**
 * Reads the histories from the storage.
 *
 * @remarks
 * The shape is validated: every preset of the factory has a history of at least one state, and every state is a layout
 * tree. Anything broken gives `undefined`, and the session starts from the factory trees — the same rule as the layout
 * parser: a value that is not the shape this build writes is not guessed at.
 *
 * @param raw The raw value of the storage.
 *
 * @returns The histories, or `undefined` when the value is not one.
 */
export function parseLayoutHistories(raw: string): LayoutHistories | undefined {
  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const candidate = value as Record<string, unknown>
  const histories: Partial<Record<PresetId, LayoutHistory>> = {}

  for (const preset of factoryPresets) {
    const entry = candidate[preset.id]

    if (entry === undefined) {
      continue
    }

    if (typeof entry !== 'object' || entry === null) {
      return undefined
    }

    const { states, index, factory } = entry as { states?: unknown; index?: unknown; factory?: unknown }

    if (!Array.isArray(states) || states.length === 0) {
      return undefined
    }

    const parsed = states.map((state) => {
      return parseLayoutNode(state)
    })

    if (parsed.includes(null)) {
      return undefined
    }

    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= parsed.length) {
      return undefined
    }

    // a history of another build of this preset is dropped, not walked: its states are of a dock the factory no longer
    // makes (a widget the preset has now is missing from them), so the preset starts from its factory tree again
    let known = false

    if (typeof factory === 'string') {
      known = factory === factorySignatureOf(preset.id)
    } else {
      known = hasFactoryKinds(parsed[0] as LayoutNode, preset.id)
    }

    if (!known) {
      continue
    }

    histories[preset.id] = {
      states: parsed as LayoutNode[],
      index,
    }
  }

  return histories
}
