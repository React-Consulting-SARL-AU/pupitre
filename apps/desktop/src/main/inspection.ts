import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { judgedForApp } from "@shared/agent-update";
import { app } from "electron";
import { agentClient } from "./agent";
import { appVersion } from "./app-version";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { runShellProbe } from "./probe-shell";
import { refusalOf } from "./refusal";
import { byId, paths } from "./servers";
import { sshArgs } from "./ssh-config";

// A server with the agent answers `probe`; a bare one runs the same script over SSH: both give the same report.

const PROBE_SCRIPT = "probe.sh";

function probeScriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, PROBE_SCRIPT)
    : join(app.getAppPath(), "resources", PROBE_SCRIPT);
}

export async function inspect(
  serverId: unknown
): Promise<AgentResponse<ProbeResult>> {
  const server = typeof serverId === "string" ? byId(serverId) : null;

  if (!server) {
    return {
      ok: false,
      error: refusalOf("bad_request", "refusal.server.unknown"),
    };
  }

  if (agentClient.session(server.id)) {
    return await agentClient.request(server.id, "probe");
  }

  const probed = await runShellProbe({
    args: sshArgs(server, paths()),
    script: readFileSync(probeScriptPath(), "utf8"),
  });

  return probed.ok
    ? { ok: true, result: judgedForApp(probed.result, appVersion()) }
    : probed;
}

export function registerInspection(): void {
  handle("inspection:probe", shape(isString), (_event, serverId) =>
    inspect(serverId)
  );
}
