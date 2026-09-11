import type { AgentResponse } from "@shared/agent";
import type { GithubRepo } from "@shared/github";
import { connectionToken } from "./connections";
import { type GithubApi, githubApi } from "./github-api";
import { refuseWith } from "./refusal";

/**
 * The repositories of the connected account, on their way to the new-project
 * screen.
 *
 * They are held here for a few minutes because the form is opened several times
 * in a row — one project, then the next — and a hundred repositories are the
 * same hundred a minute later. What is held is bound to the token that read it,
 * so an account replaced in the settings is a list read again; the reader can
 * also ask for a fresh one at any time.
 */

const KEPT_MS = 5 * 60_000;

let held: { at: number; token: string; repos: GithubRepo[] } | null = null;

function stillHeld(token: string, now: number): boolean {
  return held !== null && held.token === token && now - held.at < KEPT_MS;
}

export async function githubRepos(
  refresh: boolean,
  api: (token: string) => GithubApi = githubApi
): Promise<AgentResponse<GithubRepo[]>> {
  const token = connectionToken("github");

  if (!token) {
    held = null;

    return refuseWith("bad_request", "refusal.connection.absent", {
      kind: "github",
    });
  }

  const now = Date.now();

  if (!refresh && held && stillHeld(token, now)) {
    return { ok: true, result: held.repos };
  }

  try {
    const repos = await api(token).repos();
    held = { at: now, repos, token };

    return { ok: true, result: repos };
  } catch (failure) {
    return refuseWith("bad_request", "refusal.connection.call", {
      kind: "github",
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }
}
