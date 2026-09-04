import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import { agentClient } from "./agent";
import { byId } from "./servers";

/**
 * The one source of terminal completion: the agent.
 *
 * `completions` answers the grammar of its commands, the projects of its
 * registry, the root of the projects and the entries of one folder under it, in
 * a single call. The app builds no list of its own and reads no file of the
 * machine: what it has not been given, it does not offer.
 */

const PATH_OK = /^[\w.\-/+@ ]{0,240}$/;

const LEADING_SLASHES = /^\/+/;

/** A folder under the projects root, or the root itself. */
export function askedPath(path: unknown): string {
  if (typeof path !== "string" || path.length === 0) {
    return "";
  }

  const clean = path.replace(LEADING_SLASHES, "");
  const escapes = clean.split("/").includes("..");

  return PATH_OK.test(clean) && !escapes ? clean : "";
}

export function completions(
  serverId: unknown,
  path: unknown
): Promise<AgentResponse<CompletionsResult>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return Promise.resolve({
      error: {
        code: "bad_request",
        fix: "Choisis un serveur dans les réglages.",
        message: "Ce serveur n'est plus dans la liste.",
      },
      ok: false,
    });
  }

  return agentClient.request(serverId, "completions", {
    path: askedPath(path),
  });
}
