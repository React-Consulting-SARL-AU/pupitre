import {
  COMMANDS,
  type CommandName,
  isCommandName,
} from "@pupitre/shared/agent-protocol";
import type { AgentResponse } from "@shared/agent";
import { carriesCredential } from "@shared/services";
import { refuseWith } from "./refusal";

/**
 * The commands the renderer may name on `agent:call` and `agent:stream`.
 *
 * It is the exact set the screens issue today. Everything else either has a
 * channel of its own, where the main process adds what the renderer must not
 * hold — the secrets of an install, the token of an enrolment, the path of a
 * project — or has no screen that asks for it. A command added to the contract
 * is refused here until a screen needs it and says so.
 */
export const BRIDGE_COMMANDS: ReadonlySet<CommandName> = new Set<CommandName>([
  "snapshot",
  "processes.list",
  "process.kill",
  "sessions.clean",
  "reboot",
  "project.detect",
  "module.config",
  "uninstall",
  "service.start",
  "service.stop",
  "service.restart",
  "service.logs",
  "db.dump",
  "db.import",
  "db.shell",
  "shots.list",
  "shots.url",
  "shots.read",
  "shots.clean",
  "fs.list",
  "fs.stat",
  "fs.read",
  "fs.write",
  "fs.mkdir",
  "fs.rename",
  "fs.remove",
  "tunnel.status",
  "tunnel.sync",
  "tunnel.restart",
]);

export interface BridgeCall {
  serverId: string;
  cmd: CommandName;
  params: unknown;
}

export function isRefusal(
  value: BridgeCall | AgentResponse<never>
): value is AgentResponse<never> {
  return "ok" in value;
}

/**
 * What the renderer is allowed to ask, checked before it becomes a request.
 *
 * The renderer names a server and a command of the protocol; this checks the
 * server against the configuration, the command against the bridge's own list,
 * and the parameters against that command's schema. Nothing free-form reaches
 * the channel.
 */
export function checkedCall(
  serverId: unknown,
  cmd: unknown,
  params: unknown,
  knows: (serverId: string) => boolean
): BridgeCall | AgentResponse<never> {
  const known =
    typeof serverId === "string" && knows(serverId) ? serverId : null;

  if (!known) {
    return refuseWith("bad_request", "refusal.server.unknown");
  }

  if (typeof cmd !== "string" || !isCommandName(cmd)) {
    return refuseWith("unknown_command", "refusal.command.unknown", {
      cmd: String(cmd),
    });
  }

  if (!BRIDGE_COMMANDS.has(cmd)) {
    return refuseWith("bad_request", "refusal.bridge.command", { cmd });
  }

  const parsed = COMMANDS[cmd].params.safeParse(params ?? {});

  if (!parsed.success) {
    return refuseWith("bad_request", "refusal.params.invalid", { cmd });
  }

  // A credential is not something a store may hold: those results are read by
  // the Services channels, which keep the values on this side.
  if (carriesCredential(cmd)) {
    return refuseWith("bad_request", "refusal.bridge.credential", { cmd });
  }

  // A secret never crosses the bridge: the flows that carry one send it from the
  // main process, on the line that follows the request.
  if ((parsed.data as { secrets_stdin?: unknown }).secrets_stdin === true) {
    return refuseWith("bad_request", "refusal.bridge.secret", { cmd });
  }

  return { serverId: known, cmd, params: parsed.data };
}
