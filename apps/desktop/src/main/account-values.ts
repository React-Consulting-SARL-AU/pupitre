import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { ConnectionAccount, ConnectionKind } from "@shared/connections";
import { CONNECTION_KINDS } from "@shared/connections";
import { refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

// Managed fields come from the agent's manifests, never a local list that would drift from newer agents.

export interface HeldConnection {
  token: string;
  account: ConnectionAccount | null;
}

function kindOf(value: string | undefined): ConnectionKind | null {
  return (CONNECTION_KINDS as readonly string[]).includes(value ?? "")
    ? (value as ConnectionKind)
    : null;
}

function managedOf(manifest: Manifest, kind: "secret" | "text"): string[] {
  return manifest.fields
    .filter((field) => field.managed === true && field.kind === kind)
    .map((field) => field.key);
}

export function accountValues(
  modules: readonly string[],
  manifests: readonly Manifest[],
  held: (kind: ConnectionKind) => HeldConnection | null,
  /** Modules whose managed values are derived elsewhere, such as the tunnel's. */
  derived: readonly string[] = [],
  /** A restored machine already holds what an absent connection would have given. */
  lenient = false
): AgentResponse<ManagedValues> {
  const secrets: InstallSecrets = {};
  const config: ManagedValues["config"] = {};

  for (const manifest of manifests) {
    if (!modules.includes(manifest.id) || derived.includes(manifest.id)) {
      continue;
    }

    const kind = kindOf(manifest.connection);
    const secretKeys = managedOf(manifest, "secret");
    const accountKeys = managedOf(manifest, "text");

    if (!kind || secretKeys.length + accountKeys.length === 0) {
      continue;
    }

    const connection = held(kind);

    if (!connection && lenient) {
      continue;
    }

    // Refusing now leaves the machine untouched instead of half-installed on a module that cannot work.
    if (!connection) {
      return refuseWith("bad_request", "refusal.connection.absent", { kind });
    }

    if (secretKeys.length > 0) {
      secrets[manifest.id] = Object.fromEntries(
        secretKeys.map((key) => [key, connection.token])
      );
    }

    if (accountKeys.length > 0 && connection.account) {
      config[manifest.id] = Object.fromEntries(
        accountKeys.map((key) => [key, connection.account?.id])
      );
    }
  }

  return { ok: true, result: { config, secrets } };
}
