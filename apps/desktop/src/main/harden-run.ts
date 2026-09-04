import type { AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type { AgentClient } from "./agent-client";

export type { HardenOutcome, HardenUpdate } from "@shared/harden";

/**
 * The hardening, and the app's own move that follows it.
 *
 * The order is the whole of it: the agent opens `dev`, checks that a key opens
 * it, and only then closes root. The app rewrites its SSH configuration on the
 * account the agent named, drops the channels — a session opened as root
 * survives the account it was opened with, and would hide the very thing we
 * want to prove — then speaks again to see who answers.
 *
 * A refusal changes nothing here: root stays open, the configuration stays as
 * it was, and the reason travels back exactly as the agent phrased it.
 */

export type HardenDeps = {
  client: Pick<AgentClient, "request">;
  /**
   * Rewrites the app's SSH configuration for this server, and answers the
   * account it now uses — or nothing when the app does not own that
   * configuration.
   */
  switchUser: (serverId: string, user: string) => string | null;
  /** Drops the channels, so the next command opens a session on the new account. */
  close: (serverId: string) => void;
};

export async function runHarden(
  serverId: string,
  update: (change: HardenUpdate) => void,
  deps: HardenDeps
): Promise<AgentResponse<HardenOutcome>> {
  const answer = await deps.client.request(
    serverId,
    "harden",
    { user: "dev" },
    { onEvent: (event) => update({ event, kind: "event" }) }
  );

  if (!answer.ok) {
    return answer;
  }

  const harden = answer.result;

  if (!harden.root_closed) {
    return { ok: true, result: { harden, reconnected: false, user: null } };
  }

  update({ kind: "switching", user: harden.next_user });

  const user = deps.switchUser(serverId, harden.next_user);

  if (!user) {
    return {
      ok: true,
      result: {
        error: {
          code: "internal",
          fix: "Ouvre les réglages et corrige le compte de ce serveur, puis reconnecte-toi.",
          message: `Root est fermé sur le serveur, mais l'app n'a pas pu passer sa connexion sur ${harden.next_user}.`,
        },
        harden,
        reconnected: false,
        user: null,
      },
    };
  }

  deps.close(serverId);

  const back = await deps.client.request(serverId, "ping");

  return {
    ok: true,
    result: {
      harden,
      reconnected: back.ok,
      user,
      ...(back.ok ? {} : { error: back.error }),
    },
  };
}
