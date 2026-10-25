/**
 * Tells whether a value is one of the primitives the url can hold without a json encoding.
 *
 * @param value The value to check.
 * @returns True for strings, numbers and booleans.
 */
export function isPrimitive(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/**
 * Compares two values by their content, the way a deep equal does.
 *
 * @remarks
 * - arrays are compared item by item, objects key by key, and the key order does not matter
 * - the values the module stores are json compatible, so the recursion stops at the primitives
 *
 * @param left The first value.
 * @param right The second value.
 * @returns True when the two hold the same content.
 */
export function deepEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }

    return left.every((item, index) => {
      return deepEquals(item, right[index])
    })
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => {
    return key in right && deepEquals((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
  })
}

/**
 * Parses a json string without throwing.
 *
 * @param raw The string to parse.
 * @returns The parsed value, or undefined when it is not valid json.
 */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}
