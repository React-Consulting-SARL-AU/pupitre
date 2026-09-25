import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type { SudoOutcome } from "@shared/sudo";
import type { AgentClient } from "./agent-client";
import { refusalOf } from "./refusal";
import { trace } from "./trace";

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
 * it was, and the reason travels back exactly as the agent phrased it. Root
 * kept on purpose is not a refusal: the machine was hardened, only its root
 * account keeps a key of its own, and the app moves to `dev` all the same.
 */

export interface HardenDeps {
  client: Pick<AgentClient, "request">;
  /**
   * Rewrites the app's SSH configuration for this server, and answers the
   * account it now uses — or nothing when the app does not own that
   * configuration.
   */
  switchUser: (serverId: string, user: string) => string | null;
  /** Drops the channels, so the next command opens a session on the new account. */
  close: (serverId: string) => void;
  /** The account the app reaches this server with now: the one the hardening closes. */
  user: (serverId: string) => string | null;
}

/** The account the hardening opens, fixed by the protocol. */
const HARDEN_USER = "dev";

/**
 * How the machine is asked again after a cut: the hardening restarts sshd, and
 * the seconds it takes to come back are not an answer.
 */
export interface ProbeRetry {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

const PROBE_RETRY: ProbeRetry = {
  attempts: 6,
  delayMs: 5000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function answersAs(
  serverId: string,
  user: string,
  deps: HardenDeps
): Promise<boolean> {
  if (!deps.switchUser(serverId, user)) {
    return false;
  }

  deps.close(serverId);

  const back = await deps.client.request(serverId, "ping");

  trace("harden", "probe", { answers: back.ok, server: serverId, user });

  return back.ok;
}

/**
 * Who answers once the link is back is the only record of a hardening the
 * channel lost: the agent keeps no report of it, and the install's would be
 * read in its place.
 *
 * The account the app came in with still opening the machine means the agent
 * never got to close it, and the cut is the truth to hand back — the reader
 * runs the hardening again, which picks up where it stopped. That account
 * refused and `dev` opening means it did close: the app moves to `dev` exactly
 * as it would have on the agent's word. Nobody answering within the window
 * leaves the configuration as it was.
 */
async function afterCut(
  serverId: string,
  cut: AgentError,
  update: (change: HardenUpdate) => void,
  deps: HardenDeps,
  retry: ProbeRetry
): Promise<AgentResponse<HardenOutcome>> {
  const before = deps.user(serverId);

  if (!before) {
    return { ok: false, error: cut };
  }

  let announced = false;

  for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
    if (attempt > 0) {
      await retry.sleep(retry.delayMs);
    }

    if (await answersAs(serverId, before, deps)) {
      return { ok: false, error: cut };
    }

    if (!announced) {
      announced = true;
      update({ kind: "switching", user: HARDEN_USER });
    }

    if (await answersAs(serverId, HARDEN_USER, deps)) {
      return {
        ok: true,
        result: {
          harden: {
            next_user: HARDEN_USER,
            root_closed: true,
            root_kept: false,
          },
          reconnected: true,
          user: HARDEN_USER,
        },
      };
    }
  }

  deps.switchUser(serverId, before);
  deps.close(serverId);

  return { ok: false, error: cut };
}

export interface SecuringDeps extends HardenDeps {
  /** Sets the sudo password of `dev` on the session the app just reopened as `dev`. */
  sudo: (
    serverId: string,
    onEvent: (event: Event) => void
  ) => Promise<SudoOutcome>;
}

/**
 * The securing as a whole: the hardening, then the sudo password (decision
 * 0015). The password comes once the app speaks as `dev` and SSH no longer
 * takes passwords; a hardening that left root open, or a reconnection that
 * failed, leaves sudo as it was.
 */
export async function runSecuring(
  serverId: string,
  update: (change: HardenUpdate) => void,
  deps: SecuringDeps,
  retry: ProbeRetry = PROBE_RETRY
): Promise<AgentResponse<HardenOutcome>> {
  const hardened = await runHarden(serverId, update, deps, retry);

  if (!(hardened.ok && hardened.result.reconnected)) {
    return hardened;
  }

  const sudo = await deps.sudo(serverId, (event) =>
    update({ event, kind: "event" })
  );

  return { ok: true, result: { ...hardened.result, sudo } };
}

export async function runHarden(
  serverId: string,
  update: (change: HardenUpdate) => void,
  deps: HardenDeps,
  retry: ProbeRetry = PROBE_RETRY
): Promise<AgentResponse<HardenOutcome>> {
  const answer = await deps.client.request(
    serverId,
    "harden",
    { user: HARDEN_USER },
    {
      onEvent: (event) => update({ event, kind: "event" }),
      onQueued: () => update({ kind: "queued" }),
    }
  );

  if (!answer.ok) {
    return answer.error.code === "disconnected"
      ? await afterCut(serverId, answer.error, update, deps, retry)
      : answer;
  }

  const harden = answer.result;

  if (!(harden.root_closed || harden.root_kept)) {
    return { ok: true, result: { harden, reconnected: false, user: null } };
  }

  update({ kind: "switching", user: harden.next_user });

  const user = deps.switchUser(serverId, harden.next_user);

  if (!user) {
    return {
      ok: true,
      result: {
        error: {
          ...refusalOf("internal", "refusal.harden.account", {
            user: harden.next_user,
          }),
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
