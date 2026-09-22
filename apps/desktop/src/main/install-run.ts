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
import { runMigrate } from "./agent-update-run";
import { refusalOf, refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

export type { InstallUpdate } from "@shared/install";

/**
 * One installation, from the binary to the report.
 *
 * The order is the whole of it: probe the machine, put `pupitred` on it if it
 * has none or has fallen behind — then drop the channels, since the session
 * answering us still runs the binary the rename replaced, and bring the
 * machine's configuration to the shape the new one reads — hand that agent the
 * enrolment token the platform just granted, ask it which modules it stands
 * behind, read the secrets from the vault, then speak `install` once. The
 * secrets are written by the channel on the line that follows the request —
 * they never enter `params`, never cross the bridge — and the vault is emptied
 * once the agent has accepted the install: a refusal has consumed nothing, and
 * the next Apply carries them again.
 */

export interface InstallDeps {
  client: Pick<AgentClient, "request" | "close">;
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
  /** Reads the vault, and leaves it as it is. */
  secrets: (serverId: string) => InstallSecrets;
  /** Empties the vault, once the agent holds what was in it. */
  forgetSecrets: (serverId: string) => void;
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
 * How a cut enrolment is picked back up: the same token is sent again on a
 * fresh channel, a few times, a short wait apart.
 *
 * A dropped channel is the one failure worth retrying here — the token was not
 * refused, the line was, and most cuts fall before the exchange, where the
 * token is still unspent and the retry trades it cleanly. A cut that fell after
 * the exchange leaves a token already spent: the retry is refused as used, and
 * the machine — enrolled all the same — is mended by a fresh add, which asks the
 * platform for a new token of its own.
 */
export interface EnrolRetry {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

const ENROL_RETRY: EnrolRetry = {
  attempts: 4,
  delayMs: 2000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * The seat this machine was granted, handed to the agent that will hold it.
 *
 * A channel that drops no longer strands the seat: the enrolment is sent again
 * on a fresh channel, so a blip on the line is retried rather than abandoned.
 * Only a drop is retried; a refused token is reported as it comes. Nothing
 * granted, nothing to enrol: a development build has no seat to claim.
 */
export async function enrolAgent(
  serverId: string,
  enrollment: EnrollmentSummary | null | undefined,
  deps: Pick<InstallDeps, "client" | "enrollment" | "identity">,
  retry: EnrolRetry = ENROL_RETRY
): Promise<AgentResponse<EnrollResult | null>> {
  const granted = enrollment ? deps.enrollment(enrollment.serverId) : null;

  if (!granted) {
    return { ok: true, result: null };
  }

  if (deps.identity?.(serverId)) {
    return { ok: true, result: null };
  }

  let answer = await sendEnrolment(serverId, granted, deps.client);

  for (
    let left = retry.attempts;
    left > 0 && !answer.ok && answer.error.code === "disconnected";
    left -= 1
  ) {
    await retry.sleep(retry.delayMs);

    // A cut that fell after the exchange leaves the machine enrolled with no
    // answer to show for it. The probe opens a channel whose hello now names
    // the server — `ping` answers in every state an agent can be in — so a
    // retry that would replay a spent token becomes the success it was.
    const probed = await deps.client.request(serverId, "ping", {});

    if (probed.ok && deps.identity?.(serverId)) {
      return { ok: true, result: null };
    }

    answer = await sendEnrolment(serverId, granted, deps.client);
  }

  return answer;
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

/**
 * `defer` is left out when it names nobody.
 *
 * An agent older than the field refuses a request that carries it — its
 * parameters are a closed shape, and rightly so. Sending nothing when there is
 * nothing to say keeps every ordinary install working against the agent already
 * on the machine; asking to defer against such an agent still gets refused, and
 * that refusal is the truth.
 */
function deferring(defer: readonly string[]): { defer?: string[] } {
  return defer.length > 0 ? { defer: [...defer] } : {};
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

/**
 * The agent validates the whole configuration before its first step, and
 * writes its report only then: a step seen, on the channel or replayed from the
 * report, says the request was taken — secrets included — even when the answer
 * that followed was a cut or a timeout.
 */
function isStep(update: InstallUpdate): boolean {
  return update.kind === "event" && update.event.event === "step";
}

/**
 * The binary the app just pushed is not the one the open sessions run: they
 * hold the file the rename replaced. A machine that already ran the agent has a
 * configuration to bring to the new binary's shape before anything else is
 * asked of it; a bare one has nothing to migrate yet.
 */
async function reopened(
  serverId: string,
  probe: ProbeResult,
  deps: Pick<InstallDeps, "client">
): Promise<AgentResponse<null>> {
  deps.client.close(serverId);

  if (probe.agent_version === null) {
    return { ok: true, result: null };
  }

  const migrated = await runMigrate(serverId, deps);

  return migrated.ok ? { ok: true, result: null } : migrated;
}

export async function runInstall(
  serverId: string,
  modules: readonly string[],
  config: ModuleConfig,
  update: (change: InstallUpdate) => void,
  deps: InstallDeps,
  /** Modules to put on the machine without configuring: their questions wait. */
  defer: readonly string[] = []
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

    const fresh = await reopened(serverId, probe.result, deps);

    if (!fresh.ok) {
      return fresh;
    }

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

  // A module nobody is configuring wants nothing filled in for it, an account
  // token least of all: the whole point is that it goes on without one.
  const asked = modules.filter((id) => !defer.includes(id));
  const managed = await deps.managed(serverId, asked);

  if (!managed.ok) {
    return managed;
  }

  const typed = deps.secrets(serverId);
  const secrets = secretsOf(merged(typed, managed.result.secrets), modules);
  const carries = Object.keys(secrets).length > 0;
  let taken = false;

  const answer = await deps.client.request(
    serverId,
    "install",
    {
      config: only(merged(config, managed.result.config), asked),
      ...deferring(defer),
      modules: [...modules],
      secrets_stdin: carries,
    },
    {
      onEvent: (event) => {
        const change: InstallUpdate = { event, kind: "event" };

        taken ||= isStep(change);
        update(change);
      },
      ...(carries ? { secrets } : {}),
    }
  );

  if (answer.ok || taken) {
    deps.forgetSecrets(serverId);
  }

  update({
    held: Object.keys(typed).length > 0 && !(answer.ok || taken),
    kind: "secrets",
  });

  return answer;
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
  deps: Pick<InstallDeps, "client" | "declared">,
  defer: readonly string[] = []
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
    ...deferring(defer),
    modules: [...modules],
  });
}
