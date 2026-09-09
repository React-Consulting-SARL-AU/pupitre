import type {
  InstallCheckResult,
  InstallResult,
  InstallSecrets,
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { EnrollResult } from "@pupitre/shared/agent-protocol/system";
import type { EnrollmentSummary } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import type { AgentDelivery } from "./agent-binary";
import type { AgentClient } from "./agent-client";
import { refusalOf, refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

export type { InstallUpdate } from "@shared/install";

/**
 * One installation, from the binary to the report.
 *
 * The order is the whole of it: probe the machine, put `pupitred` on it if it
 * has none, hand that agent the enrolment token the platform just granted, ask
 * it which modules it stands behind, take the secrets out of the vault, then
 * speak `install` once. The
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
  /**
   * The enrolment the platform granted for that server, taken once.
   *
   * Keyed by the id the platform gave, not the app's own: the token belongs to
   * the seat that was just bought, and it is burnt by the first exchange.
   */
  enrollment: (platformServerId: string) => EnrollmentGrant | null;
  /**
   * The values a module declares `managed`: they come from the platform, never
   * from the form, and the app only carries them.
   */
  managed: (
    serverId: string,
    modules: readonly string[]
  ) => Promise<AgentResponse<ManagedValues>>;
  /** The identity the agent already answers with, when it has one. */
  identity?: (serverId: string) => string | null;
}

/** What the agent needs to buy its server token, and nothing else. */
export interface EnrollmentGrant {
  token: string;
  platformUrl: string;
}

/**
 * The enrolment token, handed to the agent on the line that follows the request.
 *
 * It is a secret like an install password: `params` names the platform and says
 * a secret line follows, and the token itself travels on that line — never in
 * an argument of a command line, where `ps` would show it to anyone with an
 * account on the machine.
 */
export function sendEnrolment(
  serverId: string,
  granted: EnrollmentGrant,
  client: Pick<AgentClient, "request">
): Promise<AgentResponse<EnrollResult>> {
  return client.request(
    serverId,
    "enroll",
    { platform_url: granted.platformUrl, secrets_stdin: true },
    { secrets: { enrollment_token: granted.token } }
  );
}

/**
 * The seat this machine was granted, handed to the agent that will hold it.
 *
 * An enrolment is taken up rather than replayed: a server already carrying an
 * identity says so in its `hello`, which is what an app whose channel dropped
 * between the exchange and its answer reads on the way back. A refusal is
 * reported as it comes — the agent answers a burnt token and a revoked one with
 * the same code, so only the identity can tell the two apart.
 * Nothing granted, nothing to enrol: a development build has no seat to claim.
 */
export async function enrolAgent(
  serverId: string,
  enrollment: EnrollmentSummary | null | undefined,
  deps: Pick<InstallDeps, "client" | "enrollment" | "identity">
): Promise<AgentResponse<EnrollResult | null>> {
  const granted = enrollment ? deps.enrollment(enrollment.serverId) : null;

  if (!granted) {
    return { ok: true, result: null };
  }

  if (deps.identity?.(serverId)) {
    return { ok: true, result: null };
  }

  return await sendEnrolment(serverId, granted, deps.client);
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

/** What the platform provided wins: the form never had these keys to fill in. */
function merged<T extends ModuleConfig | InstallSecrets>(
  asked: T,
  given: T
): T {
  const kept = { ...asked } as ModuleConfig;

  for (const [id, values] of Object.entries(given)) {
    kept[id] = { ...kept[id], ...values };
  }

  return kept as T;
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
        ...refusalOf("bad_request", "refusal.modules.none"),
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

    const enrolled = await enrolAgent(
      serverId,
      delivery.result.enrollment,
      deps
    );

    if (!enrolled.ok) {
      return enrolled;
    }
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
        ...refusalOf("module_not_found", "refusal.module.undeclared", {
          module: stranger,
        }),
      },
    };
  }

  const managed = await deps.managed(serverId, modules);

  if (!managed.ok) {
    return managed;
  }

  const secrets = secretsOf(
    merged(deps.secrets(serverId), managed.result.secrets),
    modules
  );
  const carries = Object.keys(secrets).length > 0;

  return await deps.client.request(
    serverId,
    "install",
    {
      config: only(merged(config, managed.result.config), modules),
      modules: [...modules],
      secrets_stdin: carries,
    },
    {
      onEvent: (event) => update({ event, kind: "event" }),
      ...(carries ? { secrets } : {}),
    }
  );
}

/**
 * The same request, weighed rather than run.
 *
 * Nothing leaves and nothing is created: no binary, no enrolment, no tunnel,
 * and above all no secret — a screen that opened an account's tunnel to weigh a
 * form would bill the reader for looking at it. What comes back is what the
 * machine alone knows, and an agent too old to answer refuses, which the screen
 * reads as nothing to add.
 */
export async function runCheck(
  serverId: string,
  modules: readonly string[],
  config: ModuleConfig,
  deps: Pick<InstallDeps, "client" | "declared">
): Promise<AgentResponse<InstallCheckResult>> {
  if (modules.length === 0) {
    return { ok: true, result: { problems: [], warnings: [] } };
  }

  const declared = await deps.declared(serverId);

  if (!declared.ok) {
    return declared;
  }

  const stranger = modules.find((id) => !declared.result.includes(id));

  if (stranger) {
    return refuseWith("module_not_found", "refusal.module.undeclared", {
      module: stranger,
    });
  }

  return await deps.client.request(serverId, "install.check", {
    config: only(config, modules),
    modules: [...modules],
  });
}
