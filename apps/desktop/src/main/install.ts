import { join } from "node:path";
import type {
  InstallCheckResult,
  InstallReport,
  InstallResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { AgentSendPhase } from "@shared/install";
import { app } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import {
  type AgentDelivery,
  agentPayload,
  sendAgentBinary,
} from "./agent-binary";
import { AGENT_RELEASE_PUBLIC_KEY } from "./agent-release";
import { restoring } from "./backups";
import { declaredModules } from "./catalog";
import { managedValues, weighedValues } from "./connections";
import { prepareAgent } from "./enrollment-run";
import { ed25519Fingerprint } from "./host-keys";
import { inspect } from "./inspection";
import {
  type EnrollmentGrant,
  enrolAgent,
  type InstallUpdate,
  runCheck,
  runInstall,
} from "./install-run";
import { forgetSecrets, readSecrets } from "./install-secrets";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { agentPlatformUrl, buildKind } from "./platform-url";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { byId, noteGrant, paths } from "./servers";
import { sshArgs } from "./ssh-config";
import { sudoPasswordFor } from "./sudo-held";
import { usageRefusal } from "./usage-guard";

const AGENT_DIR = "agent";

export function agentResourcesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, AGENT_DIR)
    : join(app.getAppPath(), "resources", AGENT_DIR);
}

function refuse(id: string): AgentResponse<never> {
  return refuseWith("bad_request", id);
}

// Enrolled first: the platform names the release to push, and the app checks it before touching the machine.
async function deliver(
  serverId: string,
  arch: string,
  onPhase: (phase: AgentSendPhase) => void = () => undefined
): Promise<AgentResponse<AgentDelivery>> {
  const server = byId(serverId);

  if (!server) {
    return refuse("refusal.server.unknown");
  }

  onPhase("enrolling");

  const prepared = await prepareAgent(server, arch, {
    account,
    bind: noteGrant,
    build: buildKind(),
    embedded: (wanted) => agentPayload(agentResourcesDir(), wanted),
    hostFingerprint: (held) => ed25519Fingerprint(held, paths()),
    releaseKey: AGENT_RELEASE_PUBLIC_KEY,
  });

  if (!prepared.ok) {
    return prepared;
  }

  onPhase("sending");

  const sent = await sendAgentBinary({
    args: sshArgs(server, paths()),
    password: sudoPasswordFor(serverId),
    payload: prepared.result.payload,
    user: server.user,
  });

  return sent.ok
    ? {
        ok: true,
        result: { ...sent.result, enrollment: prepared.result.enrollment },
      }
    : sent;
}

export function accountDeviceKey(): string | null {
  return account.state().device?.publicKey ?? null;
}

export function enrollmentGrant(
  platformServerId: string
): EnrollmentGrant | null {
  const token = account.takeEnrollmentToken(platformServerId);

  return token ? { platformUrl: agentPlatformUrl(), token } : null;
}

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isModuleConfig(value: unknown): value is ModuleConfig {
  return typeof value === "object" && value !== null;
}

function checked(
  serverId: unknown,
  modules: unknown
): { serverId: string; modules: string[] } | AgentResponse<never> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse("refusal.server.unknown");
  }

  if (!isNames(modules)) {
    return refuse("refusal.selection.unreadable");
  }

  return { modules, serverId };
}

// A bare server has no catalogue yet: the binary goes first, its architecture read from the probe, not the interface.
async function sendAgent(
  serverId: unknown,
  onPhase: (phase: AgentSendPhase) => void = () => undefined
): Promise<AgentResponse<AgentDelivery>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse("refusal.server.unknown");
  }

  const refused = usageRefusal(() => account.guard());

  if (refused) {
    return refused;
  }

  onPhase("reading");

  const probe = await inspect(serverId);

  if (!probe.ok) {
    return probe;
  }

  const sent = await deliver(serverId, probe.result.arch, onPhase);

  if (!sent.ok) {
    return sent;
  }

  onPhase("starting");

  const enrolled = await enrolAgent(serverId, sent.result.enrollment, {
    client: agentClient,
    deviceKey: accountDeviceKey,
    enrollment: enrollmentGrant,
    identity: (id) => agentClient.session(id)?.server_id ?? null,
  });

  return enrolled.ok ? sent : enrolled;
}

export function registerInstall(): void {
  handle(
    "install:start",
    shape(isString, anything, anything, isModuleConfig, isNames),
    async (
      event,
      token,
      serverId,
      modules,
      config,
      defer
    ): Promise<AgentResponse<InstallResult>> => {
      const call = checked(serverId, modules);

      if ("ok" in call) {
        return call;
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      const update = relayTo<InstallUpdate>(
        event.sender,
        token,
        "install:update",
        "update"
      );

      return await runInstall(
        call.serverId,
        call.modules,
        config,
        update,
        {
          client: agentClient,
          deviceKey: accountDeviceKey,
          identity: (id) => agentClient.session(id)?.server_id ?? null,
          declared: declaredModules,
          deliver,
          enrollment: enrollmentGrant,
          forgetSecrets,
          managed: (id, asked) => managedValues(id, asked, restoring(id)),
          probe: inspect,
          secrets: readSecrets,
        },
        defer
      );
    }
  );

  // Weighing touches nothing, so no usage guard: a reader without the right still learns what the form gets wrong.
  handle(
    "install:check",
    shape(anything, anything, isModuleConfig, isNames),
    async (
      _event,
      serverId,
      modules,
      config,
      defer
    ): Promise<AgentResponse<InstallCheckResult>> => {
      const call = checked(serverId, modules);

      if ("ok" in call) {
        return call;
      }

      return await runCheck(
        call.serverId,
        call.modules,
        config,
        {
          client: agentClient,
          declared: declaredModules,
          weighed: weighedValues,
        },
        defer
      );
    }
  );

  handle(
    "install:agent-send",
    shape(isString, anything),
    (event, token, serverId) =>
      sendAgent(
        serverId,
        relayTo<AgentSendPhase>(
          event.sender,
          token,
          "install:agent-phase",
          "phase"
        )
      )
  );

  handle(
    "install:report",
    shape(anything),
    async (_event, serverId): Promise<AgentResponse<InstallReport>> => {
      if (typeof serverId !== "string" || !byId(serverId)) {
        return refuse("refusal.server.unknown");
      }

      return await agentClient.request(serverId, "report");
    }
  );
}
