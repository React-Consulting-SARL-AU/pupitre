import type { ShotsReadResult } from "@pupitre/shared/agent-protocol/processes";
import { type Bytes, checkedBytes } from "./file-bytes";

export function shotBytes(
  chunks: ReadonlyMap<number, string>,
  receipt: ShotsReadResult
): Promise<Bytes | null> {
  return checkedBytes(chunks, receipt);
}

export interface ShotSize {
  width: number;
  height: number;
}

/** Read from the file because the protocol gives a capture's weight, never its dimensions. */
export async function shotSize(blob: Blob): Promise<ShotSize | null> {
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
