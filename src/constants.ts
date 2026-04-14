export const validArxLevelIds = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const

export type ValidArxLevelIds = (typeof validArxLevelIds)[number]

export function isValidArxLevelId(level: number): level is ValidArxLevelIds {
  if (Number.isNaN(level)) {
    return false
  }

  return (validArxLevelIds as readonly number[]).includes(level)
}
