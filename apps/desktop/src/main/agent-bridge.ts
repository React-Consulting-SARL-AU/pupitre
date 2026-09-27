import {
  COMMANDS,
  type CommandName,
  isCommandName,
} from "@pupitre/shared/agent-protocol";
import type { AgentResponse } from "@shared/agent";
import { carriesCredential } from "@shared/services";
import { refuseWith } from "./refusal";

/** Allow-list: a new protocol command stays refused here until a screen needs it. */
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
  "access.list",
  "access.update",
  "backup.status",
  "backup.contents",
  "backup.run",
  "backup.delete",
]);

export interface BridgeCall {
  serverId: string;
  cmd: CommandName;
  params: unknown;
}

export interface BridgeDeps {
  knows: (serverId: string) => boolean;
  declaresService: (serverId: string, id: string) => boolean;
}

const SERVICE_COMMANDS: ReadonlySet<CommandName> = new Set<CommandName>([
  "service.start",
  "service.stop",
  "service.restart",
]);

export function isRefusal(
  value: BridgeCall | AgentResponse<never>
): value is AgentResponse<never> {
  return "ok" in value;
}

export function checkedCall(
  serverId: unknown,
  cmd: unknown,
  params: unknown,
  deps: BridgeDeps
): BridgeCall | AgentResponse<never> {
  const known =
    typeof serverId === "string" && deps.knows(serverId) ? serverId : null;

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

  // Credential results stay in the main process, read through the Services channels.
  if (carriesCredential(cmd)) {
    return refuseWith("bad_request", "refusal.bridge.credential", { cmd });
  }

  // Secrets never cross the bridge: the main process sends them itself on the secret line.
  if ((parsed.data as { secrets_stdin?: unknown }).secrets_stdin === true) {
    return refuseWith("bad_request", "refusal.bridge.secret", { cmd });
  }

  const service = (parsed.data as { id?: unknown }).id;

  if (
    SERVICE_COMMANDS.has(cmd) &&
    !(typeof service === "string" && deps.declaresService(known, service))
  ) {
    return refuseWith("service_not_found", "refusal.service.unknown", {
      service: String(service),
    });
  }

  return { serverId: known, cmd, params: parsed.data };
}
