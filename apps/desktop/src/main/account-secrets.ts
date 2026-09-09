import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { ConnectionKind } from "@shared/connections";
import { refuseWith } from "./refusal";

/**
 * The account tokens an installation carries, taken from the keychain.
 *
 * Nothing changes on the wire for having moved a token out of a form. It still
 * reaches the machine on the install's own secret line, written by the main
 * process, and still lands in `/etc/pupitre/env` under root alone. What changed
 * is where the app took it from: an account the client connected once, instead
 * of a field they would have retyped for every server.
 *
 * A module whose account is not connected is refused here rather than on the
 * machine: half an installation that stops at a missing token is worse than one
 * that never started.
 */

/** A module whose one secret is an account token, and the field that carries it. */
export interface AccountSecret {
  module: string;
  kind: ConnectionKind;
  field: string;
}

export const ACCOUNT_SECRETS: readonly AccountSecret[] = [
  { field: "token", kind: "github", module: "tool.github" },
  {
    field: "service_account_token",
    kind: "1password",
    module: "tool.1password",
  },
  { field: "api_key", kind: "neon", module: "tool.neon" },
];

export function accountSecrets(
  modules: readonly string[],
  token: (kind: ConnectionKind) => string | null,
  declared: readonly AccountSecret[] = ACCOUNT_SECRETS
): AgentResponse<InstallSecrets> {
  const secrets: InstallSecrets = {};

  for (const { module, kind, field } of declared) {
    if (!modules.includes(module)) {
      continue;
    }

    const held = token(kind);

    if (!held) {
      return refuseWith("bad_request", "refusal.connection.absent", { kind });
    }

    secrets[module] = { [field]: held };
  }

  return { ok: true, result: secrets };
}
