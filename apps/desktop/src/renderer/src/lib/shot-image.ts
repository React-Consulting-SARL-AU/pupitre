import type { ShotsReadResult } from "@pupitre/shared/agent-protocol/processes";
import { type Bytes, checkedBytes } from "./file-bytes";

/** The bytes of a capture, put back together and checked against the receipt. */
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

/**
 * The dimensions of a capture, read from the file rather than from the agent.
 *
 * The protocol says what a capture weighs, never how wide it is. A decoder that
 * cannot read this kind of image answers nothing, and the frame does without.
 */
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
