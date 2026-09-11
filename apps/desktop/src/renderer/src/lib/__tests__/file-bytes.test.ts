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

describe("les octets d'un fichier lu par morceaux", () => {
  it("se recollent dans l'ordre des numéros et se vérifient contre le reçu", async () => {
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

  it("ne rendent rien quand l'empreinte du reçu n'est pas celle des octets", async () => {
    const bytes = bytesOf(TEXT);
    const chunks = pieces(bytes, 7);

    const whole = await checkedBytes(chunks, {
      chunks: chunks.size,
      sha256: "0".repeat(64),
      size_bytes: bytes.length,
    });

    expect(whole).toBeNull();
  });

  it("ne rendent rien quand un morceau manque ou que la taille diffère", async () => {
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

  it("encodent un texte en base64 sans retour à la ligne, et le retrouvent", () => {
    const encoded = base64Of(bytesOf("é ça va\n"));

    expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(textOf(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))).toBe(
      "é ça va\n"
    );
  });

  it("encodent plus d'un pas de base64 sans perdre un octet", () => {
    const bytes = new Uint8Array(70_000).map((_, at) => at % 251) as Bytes;

    expect(atob(base64Of(bytes)).length).toBe(70_000);
  });
});
