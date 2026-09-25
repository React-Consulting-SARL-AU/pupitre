import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { app } from "electron";
import { account } from "./account";
import { checkedCall, isRefusal } from "./agent-bridge";
import {
  type ChannelPurpose,
  createAgentClient,
  privilegedServeAs,
  type SshTarget,
  serveAs,
  sshSpawn,
} from "./agent-client";
import { appVersion } from "./app-version";
import { broadcast } from "./broadcast";
import { handle, listen } from "./ipc";
import { anything, isBoolean, isString, optional, shape } from "./ipc-guard";
import { noteProjects } from "./projects-run";
import { relayTo } from "./relay";
import { paths, read } from "./servers";
import { declaresService, noteServices } from "./services-run";
import { sshArgs } from "./ssh-config";
import { sudoPasswordFor } from "./sudo-held";
import { usageError } from "./usage-guard";

type Language = "fr" | "en";

/** Resolved here rather than in `agent-client.ts`, which knows nothing of Electron so it replays against the fake agent. */
function target(serverId: string, purpose: ChannelPurpose): SshTarget | null {
  const server = read().servers.find((s) => s.id === serverId);

  if (!server) {
    return null;
  }

  const args = sshArgs(server, paths());

  if (purpose !== "privileged") {
    return { args, serveCommand: serveAs(server.user) };
  }

  const serveCommand = privilegedServeAs(server.user);

  return server.user === "root"
    ? { args, serveCommand }
    : { args, preamble: sudoPasswordFor(serverId) ?? "", serveCommand };
}

let language = "en";

/** The agent gets it on the next `hello`. */
export function rememberLanguage(locale: string): void {
  language = locale;
}

export function currentLanguage(): string {
  return language;
}

function isLanguage(value: unknown): value is Language {
  return value === "fr" || value === "en";
}

/** Results that end up in a pty's command line or a local path: weighed in every build. */
const ARGV_RESULTS: ReadonlySet<CommandName> = new Set<CommandName>([
  "agent.open",
  "completions",
  "db.shell",
  "fs.stat",
  "project.list",
]);

export const agentClient = createAgentClient({
  onChannel: (serverId, state) =>
    broadcast("agent:channel", { serverId, state }),
  appVersion: appVersion(),
  enforcedResults: ARGV_RESULTS,
  locale: () => language,
  // The account's usage right, asked once for every channel; the server's own right is the agent's to refuse.
  gate: () => usageError(() => account.guard()),
  spawn: sshSpawn(target),
  sudoHeld: (serverId) => sudoPasswordFor(serverId) !== null,
  validateResults: !app.isPackaged,
});

const bridge = {
  declaresService,
  knows: (serverId: string): boolean =>
    read().servers.some((server) => server.id === serverId),
};

export function registerLanguage(changed: (locale: string) => void): void {
  let said: string | null = null;

  listen("locale:set", shape(isLanguage), (_event, locale) => {
    if (locale !== said) {
      said = locale;
      rememberLanguage(locale);
      changed(locale);
    }
  });
}

/** Read-only, so it passes the usage guard: asking again is exactly what a server the platform stopped confirming must do. */
export function registerPlatformSync(): void {
  handle("platform:sync", shape(isString), (_event, serverId) =>
    agentClient.request(serverId, "platform.sync")
  );
}

export function registerAgentChannels(): void {
  handle(
    "agent:call",
    shape(isString, isString, anything, optional(isBoolean)),
    (_event, serverId, cmd, params, polled) => {
      const call = checkedCall(serverId, cmd, params, bridge);

      if (isRefusal(call)) {
        return Promise.resolve(call);
      }

      return agentClient
        .request(call.serverId, call.cmd, call.params as never, {
          polled: polled === true,
        })
        .then((answer) => {
          noteProjects(call.serverId, call.cmd, answer);
          noteServices(call.serverId, call.cmd, answer);

          return answer;
        });
    }
  );

  // An invoke's answer can overtake the events sent just before it, so `end` on the event channel closes the stream.
  handle(
    "agent:stream",
    shape(isString, isString, isString, anything),
    async (event, token, serverId, cmd, params) => {
      const call = checkedCall(serverId, cmd, params, bridge);

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

  handle("agent:session", shape(isString), (_event, serverId) =>
    agentClient.session(serverId)
  );

  handle("agent:close", shape(isString), (_event, serverId) => {
    agentClient.close(serverId);
  });
}
