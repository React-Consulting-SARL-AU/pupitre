import type { AgentResponse } from "@shared/agent";
import type { GithubRepo } from "@shared/github";
import { type GithubApi, githubApi } from "./github-api";
import { refuseWith } from "./refusal";

const KEPT_MS = 5 * 60_000;

/** Bound to the token that read it, so an account replaced in the settings reads the list again. */
let held: { at: number; token: string; repos: GithubRepo[] } | null = null;

function stillHeld(token: string, now: number): boolean {
  return held !== null && held.token === token && now - held.at < KEPT_MS;
}

export async function githubRepos(
  token: string | null,
  refresh: boolean,
  api: (token: string) => GithubApi = githubApi
): Promise<AgentResponse<GithubRepo[]>> {
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
