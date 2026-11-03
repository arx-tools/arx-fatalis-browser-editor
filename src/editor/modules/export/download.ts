/**
 * Saves a binary the page produced to the disk, under a name.
 *
 * @remarks
 * The browser has no API that writes a file of its own: an `<a>` with a `download` attribute, clicked once, is the way
 * every page gives a file to the user. The bytes are handed over as a blob, and the object url is released at once:
 * the download holds its own copy of the blob by then.
 *
 * @param name The name the browser saves the file under.
 * @param data The bytes to save.
 * @param mimeType The type of the file, `application/octet-stream` by default.
 */
export function downloadBinaryAs(name: string, data: ArrayBuffer, mimeType = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  const link = document.createElement('a')

  link.href = url
  link.download = name
  link.click()

  URL.revokeObjectURL(url)
}
