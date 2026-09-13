import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { ConnectionAccount, ConnectionKind } from "@shared/connections";
import { CONNECTION_KINDS } from "@shared/connections";
import { refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

/**
 * What an installation takes from the connections, out of the keychain.
 *
 * Which module wants one, and under which field, is read from the manifests the
 * agent declared — never from a list held here. An app that kept its own would
 * refuse what a newer agent accepts, and would go on asking for what an older
 * one still wants typed. The catalogue belongs to the agent.
 *
 * A managed secret is the connection's token. A managed text field is the
 * identifier of the account that token opens — what `wrangler` deploys to when
 * the token spans several. Nothing changes on the wire for having moved a
 * token out of a form: it still reaches the machine on the install's own
 * secret line, written by the main process, and still lands in
 * `/etc/pupitre/env` under root alone.
 */

/** What the keychain holds for a connection: the token, and the account it opened when the provider could be asked. */
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
  /** Modules whose managed values are derived elsewhere, the tunnel's above all. */
  derived: readonly string[] = []
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

    // Refusing here leaves the machine untouched; letting the install start
    // would leave half of one, stopped on a module that had no way to work.
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
