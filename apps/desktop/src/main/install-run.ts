import type {
  InstallResult,
  InstallSecrets,
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import type { AgentDelivery } from "./agent-binary";
import type { AgentClient } from "./agent-client";

export type { InstallUpdate } from "@shared/install";

/**
 * One installation, from the binary to the report.
 *
 * The order is the whole of it: probe the machine, put `pupitred` on it if it
 * has none, ask that agent which modules it stands behind, take the secrets out
 * of the vault, then speak `install` once. The
 * secrets are read here and written by the channel on the line that follows the
 * request — they never enter `params`, never cross the bridge, and the vault is
 * empty by the time the first step event comes back.
 */

export interface InstallDeps {
  client: Pick<AgentClient, "request">;
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  deliver: (
    serverId: string,
    arch: string
  ) => Promise<AgentResponse<AgentDelivery>>;
  /**
   * The module names this server's agent stands behind.
   *
   * Asked after the binary is in place, never before: a bare machine has no
   * catalogue to answer with, and refusing the install for that would refuse it
   * on exactly the machines this whole path exists for.
   */
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
  /** Reads the vault and empties it: these secrets are used once or lost. */
  secrets: (serverId: string) => InstallSecrets;
}

/**
 * A server keeps the agent it has, unless it has none or the probe says it has
 * fallen behind: pushing eighteen megabytes onto a machine that already runs
 * the right binary buys nothing.
 */
function needsAgent(probe: ProbeResult): boolean {
  return probe.agent_version === null || probe.verdict.up_to_date === false;
}

function only(config: ModuleConfig, modules: readonly string[]): ModuleConfig {
  const kept: ModuleConfig = {};

  for (const id of modules) {
    kept[id] = { ...config[id] };
  }

  return kept;
}

function secretsOf(
  secrets: InstallSecrets,
  modules: readonly string[]
): InstallSecrets {
  const kept: InstallSecrets = {};

  for (const id of modules) {
    const held = secrets[id];

    if (held && Object.keys(held).length > 0) {
      kept[id] = held;
    }
  }

  return kept;
}

export async function runInstall(
  serverId: string,
  modules: readonly string[],
  config: ModuleConfig,
  update: (change: InstallUpdate) => void,
  deps: InstallDeps
): Promise<AgentResponse<InstallResult>> {
  if (modules.length === 0) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Aucun module à installer.",
        fix: "Choisis au moins un module dans le catalogue.",
      },
    };
  }

  const probe = await deps.probe(serverId);

  if (!probe.ok) {
    return probe;
  }

  if (needsAgent(probe.result)) {
    const arch = probe.result.arch;
    update({ arch, kind: "sending" });

    const delivery = await deps.deliver(serverId, arch);

    if (!delivery.ok) {
      return delivery;
    }

    update({ arch, bytes: delivery.result.bytes, kind: "sent" });
  }

  const declared = await deps.declared(serverId);

  if (!declared.ok) {
    return declared;
  }

  const stranger = modules.find((id) => !declared.result.includes(id));

  if (stranger) {
    return {
      ok: false,
      error: {
        code: "module_not_found",
        message: `Le catalogue de ce serveur ne déclare pas ${stranger}.`,
        fix: "Recharge le catalogue, puis refais ta sélection.",
      },
    };
  }

  const secrets = secretsOf(deps.secrets(serverId), modules);
  const carries = Object.keys(secrets).length > 0;

  return await deps.client.request(
    serverId,
    "install",
    {
      config: only(config, modules),
      modules: [...modules],
      secrets_stdin: carries,
    },
    {
      onEvent: (event) => update({ event, kind: "event" }),
      ...(carries ? { secrets } : {}),
    }
  );
}
