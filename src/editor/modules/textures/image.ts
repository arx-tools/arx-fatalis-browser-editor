/**
 * The images of the game, read the way the game reads them.
 *
 * @remarks
 * A texture of Arx Fatalis is a BMP, JPG or PNG file with two twists: the BMPs are 24 bits without an alpha channel, and
 * the game reads their **black** pixels as the holes of the face (the flame of a torch, the holes of a fence); and the
 * name of a file does not always carry its extension, so the bytes decide the format.
 *
 * The editor decodes a texture with this module: the texture of a face (`levelTextures`), the thumbnail of the texture
 * list and the image the user drops on it are all the same file read the same way.
 */
/**
 * The MIME type of a texture.
 *
 * @remarks
 * The blob needs a type: a blob without one is not a document every browser decodes an image from, and the game's
 * textures are BMP, JPG and PNG files.
 *
 * The **bytes** say it first, because a level may name a texture without its extension (`[glass]_windows2`) while the
 * file is a `.jpg`: the name is only the fallback.
 *
 * @param name The name the level calls the texture.
 * @param bytes The bytes of the file.
 *
 * @returns The MIME type, `application/octet-stream` for a name with no known extension.
 */
function mimeTypeOf(name: string, bytes: ArrayBuffer): string {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 3))

  // the magic of the three formats of the game: JPEG (FF D8 FF), PNG (89 50 4E 47), BMP (42 4D)
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg'
  }

  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e) {
    return 'image/png'
  }

  if (head[0] === 0x42 && head[1] === 0x4d) {
    return 'image/bmp'
  }

  const lower = name.toLowerCase()

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (lower.endsWith('.png')) {
    return 'image/png'
  }

  if (lower.endsWith('.bmp')) {
    return 'image/bmp'
  }

  return 'application/octet-stream'
}

/**
 * Tells whether the bytes of a file are a BMP.
 *
 * @param bytes The bytes of the file, as the browser hands them over.
 *
 * @returns True for the `BM` magic of the format.
 */
function isBmpFile(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2))

  return head[0] === 0x42 && head[1] === 0x4d
}

/**
 * The pixels of an image, with its size.
 */
interface PixelImage {
  /**
   * The pixels, RGBA, four bytes each.
   */
  readonly pixels: Uint8ClampedArray
  /**
   * The width of the image, in pixels.
   */
  readonly width: number
  /**
   * The height of the image, in pixels.
   */
  readonly height: number
}

/**
 * Copies the colour of an opaque neighbour into a transparent pixel.
 *
 * @remarks
 * A texture filter mixes the pixels around a hole, and a black one would draw a dark border around it: the pixel takes
 * the colour of one of its neighbours that is not a hole (the game does the same, `Image::applyColorKeyToAlpha`).
 *
 * @param image The pixels of the image.
 * @param x The column of the transparent pixel.
 * @param y The row of the transparent pixel.
 */
function copyNeighbourColour(image: PixelImage, x: number, y: number): void {
  const { pixels, width, height } = image
  const row = y * width
  const offset = (row + x) * 4

  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny = ny + 1) {
    const neighbourRow = ny * width

    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx = nx + 1) {
      const neighbour = (neighbourRow + nx) * 4

      if (pixels[neighbour + 3] !== 0) {
        pixels[offset] = pixels[neighbour]
        pixels[offset + 1] = pixels[neighbour + 1]
        pixels[offset + 2] = pixels[neighbour + 2]

        return
      }
    }
  }
}

/**
 * Cuts the colour key of a BMP into the alpha channel of its pixels.
 *
 * @remarks
 * The textures of the game are 24-bit BMPs without an alpha channel, and the game reads the **black** pixels as the
 * holes of the face (`Texture::restore` calls `applyColorKeyToAlpha(Color::black)`) — the torch's flame, the holes of a
 * fence, the windows of a door. A browser decodes such a file as an image without alpha, so the editor has to do what
 * the game does: a black pixel becomes transparent.
 *
 * A transparent pixel takes the colour of an opaque **neighbour** (the game does the same), because a texture filter
 * that mixes a black pixel into a lit one would draw a dark border around every hole.
 *
 * @param pixels The pixels of the image, RGBA, four bytes each.
 * @param width The width of the image, in pixels.
 * @param height The height of the image, in pixels.
 */
export function applyColourKey(pixels: Uint8ClampedArray, width: number, height: number): void {
  let keyed = false

  for (let offset = 0; offset < pixels.length; offset = offset + 4) {
    if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) {
      pixels[offset + 3] = 0
      keyed = true
    } else {
      pixels[offset + 3] = 255
    }
  }

  if (!keyed) {
    return
  }

  // the transparent pixels take the colour of an opaque neighbour, so a filter does not mix black into a lit pixel
  for (let y = 0; y < height; y = y + 1) {
    const row = y * width

    for (let x = 0; x < width; x = x + 1) {
      const offset = (row + x) * 4

      if (pixels[offset + 3] === 0) {
        copyNeighbourColour({ pixels, width, height }, x, y)
      }
    }
  }
}

/**
 * Decodes the bytes of a texture.
 *
 * @remarks
 * The colour key of a BMP can only be cut into the pixels of the image, and the canvas is where the pixels of a decoded
 * image can be read and written back: a decoded `ImageBitmap` has no pixels of its own to touch.
 *
 * @param name The name of the texture, for the format the bytes do not tell.
 * @param bytes The bytes of the file.
 *
 * @returns The image of the texture, with the colour key of its file when it is a BMP.
 *
 * @throws When the browser can not decode the file.
 */
export async function decodeTextureBitmap(name: string, bytes: ArrayBuffer): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeTypeOf(name, bytes) }))

  if (!isBmpFile(bytes)) {
    return bitmap
  }

  const canvas = document.createElement('canvas')

  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (context === null) {
    return bitmap
  }

  context.drawImage(bitmap, 0, 0)

  const image = context.getImageData(0, 0, canvas.width, canvas.height)

  applyColourKey(image.data, image.width, image.height)
  context.putImageData(image, 0, 0)

  return await createImageBitmap(canvas)
}

/**
 * The size of the shorter side of a thumbnail, in pixels.
 *
 * @remarks
 * The texture list shows a hundred of them at once, and a thumbnail of a few dozen pixels is enough for the eye to tell
 * a brick from a leaf: a bigger one would cost the page a megabyte of png data for the same read.
 */
const THUMBNAIL_SIZE = 64

/**
 * Makes a small picture of an image, for a list of textures.
 *
 * @remarks
 * The picture is a data url, so it can be the `src` of an `img` without a second decoder round (the bytes of the texture
 * are not read again for the tile). A texture is drawn into a square without keeping its proportions — the tiles of the
 * list are squares, and a texture of the game is nearly always one.
 *
 * @param bitmap The decoded image.
 * @param size The side of the square, {@link THUMBNAIL_SIZE} by default.
 *
 * @returns The data url of the picture.
 */
export function thumbnailUrlOf(bitmap: ImageBitmap, size = THUMBNAIL_SIZE): string {
  const canvas = document.createElement('canvas')

  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')

  if (context === null) {
    return ''
  }

  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, size, size)

  return canvas.toDataURL('image/png')
}
