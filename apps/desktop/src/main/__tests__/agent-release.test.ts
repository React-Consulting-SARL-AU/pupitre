import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { AGENT_RELEASE_PUBLIC_KEY, checkAgentRelease } from "../agent-release";

/**
 * The binary that comes down from the platform is checked before it goes up to
 * a server: the checksum the enrolment announced, then the release signature.
 */

const BINARY = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);

const SPKI_HEADER_BYTES = 12;

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  const spki = pair.publicKey.export({ format: "der", type: "spki" });

  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(SPKI_HEADER_BYTES).toString("base64"),
  };
}

function releaseOf(bytes: Uint8Array, privateKey: Parameters<typeof sign>[2]) {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    signature: sign(null, bytes, privateKey).toString("base64"),
    version: "1.4.0",
  };
}

describe("la vérification d'une release de l'agent", () => {
  it("accepte un binaire signé dont la somme correspond", () => {
    const { privateKey, publicKey } = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), publicKey)
    ).toMatchObject({ ok: true });
  });

  it("refuse un binaire tronqué avant même de regarder la signature", () => {
    const { privateKey, publicKey } = keyPair();
    const release = releaseOf(BINARY, privateKey);

    expect(
      checkAgentRelease(BINARY.subarray(0, 4), release, publicKey)
    ).toMatchObject({
      ok: false,
      error: {
        code: "bad_signature",
        message: expect.stringContaining("1.4.0"),
      },
    });
  });

  it("refuse une signature qui ne tient pas", () => {
    const { privateKey } = keyPair();
    const other = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), other.publicKey)
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("invalide") },
    });
  });

  it("refuse une release non signée", () => {
    const { publicKey } = keyPair();

    expect(
      checkAgentRelease(
        BINARY,
        { sha256: "", signature: "", version: "1.4.0" },
        publicKey
      )
    ).toMatchObject({
      ok: false,
      error: { fix: expect.stringContaining("version signée") },
    });
  });

  it("refuse de valider quoi que ce soit sans clé publique embarquée", () => {
    const { privateKey } = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), "")
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("clé publique") },
    });
    expect(AGENT_RELEASE_PUBLIC_KEY).toBe("");
  });
});
