import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { GithubRepo } from "@shared/github";

let token: string | null = null;

mock.module("../connections", () => ({
  connectionToken: () => token,
}));

const { githubRepos } = await import("../github");

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

beforeEach(() => {
  rank += 1;
  token = `ghp_de_test_${String(rank)}`;
});

describe("les dépôts que le processus principal tient", () => {
  it("rend la liste, et la relit sans rappeler GitHub", async () => {
    const calls: number[] = [];

    const first = await githubRepos(false, api(calls));
    const second = await githubRepos(false, api(calls));

    expect(first).toEqual({ ok: true, result: [ATLAS] });
    expect(second).toEqual({ ok: true, result: [ATLAS] });
    expect(calls).toHaveLength(1);
  });

  it("rappelle GitHub quand le lecteur le demande", async () => {
    const calls: number[] = [];

    await githubRepos(false, api(calls));
    await githubRepos(true, api(calls));

    expect(calls).toHaveLength(2);
  });

  it("oublie la liste avec le compte, et nomme l'absence", async () => {
    const calls: number[] = [];

    await githubRepos(false, api(calls));

    token = null;

    const absent = await githubRepos(false, api(calls));

    expect(absent.ok).toBe(false);

    if (!absent.ok) {
      expect(absent.error.phrase?.id).toBe("refusal.connection.absent");
    }

    token = `ghp_de_test_${String(rank)}`;

    await githubRepos(false, api(calls));

    expect(calls).toHaveLength(2);
  });

  it("rend le refus de l'API avec la raison que GitHub a donnée", async () => {
    const failing = () => ({
      repos: () => Promise.reject(new Error("Bad credentials")),
    });

    const answer = await githubRepos(true, failing);

    expect(answer.ok).toBe(false);

    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.connection.call");
      expect(answer.error.phrase?.values?.reason).toBe("Bad credentials");
    }
  });
});
