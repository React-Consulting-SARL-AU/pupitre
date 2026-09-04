import {
  COMMANDS,
  type CommandName,
  isCommandName,
} from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentResponse } from "@shared/agent";
import { app, ipcMain } from "electron";
import { createAgentClient, type SshTarget, sshSpawn } from "./agent-client";
import { active, paths, read } from "./servers";
import { sshArgs } from "./ssh-config";

/**
 * The client bound to this machine's servers.
 *
 * `agent-client.ts` knows nothing of Electron so it can be replayed against the
 * fake agent; the SSH target it needs is resolved here, where the configuration
 * lives.
 */
function target(serverId: string): SshTarget {
  const config = read();
  const server = config.servers.find((s) => s.id === serverId) ?? active();

  return { args: server ? sshArgs(server, paths()) : [] };
}

export const agentClient = createAgentClient({
  spawn: sshSpawn(target),
  appVersion: app.getVersion(),
});

function refuse(
  code: "bad_request" | "unknown_command",
  message: string,
  fix?: string
): AgentResponse<never> {
  return { ok: false, error: fix ? { code, message, fix } : { code, message } };
}

/**
 * What the renderer is allowed to ask, checked before it becomes a request.
 *
 * The renderer names a server and a command of the protocol; the main process
 * checks the server against the configuration, the command against `COMMANDS`,
 * and the parameters against that command's own schema. Nothing free-form
 * reaches the channel.
 */
function checked(
  serverId: unknown,
  cmd: unknown,
  params: unknown
):
  | { serverId: string; cmd: CommandName; params: unknown }
  | AgentResponse<never> {
  const known =
    typeof serverId === "string" &&
    read().servers.some((s) => s.id === serverId)
      ? serverId
      : null;

  if (!known) {
    return refuse(
      "bad_request",
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  if (typeof cmd !== "string" || !isCommandName(cmd)) {
    return refuse("unknown_command", `Commande inconnue : ${String(cmd)}.`);
  }

  const parsed = COMMANDS[cmd].params.safeParse(params ?? {});

  if (!parsed.success) {
    return refuse(
      "bad_request",
      `Paramètres invalides pour ${cmd}.`,
      parsed.error.issues[0]?.message
    );
  }

  // A secret never crosses the bridge: the flows that carry one send it from the
  // main process, on the line that follows the request.
  if ((parsed.data as { secrets_stdin?: unknown }).secrets_stdin === true) {
    return refuse(
      "bad_request",
      `${cmd} porte un secret et ne passe pas par ce pont.`,
      "Utilise l'écran d'installation, qui envoie le secret depuis le processus principal."
    );
  }

  return { serverId: known, cmd, params: parsed.data };
}

function isRefusal(
  value: ReturnType<typeof checked>
): value is AgentResponse<never> {
  return "ok" in value;
}

export function registerAgentChannels(): void {
  ipcMain.handle(
    "agent:call",
    (_event, serverId: unknown, cmd: unknown, params: unknown) => {
      const call = checked(serverId, cmd, params);

      return isRefusal(call)
        ? Promise.resolve(call)
        : agentClient.request(call.serverId, call.cmd, call.params as never);
    }
  );

  ipcMain.handle(
    "agent:stream",
    (
      event,
      token: unknown,
      serverId: unknown,
      cmd: unknown,
      params: unknown
    ) => {
      const call = checked(serverId, cmd, params);

      if (isRefusal(call)) {
        return Promise.resolve(call);
      }

      const onEvent = (payload: Event) => {
        if (typeof token === "string" && !event.sender.isDestroyed()) {
          event.sender.send("agent:event", { token, event: payload });
        }
      };

      return agentClient.request(
        call.serverId,
        call.cmd,
        call.params as never,
        {
          onEvent,
        }
      );
    }
  );

  ipcMain.handle("agent:session", (_event, serverId: unknown) =>
    typeof serverId === "string" ? agentClient.session(serverId) : null
  );

  ipcMain.handle("agent:close", (_event, serverId: unknown) => {
    if (typeof serverId === "string") {
      agentClient.close(serverId);
    }
  });
}
