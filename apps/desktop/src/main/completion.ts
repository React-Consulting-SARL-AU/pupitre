import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import { agentClient } from "./agent";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { refuseWith } from "./refusal";
import { byId } from "./servers";

const PATH_OK = /^[\w.\-/+@ ]{0,240}$/;

const LEADING_SLASHES = /^\/+/;

export function askedPath(path: unknown): string {
  if (typeof path !== "string" || path.length === 0) {
    return "";
  }

  const clean = path.replace(LEADING_SLASHES, "");
  const escapes = clean.split("/").includes("..");

  return PATH_OK.test(clean) && !escapes ? clean : "";
}

// The one source of completion: the app builds no list and reads no file itself.
export function completions(
  serverId: unknown,
  path: unknown
): Promise<AgentResponse<CompletionsResult>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return Promise.resolve(refuseWith("bad_request", "refusal.server.unknown"));
  }

  return agentClient.request(serverId, "completions", {
    path: askedPath(path),
  });
}

/** The folder above the projects root, as the agent names it: never a string the renderer chose. */
export async function workRoot(serverId: string): Promise<string | null> {
  const named = await completions(serverId, "");

  if (!named.ok) {
    return null;
  }

  const at = named.result.root.lastIndexOf("/");

  return at > 0 ? named.result.root.slice(0, at) : null;
}

export function registerCompletions(): void {
  handle("completions", shape(isString, isString), (_e, serverId, path) =>
    completions(serverId, path)
  );
}
