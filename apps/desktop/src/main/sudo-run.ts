import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { SudoOutcome } from "@shared/sudo";
import type { AgentClient } from "./agent-client";
import { refusalOf } from "./refusal";
import { drawSudoPassword, hashSudoPassword } from "./sudo-password";
import type { SudoVault } from "./sudo-vault";

export interface SudoDeps {
  client: Pick<AgentClient, "request">;
  vault: Pick<SudoVault, "keep" | "state">;
  draw?: () => string;
  hash?: (password: string) => string;
}

function wrotePassword(event: Event): boolean {
  return (
    event.event === "step" &&
    event.step === "set-password" &&
    event.status !== "fail"
  );
}

/** Kept once the agent wrote it: a rule that fails afterwards still leaves `dev` with that password. */
export async function setSudoPassword(
  serverId: string,
  onEvent: (event: Event) => void,
  deps: SudoDeps
): Promise<SudoOutcome> {
  const password = (deps.draw ?? drawSudoPassword)();
  const passwordHash = (deps.hash ?? hashSudoPassword)(password);

  let written = false;

  const answer = await deps.client.request(
    serverId,
    "harden.sudo",
    { secrets_stdin: true, user: "dev" },
    {
      onEvent: (event) => {
        written ||= wrotePassword(event);
        onEvent(event);
      },
      secrets: { password_hash: passwordHash },
    }
  );

  if (answer.ok || written) {
    deps.vault.keep(serverId, password);
  }

  return answer.ok
    ? { kept: deps.vault.state(serverId).kept, ok: true }
    : { error: answer.error, ok: false };
}

export interface EnterDeps {
  client: Pick<AgentClient, "request" | "resetPrivileged">;
  vault: Pick<SudoVault, "keep" | "state">;
  /** The password the next privileged session opens with, in place of the kept one; null withdraws it. */
  offer: (serverId: string, password: string | null) => void;
}

/** A server under the passwordless rule would take any password, so it is refused before being tried. */
export async function enterSudoPassword(
  serverId: string,
  password: string,
  deps: EnterDeps
): Promise<SudoOutcome> {
  const snapshot = await deps.client.request(serverId, "snapshot");

  if (!snapshot.ok) {
    return { error: snapshot.error, ok: false };
  }

  if (snapshot.result.machine.sudo !== "password") {
    return { error: refusalOf("bad_request", "refusal.sudo.open"), ok: false };
  }

  deps.offer(serverId, password);
  deps.client.resetPrivileged(serverId);

  const answer = await deps.client.request(serverId, "ping", undefined, {
    privileged: true,
  });

  deps.offer(serverId, null);

  if (!answer.ok) {
    deps.client.resetPrivileged(serverId);

    return { error: answer.error, ok: false };
  }

  deps.vault.keep(serverId, password);

  return { kept: deps.vault.state(serverId).kept, ok: true };
}
