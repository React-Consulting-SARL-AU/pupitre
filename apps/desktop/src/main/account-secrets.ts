import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { ConnectionKind } from "@shared/connections";
import { CONNECTION_KINDS } from "@shared/connections";
import { refuseWith } from "./refusal";

/**
 * The account tokens an installation carries, taken from the keychain.
 *
 * Which module wants one, and under which field, is read from the manifests the
 * agent declared — never from a list held here. An app that kept its own would
 * refuse what a newer agent accepts, and would go on asking for what an older
 * one still wants typed. The catalogue belongs to the agent.
 *
 * Nothing changes on the wire for having moved a token out of a form. It still
 * reaches the machine on the install's own secret line, written by the main
 * process, and still lands in `/etc/pupitre/env` under root alone. What changed
 * is where the app took it from: an account the client connected once, instead
 * of a field they would have retyped for every server.
 */

function kindOf(value: string | undefined): ConnectionKind | null {
  return (CONNECTION_KINDS as readonly string[]).includes(value ?? "")
    ? (value as ConnectionKind)
    : null;
}

/** A field the app fills from a connection: managed, secret, and nothing else. */
function managedSecrets(manifest: Manifest): string[] {
  return manifest.fields
    .filter((field) => field.managed === true && field.kind === "secret")
    .map((field) => field.key);
}

export function accountSecrets(
  modules: readonly string[],
  manifests: readonly Manifest[],
  token: (kind: ConnectionKind) => string | null,
  /** Modules whose managed values are derived elsewhere, the tunnel's above all. */
  derived: readonly string[] = []
): AgentResponse<InstallSecrets> {
  const secrets: InstallSecrets = {};

  for (const manifest of manifests) {
    if (!modules.includes(manifest.id) || derived.includes(manifest.id)) {
      continue;
    }

    const kind = kindOf(manifest.connection);
    const keys = managedSecrets(manifest);

    if (!kind || keys.length === 0) {
      continue;
    }

    const held = token(kind);

    // Refusing here leaves the machine untouched; letting the install start
    // would leave half of one, stopped on a module that had no way to work.
    if (!held) {
      return refuseWith("bad_request", "refusal.connection.absent", { kind });
    }

    secrets[manifest.id] = Object.fromEntries(keys.map((key) => [key, held]));
  }

  return { ok: true, result: secrets };
}
