import type { ShotsReadResult } from "@pupitre/shared/agent-protocol/processes";

/**
 * The bytes of a capture, put back together and checked against the receipt.
 *
 * The agent sends the file in bounded chunks and then says how many it sent and
 * what the whole thing hashes to. Anything that does not add up — a chunk
 * missing, a chunk that is not base64, a size or a digest that differs — comes
 * back as nothing at all: a truncated image shown as an image would be a lie
 * about what is on the server.
 */

type Bytes = Uint8Array<ArrayBuffer>;

function decoded(chunk: string): Bytes | null {
  try {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);

    for (let at = 0; at < binary.length; at += 1) {
      bytes[at] = binary.charCodeAt(at);
    }

    return bytes;
  } catch {
    return null;
  }
}

function joined(parts: readonly Bytes[]): Bytes {
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0)
  );
  let at = 0;

  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }

  return bytes;
}

async function fingerprint(bytes: Bytes): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function shotBytes(
  chunks: ReadonlyMap<number, string>,
  receipt: ShotsReadResult
): Promise<Bytes | null> {
  if (chunks.size !== receipt.chunks) {
    return null;
  }

  const parts: Bytes[] = [];

  for (let seq = 0; seq < receipt.chunks; seq += 1) {
    const chunk = chunks.get(seq);
    const part = chunk === undefined ? null : decoded(chunk);

    if (!part) {
      return null;
    }

    parts.push(part);
  }

  const bytes = joined(parts);

  if (bytes.length !== receipt.size_bytes) {
    return null;
  }

  return (await fingerprint(bytes)) === receipt.sha256 ? bytes : null;
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
