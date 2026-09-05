/**
 * Packs already-rendered PNGs into a Windows icon.
 *
 * An .ico is a six-byte header, one sixteen-byte entry per image, then the
 * images themselves. Storing PNGs rather than bitmaps is what every browser and
 * every Windows since Vista reads, and it keeps the file small.
 */
const HEADER = 6
const ENTRY = 16

export function ico(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const file = new Uint8Array(
    HEADER +
      ENTRY * images.length +
      images.reduce((total, image) => total + image.png.length, 0)
  )
  const view = new DataView(file.buffer)

  view.setUint16(2, 1, true)
  view.setUint16(4, images.length, true)

  let offset = HEADER + ENTRY * images.length

  images.forEach((image, index) => {
    const entry = HEADER + ENTRY * index

    // 256 is written as 0: the field is one byte and the format has no other way
    // to say it.
    file[entry] = image.size === 256 ? 0 : image.size
    file[entry + 1] = image.size === 256 ? 0 : image.size
    view.setUint16(entry + 4, 1, true)
    view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, image.png.length, true)
    view.setUint32(entry + 12, offset, true)

    file.set(image.png, offset)
    offset += image.png.length
  })

  return file
}
