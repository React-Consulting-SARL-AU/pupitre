import { describe, expect, it } from "bun:test";
import {
  type Bytes,
  base64Of,
  bytesOf,
  checkedBytes,
  fingerprint,
  textOf,
} from "../file-bytes";

const TEXT = "PORT=3000\nHOST=127.0.0.1\n";

function pieces(bytes: Bytes, size: number): Map<number, string> {
  const cut = new Map<number, string>();

  for (let at = 0, seq = 0; at < bytes.length; at += size, seq += 1) {
    cut.set(seq, base64Of(bytes.slice(at, at + size)));
  }

  return cut;
}

describe("the bytes of a file read in chunks", () => {
  it("are glued back in chunk-number order and checked against the receipt", async () => {
    const bytes = bytesOf(TEXT);
    const chunks = pieces(bytes, 7);

    const whole = await checkedBytes(chunks, {
      chunks: chunks.size,
      sha256: await fingerprint(bytes),
      size_bytes: bytes.length,
    });

    expect(whole).not.toBeNull();
    expect(textOf(whole as Bytes)).toBe(TEXT);
  });

  it("return nothing when the receipt's hash is not the bytes' hash", async () => {
    const bytes = bytesOf(TEXT);
    const chunks = pieces(bytes, 7);

    const whole = await checkedBytes(chunks, {
      chunks: chunks.size,
      sha256: "0".repeat(64),
      size_bytes: bytes.length,
    });

    expect(whole).toBeNull();
  });

  it("return nothing when a chunk is missing or the size differs", async () => {
    const bytes = bytesOf(TEXT);
    const chunks = pieces(bytes, 7);
    const sha256 = await fingerprint(bytes);

    chunks.delete(1);

    expect(
      await checkedBytes(chunks, {
        chunks: chunks.size + 1,
        sha256,
        size_bytes: bytes.length,
      })
    ).toBeNull();
    expect(
      await checkedBytes(pieces(bytes, 7), {
        chunks: pieces(bytes, 7).size,
        sha256,
        size_bytes: bytes.length + 1,
      })
    ).toBeNull();
  });

  it("encode a text in base64 without line breaks, and decode it back", () => {
    const encoded = base64Of(bytesOf("é ça va\n"));

    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(textOf(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))).toBe(
      "é ça va\n"
    );
  });

  it("encode more than one base64 step without losing a byte", () => {
    const bytes = new Uint8Array(70_000).map((_, at) => at % 251) as Bytes;

    expect(atob(base64Of(bytes)).length).toBe(70_000);
  });
});
