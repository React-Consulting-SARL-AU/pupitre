import type {
  InstallCheckResult,
  InstallResult,
  InstallSecrets,
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type {
  EnrollResult,
  KeysListResult,
} from "@pupitre/shared/agent-protocol/system";
import type { EnrollmentSummary } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import type { AgentDelivery } from "./agent-binary";
import type { AgentClient } from "./agent-client";
import { runMigrate } from "./agent-update-run";
import { refusalOf, refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

export type { InstallUpdate } from "@shared/install";

export interface InstallDeps {
  client: Pick<AgentClient, "request" | "close">;
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  deliver: (
    serverId: string,
    arch: string
  ) => Promise<AgentResponse<AgentDelivery>>;
  /** Asked only once the binary is in place: a bare machine has no catalogue to answer with. */
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
  secrets: (serverId: string) => InstallSecrets;
  forgetSecrets: (serverId: string) => void;
  /** Keyed by the platform's server id: the token belongs to the seat just bought and burns on first use. */
  enrollment: (platformServerId: string) => EnrollmentGrant | null;
  managed: (
    serverId: string,
    modules: readonly string[]
  ) => Promise<AgentResponse<ManagedValues>>;
  identity?: (serverId: string) => string | null;
  deviceKey?: () => string | null;
}

export interface CheckDeps extends Pick<InstallDeps, "client" | "declared"> {
  /** Without the managed values, every field the app fills itself would read as missing. */
  weighed: (
    serverId: string,
    modules: readonly string[]
  ) => Promise<ModuleConfig>;
}

export interface EnrollmentGrant {
  token: string;
  platformUrl: string;
}

/** The token rides the secret line, never an argument where `ps` would show it to other accounts. */
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

/** Only a dropped channel is retried: most cuts fall before the exchange, while the token is still unspent. */
export interface EnrolRetry {
  attempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

const SPACES = /\s+/;

const ENROL_RETRY: EnrolRetry = {
  attempts: 4,
  delayMs: 2000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function enrolAgent(
  serverId: string,
  enrollment: EnrollmentSummary | null | undefined,
  deps: Pick<InstallDeps, "client" | "enrollment" | "identity" | "deviceKey">,
  retry: EnrolRetry = ENROL_RETRY
): Promise<AgentResponse<EnrollResult | null>> {
  const granted = enrollment ? deps.enrollment(enrollment.serverId) : null;

  if (!granted) {
    return { ok: true, result: null };
  }

  const enrolled = await exchangeToken(serverId, granted, deps, retry);

  if (!enrolled.ok) {
    return enrolled;
  }

  const trusted = await trustDevice(serverId, deps);

  return trusted.ok ? enrolled : trusted;
}

/** The root of trust of decision 0014: laid over the app's own SSH session, never by the platform. */
export async function trustDevice(
  serverId: string,
  deps: Pick<InstallDeps, "client" | "deviceKey">
): Promise<AgentResponse<KeysListResult | null>> {
  const line = deps.deviceKey?.();

  if (!line) {
    return { ok: true, result: null };
  }

  const answer = await deps.client.request(serverId, "keys.trust", {
    public_key: bareKey(line),
  });

  if (!answer.ok && answer.error.code === "unknown_command") {
    return { ok: true, result: null };
  }

  return answer;
}

function bareKey(line: string): string {
  return line.trim().split(SPACES).slice(0, 2).join(" ");
}

async function exchangeToken(
  serverId: string,
  granted: EnrollmentGrant,
  deps: Pick<InstallDeps, "client" | "identity">,
  retry: EnrolRetry
): Promise<AgentResponse<EnrollResult | null>> {
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

    // A cut after the exchange left the machine enrolled: a fresh hello names it, so no spent token is replayed.
    const probed = await deps.client.request(serverId, "ping", {});

    if (probed.ok && deps.identity?.(serverId)) {
      return { ok: true, result: null };
    }

    answer = await sendEnrolment(serverId, granted, deps.client);
  }

  return answer;
}

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

/** An agent older than `defer` refuses any request carrying it: its parameters are a closed shape. */
function deferring(defer: readonly string[]): { defer?: string[] } {
  return defer.length > 0 ? { defer: [...defer] } : {};
}

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

/** The agent validates everything before its first step, so a step seen means the secrets were taken. */
function isStep(update: InstallUpdate): boolean {
  return update.kind === "event" && update.event.event === "step";
}

/** Open sessions still run the binary the rename replaced, so they are closed before migrating. */
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

  // A deferred module gets no managed values, an account token least of all: it goes on without one.
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

/** Creates nothing, no tunnel above all: weighing a form must not bill the reader for looking at it. */
export async function runCheck(
  serverId: string,
  modules: readonly string[],
  config: ModuleConfig,
  deps: CheckDeps,
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

  const asked = modules.filter((id) => !defer.includes(id));
  const managed = await deps.weighed(serverId, asked);
  const answer = await deps.client.request(serverId, "install.check", {
    config: only(merged(config, managed), modules),
    ...deferring(defer),
    modules: [...modules],
  });

  return answer.ok
    ? {
        ok: true,
        result: {
          ...answer.result,
          problems: answer.result.problems.filter(
            (problem) => !judgedWithAnOldSecret(problem, managed)
          ),
        },
      }
    : answer;
}

/** The agent tests with the secret it holds; its verdict would block the Apply that replaces that secret. */
function judgedWithAnOldSecret(
  problem: InstallCheckResult["problems"][number],
  managed: ModuleConfig
): boolean {
  return problem.code === "connection" && problem.module in managed;
}
