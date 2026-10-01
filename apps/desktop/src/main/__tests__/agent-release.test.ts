import { describe, expect, it } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  AGENT_RELEASE_PUBLIC_KEY,
  checkAgentRelease,
  signedMessage,
} from "../agent-release";

const BINARY = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]);

const SPKI_HEADER_BYTES = 12;

const ED25519_PUBLIC_KEY_BYTES = 32;

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  const spki = pair.publicKey.export({ format: "der", type: "spki" });

  return {
    privateKey: pair.privateKey,
    publicKey: spki.subarray(SPKI_HEADER_BYTES).toString("base64"),
  };
}

const ARCH = "amd64";

function releaseOf(bytes: Uint8Array, privateKey: Parameters<typeof sign>[2]) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return {
    arch: ARCH,
    sha256,
    signature: sign(
      null,
      signedMessage("1.4.0", ARCH, sha256),
      privateKey
    ).toString("base64"),
    version: "1.4.0",
  };
}

describe("the signed message", () => {
  it("is the one apps/agent/internal/release writes, line for line", () => {
    expect(signedMessage("1.4.0", "amd64", "abc").toString("utf8")).toBe(
      "pupitred\n1.4.0\namd64\nabc\n"
    );
  });
});

describe("verifying an agent release", () => {
  it("accepts a signed binary whose checksum matches", () => {
    const { privateKey, publicKey } = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), publicKey)
    ).toMatchObject({ ok: true });
  });

  it("refuses a truncated binary before even looking at the signature", () => {
    const { privateKey, publicKey } = keyPair();
    const release = releaseOf(BINARY, privateKey);

    expect(
      checkAgentRelease(BINARY.subarray(0, 4), release, publicKey)
    ).toMatchObject({
      ok: false,
      error: {
        code: "bad_signature",
        phrase: {
          id: "refusal.release.checksum",
          values: { version: "1.4.0" },
        },
      },
    });
  });

  it("refuses a binary signed for another architecture", () => {
    const { privateKey, publicKey } = keyPair();

    expect(
      checkAgentRelease(
        BINARY,
        { ...releaseOf(BINARY, privateKey), arch: "arm64" },
        publicKey
      )
    ).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.release.signature" } },
    });
  });

  it("refuses a signature that does not hold", () => {
    const { privateKey } = keyPair();
    const other = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), other.publicKey)
    ).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.release.signature" } },
    });
  });

  it("refuses an unsigned release", () => {
    const { publicKey } = keyPair();

    expect(
      checkAgentRelease(
        BINARY,
        { arch: ARCH, sha256: "", signature: "", version: "1.4.0" },
        publicKey
      )
    ).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.release.unsigned" } },
    });
  });

  it("refuses to validate anything without an embedded public key", () => {
    const { privateKey } = keyPair();

    expect(
      checkAgentRelease(BINARY, releaseOf(BINARY, privateKey), "")
    ).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.release.key" } },
    });
    expect(Buffer.from(AGENT_RELEASE_PUBLIC_KEY, "base64")).toHaveLength(
      ED25519_PUBLIC_KEY_BYTES
    );
  });
});
