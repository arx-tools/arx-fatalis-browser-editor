/**
 * Writes a count the way the widgets show it: a space between every three digits.
 *
 * @remarks
 * The grouping is spelled out instead of `toLocaleString`, so the numbers are the same in the browser and in
 * the tests (the locale of the browser and of the test runner are not necessarily the same).
 *
 * @param value The count to write.
 *
 * @returns The number, grouped with spaces.
 */
export function formatCount(value: number): string {
  const digits = Math.trunc(Math.abs(value)).toString()
  let grouped = ''

  // the digits are walked from the right, so a space goes before every third one
  for (const [index, digit] of [...digits].toReversed().entries()) {
    if (index > 0 && index % 3 === 0) {
      grouped = ` ${grouped}`
    }

    grouped = `${digit}${grouped}`
  }

  if (value < 0) {
    return `-${grouped}`
  }

  return grouped
}
