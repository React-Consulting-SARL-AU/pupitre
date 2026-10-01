import { beforeEach, describe, expect, it } from "bun:test";
import type { GithubRepo } from "@shared/github";
import { githubRepos } from "../github";

const ATLAS: GithubRepo = {
  cloneUrl: "https://github.com/acme/atlas-web.git",
  defaultBranch: "main",
  fullName: "acme/atlas-web",
  name: "atlas-web",
  owner: "acme",
  private: false,
  pushedAt: "2026-09-01T10:00:00Z",
};

function api(calls: number[], repos: readonly GithubRepo[] = [ATLAS]) {
  return () => ({
    repos: () => {
      calls.push(1);

      return Promise.resolve([...repos]);
    },
  });
}

// The list is cached per token: a fresh token per test keeps one test's cache out of the next.
let rank = 0;
let token: string | null = null;

beforeEach(() => {
  rank += 1;
  token = `ghp_de_test_${String(rank)}`;
});

describe("the repositories the main process holds", () => {
  it("returns the list, and rereads it without calling GitHub again", async () => {
    const calls: number[] = [];

    const first = await githubRepos(token, false, api(calls));
    const second = await githubRepos(token, false, api(calls));

    expect(first).toEqual({ ok: true, result: [ATLAS] });
    expect(second).toEqual({ ok: true, result: [ATLAS] });
    expect(calls).toHaveLength(1);
  });

  it("calls GitHub again when the reader asks", async () => {
    const calls: number[] = [];

    await githubRepos(token, false, api(calls));
    await githubRepos(token, true, api(calls));

    expect(calls).toHaveLength(2);
  });

  it("forgets the list along with the account, and names the absence", async () => {
    const calls: number[] = [];

    await githubRepos(token, false, api(calls));

    const absent = await githubRepos(null, false, api(calls));

    expect(absent.ok).toBe(false);

    if (!absent.ok) {
      expect(absent.error.phrase?.id).toBe("refusal.connection.absent");
    }

    await githubRepos(token, false, api(calls));

    expect(calls).toHaveLength(2);
  });

  it("returns the API's refusal with the reason GitHub gave", async () => {
    const failing = () => ({
      repos: () => Promise.reject(new Error("Bad credentials")),
    });

    const answer = await githubRepos(token, true, failing);

    expect(answer.ok).toBe(false);

    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.connection.call");
      expect(answer.error.phrase?.values?.reason).toBe("Bad credentials");
    }
  });
});
