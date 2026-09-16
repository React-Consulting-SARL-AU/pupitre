import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { app, ipcMain } from "electron";
import { account } from "./account";
import { checkedCall, isRefusal } from "./agent-bridge";
import {
  createAgentClient,
  type SshTarget,
  serveAs,
  sshSpawn,
} from "./agent-client";
import { appVersion } from "./app-version";
import { broadcast } from "./broadcast";
import { noteProjects } from "./projects-run";
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

  if (!server) {
    return null;
  }

  return { args: sshArgs(server, paths()), serveCommand: serveAs(server.user) };
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
  appVersion: appVersion(),
  locale: () => language,
  gate: () => usageError(() => account.guard()),
  spawn: sshSpawn(target),
  validateResults: !app.isPackaged,
});

function knows(serverId: string): boolean {
  return read().servers.some((server) => server.id === serverId);
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
    (
      _event,
      serverId: unknown,
      cmd: unknown,
      params: unknown,
      polled: unknown
    ) => {
      const call = checkedCall(serverId, cmd, params, knows);

      if (isRefusal(call)) {
        return Promise.resolve(call);
      }

      return agentClient
        .request(call.serverId, call.cmd, call.params as never, {
          polled: polled === true,
        })
        .then((answer) => {
          noteProjects(call.serverId, call.cmd, answer);

          return answer;
        });
    }
  );

  /**
   * The answer of an invoke can overtake the events sent just before it — they
   * travel on another pipe — so the last thing on the event channel says the
   * stream is over, and the renderer waits for it before trusting the answer.
   */
  ipcMain.handle(
    "agent:stream",
    async (
      event,
      token: unknown,
      serverId: unknown,
      cmd: unknown,
      params: unknown
    ) => {
      const call = checkedCall(serverId, cmd, params, knows);

      if (isRefusal(call)) {
        return call;
      }

      const onEvent = relayTo<Event>(
        event.sender,
        token,
        "agent:event",
        "event"
      );

      const answer = await agentClient.request(
        call.serverId,
        call.cmd,
        call.params as never,
        { onEvent }
      );

      relayTo<boolean>(event.sender, token, "agent:event", "end")(true);

      return answer;
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
