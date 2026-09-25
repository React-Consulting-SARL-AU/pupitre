import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type { SudoOutcome } from "@shared/sudo";
import type { AgentClient } from "./agent-client";
import { refusalOf } from "./refusal";
import { trace } from "./trace";

export type { HardenOutcome, HardenUpdate } from "@shared/harden";

export interface HardenDeps {
  client: Pick<AgentClient, "request">;
  /** Null when the app does not own this server's SSH configuration. */
  switchUser: (serverId: string, user: string) => string | null;
  /** A session opened as root survives the account change and would hide what the ping must prove. */
  close: (serverId: string) => void;
  user: (serverId: string) => string | null;
}

const HARDEN_USER = "dev";

/** The hardening restarts sshd: the seconds it takes to come back are not an answer. */
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

/** The agent keeps no report of a hardening: who answers after the cut is the only record of it. */
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
  sudo: (
    serverId: string,
    onEvent: (event: Event) => void
  ) => Promise<SudoOutcome>;
}

/** The sudo password is set only once the app speaks as `dev` and SSH no longer takes passwords. */
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

  // Root kept on purpose is not a refusal: the machine was hardened and the app moves to `dev` all the same.
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
