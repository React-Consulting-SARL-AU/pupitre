import {
  COMMANDS,
  type CommandName,
  isCommandName,
} from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentResponse } from "@shared/agent";
import { carriesCredential } from "@shared/services";
import { app, ipcMain } from "electron";
import { account } from "./account";
import { createAgentClient, type SshTarget, sshSpawn } from "./agent-client";
import { broadcast } from "./broadcast";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { paths, read } from "./servers";
import { sshArgs } from "./ssh-config";
import { usageError } from "./usage-guard";

/**
 * The client bound to this machine's servers.
 *
 * `agent-client.ts` knows nothing of Electron so it can be replayed against the
 * fake agent; the SSH target it needs is resolved here, where the configuration
 * lives, and so is the account whose usage right stands in front of it.
 */
function target(serverId: string): SshTarget | null {
  const server = read().servers.find((s) => s.id === serverId);

  return server ? { args: sshArgs(server, paths()) } : null;
}

/**
 * Every channel of the app goes through this client, so the usage right is
 * asked once, here, rather than on each of them.
 *
 * It is not the right the agent answers with: the account may be valid and the
 * server suspended, or the other way round, and each refuses in its own words.
 */
let language = "en";

/** What the renderer chose: the agent gets it on the next `hello`. */
export function rememberLanguage(locale: string): void {
  language = locale;
}

export function currentLanguage(): string {
  return language;
}

export const agentClient = createAgentClient({
  onChannel: (serverId, state) =>
    broadcast("agent:channel", { serverId, state }),
  appVersion: app.getVersion(),
  locale: () => language,
  gate: () => usageError(() => account.guard()),
  spawn: sshSpawn(target),
});

function refuse(
  code: "bad_request" | "unknown_command",
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith(code, id, values);
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
    return refuse("bad_request", "refusal.server.unknown");
  }

  if (typeof cmd !== "string" || !isCommandName(cmd)) {
    return refuse("unknown_command", "refusal.command.unknown", {
      cmd: String(cmd),
    });
  }

  const parsed = COMMANDS[cmd].params.safeParse(params ?? {});

  if (!parsed.success) {
    return refuse("bad_request", "refusal.params.invalid", { cmd });
  }

  // A credential is not something a store may hold: those results are read by
  // the Services channels, which keep the values on this side.
  if (carriesCredential(cmd)) {
    return refuse("bad_request", "refusal.bridge.credential", { cmd });
  }

  // A secret never crosses the bridge: the flows that carry one send it from the
  // main process, on the line that follows the request.
  if ((parsed.data as { secrets_stdin?: unknown }).secrets_stdin === true) {
    return refuse("bad_request", "refusal.bridge.secret", { cmd });
  }

  return { serverId: known, cmd, params: parsed.data };
}

function isRefusal(
  value: ReturnType<typeof checked>
): value is AgentResponse<never> {
  return "ok" in value;
}

export function registerLanguage(): void {
  ipcMain.on("locale:set", (_event, locale: unknown) => {
    if (locale === "fr" || locale === "en") {
      rememberLanguage(locale);
    }
  });
}

/**
 * The platform, told now rather than at the daemon's next turn.
 *
 * It reads and reports; it changes nothing on the machine, which is why it
 * passes the usage guard even on a server whose right the platform stopped
 * confirming — asking again is exactly what such a server has to do.
 */
export function registerPlatformSync(): void {
  ipcMain.handle("platform:sync", (_event, serverId: unknown) => {
    if (typeof serverId !== "string") {
      return refuseWith("bad_request", "refusal.server.unknown");
    }

    return agentClient.request(serverId, "platform.sync");
  });
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

      const onEvent = relayTo<Event>(
        event.sender,
        token,
        "agent:event",
        "event"
      );

      return agentClient.request(
        call.serverId,
        call.cmd,
        call.params as never,
        { onEvent }
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
