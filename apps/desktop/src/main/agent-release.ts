import { createHash, createPublicKey, verify } from "node:crypto";
import type { AgentResponse } from "@shared/agent";
import { refuseWith } from "./refusal";

/**
 * The agent's binary, checked before it is pushed anywhere.
 *
 * What comes down from the platform is a file the app did not build: the
 * checksum the enrolment announced and the Ed25519 signature of the release are
 * both verified here, against a key compiled into the app. A binary that fails
 * either never reaches a server.
 */

/**
 * The public half of the release key, the same for every version.
 *
 * Its private half lives only in 1Password and in the CI secret; it signs the
 * agent binary and the app artefacts. Changing this string repudiates
 * everything published before: an app carrying one key and an agent signed by
 * another refuse every update.
 */
export const AGENT_RELEASE_PUBLIC_KEY =
  "hs05klwUQPR+pNnh7lVme+DKN5SUNC3+OGKrEBTOr48=";

const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

const ED25519_PUBLIC_KEY_BYTES = 32;

export interface ReleaseFingerprint {
  version: string;
  arch: string;
  sha256: string;
  signature: string;
}

/**
 * What the publishing chain signs, line for line.
 *
 * The signature does not cover the bytes alone: it binds the digest to the
 * published version and architecture, so an authentic binary meant for another
 * machine is refused too. `internal/release` in Go writes exactly these four
 * lines.
 */
export function signedMessage(
  version: string,
  arch: string,
  sha256: string
): Buffer {
  return Buffer.from(`pupitred\n${version}\n${arch}\n${sha256}\n`, "utf8");
}

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_signature", id, values);
}

function keyObjectOf(publicKey: string) {
  const raw = Buffer.from(publicKey, "base64");

  if (raw.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    return null;
  }

  return createPublicKey({
    format: "der",
    key: Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, "hex"), raw]),
    type: "spki",
  });
}

function signatureHolds(
  message: Uint8Array,
  signature: string,
  publicKey: string
): boolean {
  const key = keyObjectOf(publicKey);

  if (!key) {
    return false;
  }

  try {
    return verify(null, message, key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function checkAgentRelease(
  bytes: Uint8Array,
  release: ReleaseFingerprint,
  publicKey: string
): AgentResponse<{ sha256: string }> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (release.sha256 && sha256 !== release.sha256) {
    return refuse("refusal.release.checksum", { version: release.version });
  }

  if (!release.signature) {
    return refuse("refusal.release.unsigned", { version: release.version });
  }

  if (!publicKey) {
    return refuse("refusal.release.key");
  }

  const message = signedMessage(release.version, release.arch, sha256);

  if (!signatureHolds(message, release.signature, publicKey)) {
    return refuse("refusal.release.signature", { version: release.version });
  }

  return { ok: true, result: { sha256 } };
}
