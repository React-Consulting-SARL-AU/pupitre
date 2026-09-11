/**
 * Bytes that crossed the channel in pieces, put back together and checked.
 *
 * A capture and a file travel the same way: base64 chunks on events, then a
 * receipt that says how many there were, how much they weigh and what they
 * hash to. Anything that does not add up — a chunk missing, one that is not
 * base64, a size or a digest that differs — comes back as nothing at all: a
 * truncated file shown as the file would be a lie about what is on the server.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

export interface ChunkReceipt {
  chunks: number;
  size_bytes: number;
  sha256: string;
}

const BASE64_STEP = 32_768;

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

export async function fingerprint(bytes: Bytes): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkedBytes(
  chunks: ReadonlyMap<number, string>,
  receipt: ChunkReceipt
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

/** Base64 without line breaks, as every body on the channel travels; built in steps so a megabyte never becomes one call's arguments. */
export function base64Of(bytes: Bytes): string {
  let binary = "";

  for (let at = 0; at < bytes.length; at += BASE64_STEP) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_STEP));
  }

  return btoa(binary);
}

export function textOf(bytes: Bytes): string {
  return new TextDecoder("utf-8").decode(bytes);
}

export function bytesOf(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}
