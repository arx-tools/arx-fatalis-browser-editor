import { shallowRef, type ShallowRef } from 'vue'

/**
 * The places a value can be persisted into.
 */
export type PersistenceTarget = 'localStorage' | 'url'

/**
 * Something went wrong while a value was read from or written into a persistence target.
 */
export type PersistenceProblem = {
  /**
   * The key of the persisted ref which had the problem.
   */
  key: string
  /**
   * The target which failed, `localStorage` or `url`.
   */
  target: PersistenceTarget
  /**
   * A human readable explanation, the same text that went to `console.warn`.
   */
  message: string
}

/**
 * The problems reported so far, so the ui can show a warning (the storage can be blocked or full).
 *
 * @remarks
 * - the list is append only and per page, not per ref
 * - every problem is reported once per key and target, so a failing write does not flood the console
 */
export const persistenceProblems: ShallowRef<readonly PersistenceProblem[]> = shallowRef([])

/**
 * The `key:target` pairs which were reported already, so a failing write does not flood the console.
 */
const reportedProblems = new Set<string>()

/**
 * Reports a persistence problem once per key and target, keeping the ui aware of it.
 *
 * @param key The key of the persisted ref.
 * @param target The target which failed.
 * @param message The explanation for the console and the ui.
 */
export function reportProblem(key: string, target: PersistenceTarget, message: string): void {
  const id = `${key}:${target}`

  if (reportedProblems.has(id)) {
    return
  }

  reportedProblems.add(id)
  persistenceProblems.value = [...persistenceProblems.value, { key, target, message }]
  console.warn(`[state] ${key}: ${message}`)
}

/**
 * Clears the reported problems and the deduplication, so a test can start from a clean state.
 */
export function clearPersistenceProblems(): void {
  reportedProblems.clear()
  persistenceProblems.value = []
}

/**
 * Closes the notice of the problems, keeping the failures quiet for the rest of the session.
 *
 * @remarks
 * The author read the warning: the list goes, so the bar of the shell disappears, and the deduplication stays, so the
 * same failing key does not come back on the next write (2026-11-22, the owner: the close hides it for the session). A
 * **new** failure (another key, another target) is news, and raises the bar again.
 */
export function dismissPersistenceProblems(): void {
  persistenceProblems.value = []
}

/**
 * The sentence of the notice of the persistence problems.
 *
 * @remarks
 * The bar of the shell is one line: the message of the first problem (the console, and the list of the bar, has every
 * one of them).
 *
 * @param problems The problems reported so far.
 *
 * @returns The text of the notice, or `undefined` when there is nothing to say.
 */
export function persistenceNoticeOf(problems: readonly PersistenceProblem[]): string | undefined {
  return problems[0]?.message
}
