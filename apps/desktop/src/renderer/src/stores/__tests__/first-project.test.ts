import { beforeEach, describe, expect, it } from "bun:test";
import type { ProjectAddParams } from "@pupitre/shared/agent-protocol/projects";
import type { AgentError } from "@shared/agent";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useFirstProject } from "../first-project";

/**
 * The first project as the screen drives it: an address in, a running project
 * and its journal out. The agent is a stub, because what is under test is what
 * the store does with an envelope, not what a server does with a repository.
 */

const REPO = "https://github.com/moi/vite-starter.git";

const SHOP = "https://github.com/moi/shop.git";

function project(params: ProjectAddParams) {
  return {
    ...params,
    install: "bun install",
    path: `/home/dev/projects/${params.dir}`,
    state: "stopped" as const,
  };
}

function phase(id: string): string {
  return (
    useFirstProject.getState().phases.find((entry) => entry.id === id)
      ?.status ?? "absent"
  );
}

beforeEach(() => {
  useFirstProject.getState().reset();
});

describe("un dépôt qui démarre", () => {
  it("va de l'adresse à online, avec son journal et son URL", async () => {
    const asked: ProjectAddParams[] = [];

    stubPupitre({
      addProject: (_serverId, params) => {
        asked.push(params);

        return Promise.resolve({ ok: true, result: project(params) });
      },
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectAddress: () =>
        Promise.resolve({
          ok: true,
          result: { url: "http://127.0.0.1:3000" },
        }),
      projectJournal: (_serverId, _name, _lines, _follow, onLine) => {
        onLine("VITE v7.3.5  ready in 312 ms");

        return Promise.resolve({ ok: true, result: { lines: [] } });
      },
      startProject: () =>
        Promise.resolve({ ok: true, result: { port: 3000, state: "online" } }),
      syncProject: () =>
        Promise.resolve({
          ok: true,
          result: { installed: true, pulled: true, state: "stopped" },
        }),
    });

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(REPO);
    await useFirstProject.getState().launch("srv-1");

    expect(asked[0]).toEqual({
      cmd: "bun run dev --port 3000",
      dir: "vite-starter",
      host: "127.0.0.1",
      name: "vite-starter",
      pkgmgr: "bun",
      port: 3000,
      repo: REPO,
    });
    expect(useFirstProject.getState().run).toMatchObject({
      name: "vite-starter",
      state: "online",
      status: "done",
      url: "http://127.0.0.1:3000",
    });
    expect(useFirstProject.getState().logs).toContain(
      "VITE v7.3.5  ready in 312 ms"
    );
  });

  it("ne réinstalle pas ce que la récupération des sources a déjà installé", async () => {
    stubPupitre({
      addProject: (_serverId, params) =>
        Promise.resolve({ ok: true, result: project(params) }),
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectAddress: () =>
        Promise.resolve({ ok: true, result: { url: "http://127.0.0.1:3000" } }),
      projectJournal: () =>
        Promise.resolve({ ok: true, result: { lines: [] } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { port: 3000, state: "online" } }),
      syncProject: () =>
        Promise.resolve({
          ok: true,
          result: { installed: true, pulled: true, state: "stopped" },
        }),
    });

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(REPO);
    await useFirstProject.getState().launch("srv-1");

    expect(phase("sources")).toBe("ok");
    expect(phase("install")).toBe("skip");
  });

  it("propose un sous-domaine quand le tunnel est là, et rien sinon", async () => {
    stubPupitre({
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
    });

    await useFirstProject.getState().prepare("srv-1", true);
    useFirstProject.getState().setSource(REPO);

    expect(useFirstProject.getState().draft.subdomain).toBe("vite-starter");
    expect(useFirstProject.getState().params()).toMatchObject({
      subdomain: "vite-starter",
    });

    useFirstProject.getState().reset();
    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(REPO);

    expect(useFirstProject.getState().draft.subdomain).toBe("");
    expect(useFirstProject.getState().params()).not.toHaveProperty("subdomain");
  });
});

describe("un port déjà pris", () => {
  const taken: AgentError = {
    code: "bad_request",
    fix: "Donne un autre port à shop, par exemple 3001.",
    message: "le port 3000 est déjà pris par web",
  };

  function stub(): { asked: ProjectAddParams[] } {
    const asked: ProjectAddParams[] = [];

    stubPupitre({
      addProject: (_serverId, params) => {
        asked.push(params);

        return Promise.resolve(
          asked.length === 1
            ? { ok: false, error: taken }
            : { ok: true, result: project(params) }
        );
      },
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectAddress: () =>
        Promise.resolve({ ok: true, result: { url: "http://127.0.0.1:3001" } }),
      projectJournal: () =>
        Promise.resolve({ ok: true, result: { lines: [] } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { port: 3001, state: "online" } }),
      syncProject: () =>
        Promise.resolve({
          ok: true,
          result: { installed: true, pulled: true, state: "stopped" },
        }),
    });

    return { asked };
  }

  it("garde le refus tel quel et propose le port que son remède donne", async () => {
    stub();

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(SHOP);
    await useFirstProject.getState().launch("srv-1");

    expect(useFirstProject.getState().run).toMatchObject({
      error: taken,
      phase: "add",
      status: "failed",
    });
    expect(useFirstProject.getState().draft.port).toBe(3001);
    expect(useFirstProject.getState().draft.cmd).toBe(
      "bun run dev --port 3001"
    );
  });

  it("aboutit au second essai, sur le port du remède", async () => {
    const { asked } = stub();

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(SHOP);
    await useFirstProject.getState().launch("srv-1");
    await useFirstProject.getState().retry("srv-1");

    expect(asked.map((params) => params.port)).toEqual([3000, 3001]);
    expect(useFirstProject.getState().run).toMatchObject({
      state: "online",
      status: "done",
    });
  });
});

