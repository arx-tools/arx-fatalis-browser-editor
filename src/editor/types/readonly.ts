import type { ArxMap } from '../../generator/ArxMap.ts'

/**
 * A value whose data can not be written through its type, on every level.
 *
 * @remarks
 * The type is the compile time half of the ownership of the shared data: a consumer that only reads the level takes
 * {@link ReadonlyArxMap}, and a write of a field (or a push into an array) is an error. The three.js objects it reaches
 * keep their methods: a method call (a `setAttribute`) is not an assignment, and the type can not see inside it, which
 * is why the shared buffers are guarded by the tests and the ownership notes as well.
 */
export type DeepReadonly<T> =
  T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends ReadonlySet<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends (...args: never[]) => unknown
            ? T
            : T extends object
              ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
              : T

/**
 * The level as a consumer that only reads it sees it.
 */
export type ReadonlyArxMap = DeepReadonly<ArxMap>
