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

/**
 * Writes the size of a widget the way the plate of the lock shows it, e.g. `354 × 200`.
 *
 * @remarks
 * The sides are whole pixels on purpose: the box of a widget is a float, the user reads the number to write it into a
 * preset, and a fraction of a pixel there would only be noise. The two sides are separated by a multiplication sign
 * with spaces around it, so the number reads as a size and not as one long number.
 *
 * @param width The width of the widget.
 * @param height The height of the widget.
 *
 * @returns The two sides, rounded and separated.
 */
export function formatSize(width: number, height: number): string {
  return `${Math.round(width).toString()} × ${Math.round(height).toString()}`
}