describe("un projet qui ne démarre pas", () => {
  const dead: AgentError = {
    code: "internal",
    fix: "Ouvre le journal du projet, ou corrige la colonne install du registre.",
    message: "shop : bun run dev --port 3000 s'est arrêté aussitôt",
  };

  function stub(starts: () => boolean): { adds: number } {
    const counters = { adds: 0 };

    stubPupitre({
      addProject: (_serverId, params) => {
        counters.adds += 1;

        return Promise.resolve({ ok: true, result: project(params) });
      },
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectAddress: () =>
        Promise.resolve({ ok: true, result: { url: "http://127.0.0.1:3000" } }),
      projectJournal: () =>
        Promise.resolve({
          ok: true,
          result: { lines: ["error: Cannot find module 'vite'"] },
        }),
      startProject: () =>
        Promise.resolve(
          starts()
            ? { ok: true, result: { port: 3000, state: "online" } }
            : { ok: false, error: dead }
        ),
      syncProject: () =>
        Promise.resolve({
          ok: true,
          result: { installed: true, pulled: true, state: "stopped" },
        }),
    });

    return counters;
  }

  it("laisse le journal visible et rend l'erreur de l'agent telle quelle", async () => {
    stub(() => false);

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(SHOP);
    await useFirstProject.getState().launch("srv-1");

    expect(useFirstProject.getState().run).toMatchObject({
      error: dead,
      phase: "up",
      status: "failed",
    });
    expect(useFirstProject.getState().logs).toEqual([
      "error: Cannot find module 'vite'",
    ]);
    expect(phase("up")).toBe("fail");
  });

  it("reprend au démarrage sans redéclarer le projet", async () => {
    let up = false;
    const counters = stub(() => up);

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(SHOP);
    await useFirstProject.getState().launch("srv-1");

    up = true;
    await useFirstProject.getState().retry("srv-1");

    expect(counters.adds).toBe(1);
    expect(useFirstProject.getState().run).toMatchObject({
      state: "online",
      status: "done",
    });
    expect(phase("add")).toBe("ok");
  });

  it("tient pour un échec un projet que l'agent ne donne pas en marche", async () => {
    stubPupitre({
      addProject: (_serverId, params) =>
        Promise.resolve({ ok: true, result: project(params) }),
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectJournal: () =>
        Promise.resolve({ ok: true, result: { lines: ["exit status 1"] } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { state: "failed" } }),
      syncProject: () =>
        Promise.resolve({
          ok: true,
          result: { installed: true, pulled: true, state: "stopped" },
        }),
    });

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource(SHOP);
    await useFirstProject.getState().launch("srv-1");

    expect(useFirstProject.getState().run).toMatchObject({
      phase: "up",
      status: "failed",
    });
    expect(useFirstProject.getState().logs).toEqual(["exit status 1"]);
  });
});

describe("un dossier déjà présent sur le serveur", () => {
  it("reprend le gestionnaire et la commande que l'agent déclare", async () => {
    stubPupitre({
      listProjects: () =>
        Promise.resolve({
          ok: true,
          result: {
            projects: [
              {
                cmd: "uv run dev --port 3400",
                dir: "apps/api",
                host: "127.0.0.1",
                name: "api",
                path: "/home/dev/projects/apps/api",
                pkgmgr: "uv",
                port: 3400,
                state: "stopped",
              },
            ],
          },
        }),
    });

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource("apps/api");

    expect(useFirstProject.getState().detected).toBe(true);
    expect(useFirstProject.getState().draft).toMatchObject({
      cmd: "uv run dev --port 3400",
      dir: "apps/api",
      pkgmgr: "uv",
      port: 3400,
    });
    expect(useFirstProject.getState().params()).not.toHaveProperty("repo");
  });

  it("ne récupère aucune source pour un dossier qui est déjà là", async () => {
    stubPupitre({
      addProject: (_serverId, params) =>
        Promise.resolve({ ok: true, result: project(params) }),
      installProject: () =>
        Promise.resolve({ ok: true, result: { done: true } }),
      listProjects: () =>
        Promise.resolve({ ok: true, result: { projects: [] } }),
      projectAddress: () =>
        Promise.resolve({ ok: true, result: { url: "http://127.0.0.1:3000" } }),
      projectJournal: () =>
        Promise.resolve({ ok: true, result: { lines: [] } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { port: 3000, state: "online" } }),
    });

    await useFirstProject.getState().prepare("srv-1", false);
    useFirstProject.getState().setSource("apps/web");
    await useFirstProject.getState().launch("srv-1");

    expect(phase("sources")).toBe("skip");
    expect(phase("install")).toBe("ok");
    expect(useFirstProject.getState().run).toMatchObject({ status: "done" });
  });
});
