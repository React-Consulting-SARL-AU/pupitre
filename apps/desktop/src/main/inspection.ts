import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { app, ipcMain } from "electron";
import { agentClient } from "./agent";
import { runShellProbe } from "./probe-shell";
import { byId, paths } from "./servers";
import { sshArgs } from "./ssh-config";

/**
 * The inspection, whichever machine answers.
 *
 * A server that already runs the agent answers the protocol's `probe`; a bare
 * one runs the same script the agent carries, sent on standard input. The two
 * produce the same report, so the screen above never has to know which of them
 * spoke.
 */

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
      error: {
        code: "bad_request",
        message: "Ce serveur n'est plus dans la liste.",
        fix: "Choisis un serveur dans les réglages.",
      },
    };
  }

  if (agentClient.session(server.id)) {
    return await agentClient.request(server.id, "probe");
  }

  return await runShellProbe({
    args: sshArgs(server, paths()),
    script: readFileSync(probeScriptPath(), "utf8"),
  });
}

export function registerInspection(): void {
  ipcMain.handle("inspection:probe", (_event, serverId: unknown) =>
    inspect(serverId)
  );
}
