import { createHash, createPublicKey, verify } from "node:crypto";
import type { AgentResponse } from "@shared/agent";

/**
 * The agent's binary, checked before it is pushed anywhere.
 *
 * What comes down from the platform is a file the app did not build: the
 * checksum the enrolment announced and the Ed25519 signature of the release are
 * both verified here, against a key compiled into the app. A binary that fails
 * either never reaches a server.
 */

/**
 * The release signing key is issued by the distribution pipeline (AGT-15,
 * INF-05) and does not exist yet: an unsigned release is refused in a packaged
 * build rather than trusted.
 */
export const AGENT_RELEASE_PUBLIC_KEY = "";

const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

const ED25519_PUBLIC_KEY_BYTES = 32;

export interface ReleaseFingerprint {
  version: string;
  sha256: string;
  signature: string;
}

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "bad_signature", fix, message } };
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
  bytes: Uint8Array,
  signature: string,
  publicKey: string
): boolean {
  const key = keyObjectOf(publicKey);

  if (!key) {
    return false;
  }

  try {
    return verify(null, bytes, key, Buffer.from(signature, "base64"));
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
    return refuse(
      `Le binaire téléchargé ne correspond pas à la somme annoncée pour ${release.version}.`,
      "Relance l'installation : la plateforme a peut-être servi un fichier tronqué."
    );
  }

  if (!release.signature) {
    return refuse(
      `La plateforme n'a pas signé la version ${release.version} de l'agent.`,
      "Publie une version signée de l'agent avant de l'installer sur un serveur."
    );
  }

  if (!publicKey) {
    return refuse(
      "Cette app ne porte pas la clé publique qui valide les binaires de l'agent.",
      "Reconstruis l'app avec la clé de signature des releases."
    );
  }

  if (!signatureHolds(bytes, release.signature, publicKey)) {
    return refuse(
      `La signature de la version ${release.version} de l'agent est invalide.`,
      "N'installe pas ce binaire : signale-le, puis réessaie depuis la console."
    );
  }

  return { ok: true, result: { sha256 } };
}
