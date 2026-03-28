function downloadAs(filename: string, data: string): void {
  const link = document.createElement('a')
  link.setAttribute('href', data)
  link.setAttribute('download', filename)

  link.style.display = 'none'
  document.body.append(link)

  link.click()
  link.remove()
}

export function downloadBinaryAs(filename: string, data: string | ArrayBuffer | Blob, mimeType?: string): void {
  let url: string
  if (mimeType === undefined) {
    url = URL.createObjectURL(new Blob([data]))
  } else {
    url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  }

  downloadAs(filename, url)

  URL.revokeObjectURL(url)
}
