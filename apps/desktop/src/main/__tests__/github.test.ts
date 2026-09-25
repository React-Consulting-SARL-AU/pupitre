import { describe, expect, it } from "bun:test";
import { checkedCall, isRefusal } from "../agent-bridge";
import { GithubError, githubApi } from "../github-api";

function answering(
  pages: unknown[][],
  status = 200
): { fetcher: typeof fetch; seen: { url: string; token: string }[] } {
  const seen: { url: string; token: string }[] = [];

  const fetcher = ((url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;

    seen.push({ token: headers.authorization ?? "", url: String(url) });

    return Promise.resolve({
      json: () => Promise.resolve(pages[seen.length - 1] ?? []),
      ok: status < 400,
      status,
    } as Response);
  }) as unknown as typeof fetch;

  return { fetcher, seen };
}

function repoRow(name: string, extra: Record<string, unknown> = {}) {
  return {
    clone_url: `https://github.com/acme/${name}.git`,
    default_branch: "main",
    full_name: `acme/${name}`,
    name,
    owner: { login: "acme" },
    private: false,
    pushed_at: "2026-09-01T10:00:00Z",
    ...extra,
  };
}

describe("les dépôts du compte GitHub", () => {
  it("rend ce que l'écran affiche, le jeton restant dans l'en-tête", async () => {
    const { fetcher, seen } = answering([
      [repoRow("atlas-web", { private: true })],
    ]);

    const repos = await githubApi("ghp_de_test", fetcher).repos();

    expect(repos).toEqual([
      {
        cloneUrl: "https://github.com/acme/atlas-web.git",
        defaultBranch: "main",
        fullName: "acme/atlas-web",
        name: "atlas-web",
        owner: "acme",
        private: true,
        pushedAt: "2026-09-01T10:00:00Z",
      },
    ]);
    expect(seen[0]?.token).toBe("Bearer ghp_de_test");
    expect(seen[0]?.url).toContain(
      "affiliation=owner,collaborator,organization_member"
    );
    expect(seen[0]?.url).toContain("sort=pushed");
  });

  it("demande la page suivante tant que la page est pleine", async () => {
    const full = Array.from({ length: 100 }, (_, rank) =>
      repoRow(`repo-${String(rank)}`)
    );
    const { fetcher, seen } = answering([full, [repoRow("last")]]);

    const repos = await githubApi("ghp_de_test", fetcher).repos();

    expect(repos).toHaveLength(101);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.url).toContain("page=2");
  });

  it("laisse tomber une ligne qui ne nomme aucun dépôt clonable", async () => {
    const { fetcher } = answering([[repoRow("kept"), { full_name: "acme/x" }]]);

    const repos = await githubApi("ghp_de_test", fetcher).repos();

    expect(repos.map((repo) => repo.fullName)).toEqual(["acme/kept"]);
  });

  it("rend le refus de GitHub avec ses mots, jamais le jeton", async () => {
    const fetcher = ((_url: string) =>
      Promise.resolve({
        json: () => Promise.resolve({ message: "Bad credentials" }),
        ok: false,
        status: 401,
      } as Response)) as unknown as typeof fetch;

    const failing = githubApi("ghp_de_test", fetcher).repos();

    await expect(failing).rejects.toThrow(GithubError);
    await expect(failing).rejects.toThrow("Bad credentials");
  });
});

describe("un chemin que le renderer aurait inventé", () => {
  const knows = {
    declaresService: () => true,
    knows: (serverId: string) => serverId === "srv-1",
  };

  function refused(cmd: string, params: unknown): string | null {
    const call = checkedCall("srv-1", cmd, params, knows);

    return isRefusal(call) && !call.ok ? (call.error.phrase?.id ?? "") : null;
  }

  it("passe un chemin relatif du navigateur de dossiers", () => {
    expect(
      checkedCall("srv-1", "fs.list", { path: "projects" }, knows)
    ).toEqual({
      cmd: "fs.list",
      params: { path: "projects" },
      serverId: "srv-1",
    });
    expect(refused("fs.mkdir", { path: "projects/flyleaf" })).toBeNull();
  });

  it("refuse ce que le contrat de la commande ne lit pas", () => {
    expect(refused("fs.mkdir", { path: "" })).toBe("refusal.params.invalid");
    expect(refused("fs.list", { path: 42 })).toBe("refusal.params.invalid");
    expect(refused("fs.list", { path: "projects", depth: 2 })).toBe(
      "refusal.params.invalid"
    );
  });
});
