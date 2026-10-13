export interface ImageSize {
  width: number;
  height: number;
}

/** Read from the file because the protocol gives an image's weight, never its dimensions. */
export async function imageSize(blob: Blob): Promise<ImageSize | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const size = { height: bitmap.height, width: bitmap.width };

    bitmap.close();

    return size;
  } catch {
    return null;
  }
}
