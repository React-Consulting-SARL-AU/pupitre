import { join } from "node:path";
import type {
  InstallCheckResult,
  InstallReport,
  InstallResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { AgentSendPhase } from "@shared/install";
import { app, ipcMain } from "electron";
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
import { agentPlatformUrl, buildKind } from "./platform-url";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { byId, noteGrant, paths } from "./servers";
import { sshArgs } from "./ssh-config";
import { sudoPasswordFor } from "./sudo-held";
import { usageRefusal } from "./usage-guard";

/**
 * The installation screen, seen from the main process.
 *
 * The renderer names a server and modules; nothing else of what it says is
 * trusted. The module names are checked against the catalogue this server's own
 * agent declared, and the secrets never make the trip: they are taken from the
 * vault here, on the way out.
 */

const AGENT_DIR = "agent";

export function agentResourcesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, AGENT_DIR)
    : join(app.getAppPath(), "resources", AGENT_DIR);
}

function refuse(id: string): AgentResponse<never> {
  return refuseWith("bad_request", id);
}

/**
 * The server is enrolled before its binary leaves: the platform gives it a seat
 * and names the release to push, and the app checks that release before it
 * touches the machine.
 */
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

/**
 * The shape of what the renderer said, before anything is done with it. What
 * the names mean is checked further on, against the agent's own catalogue.
 */
function checked(
  serverId: unknown,
  modules: unknown
): { serverId: string; modules: string[] } | AgentResponse<never> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse("refusal.server.unknown");
  }

  if (!Array.isArray(modules) || modules.some((id) => typeof id !== "string")) {
    return refuse("refusal.selection.unreadable");
  }

  return { modules: modules as string[], serverId };
}

function configOf(value: unknown): ModuleConfig {
  return value && typeof value === "object" ? (value as ModuleConfig) : {};
}

/** The modules the window asked to leave unconfigured, taken as names and nothing else. */
function deferredOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((one): one is string => typeof one === "string")
    : [];
}

/**
 * The binary, put on the machine before anything is asked of it.
 *
 * A bare server has no catalogue to answer with, so the send comes first and
 * the architecture is read from the probe here rather than taken from the
 * interface: the renderer names a server, and nothing else about the machine.
 */
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
  ipcMain.handle(
    "install:start",
    async (
      event,
      token: unknown,
      serverId: unknown,
      modules: unknown,
      config: unknown,
      defer: unknown
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
        configOf(config),
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
        deferredOf(defer)
      );
    }
  );

  /*
    Weighing touches nothing, so it passes no usage guard: the right to install
    is opposed once, to the install itself, and a reader without one still gets
    told what their form gets wrong.
  */
  ipcMain.handle(
    "install:check",
    async (
      _event,
      serverId: unknown,
      modules: unknown,
      config: unknown,
      defer: unknown
    ): Promise<AgentResponse<InstallCheckResult>> => {
      const call = checked(serverId, modules);

      if ("ok" in call) {
        return call;
      }

      return await runCheck(
        call.serverId,
        call.modules,
        configOf(config),
        {
          client: agentClient,
          declared: declaredModules,
          weighed: weighedValues,
        },
        deferredOf(defer)
      );
    }
  );

  ipcMain.handle(
    "install:agent-send",
    (event, token: unknown, serverId: unknown) =>
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

  ipcMain.handle(
    "install:report",
    async (
      _event,
      serverId: unknown
    ): Promise<AgentResponse<InstallReport>> => {
      if (typeof serverId !== "string" || !byId(serverId)) {
        return refuse("refusal.server.unknown");
      }

      return await agentClient.request(serverId, "report");
    }
  );
}
