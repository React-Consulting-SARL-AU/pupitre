import { beforeEach, describe, expect, it } from "bun:test";
import type { ProjectAddParams } from "@pupitre/shared/agent-protocol/projects";
import { translate } from "@renderer/i18n/translate";
import type { AgentError, AgentResponse } from "@shared/agent";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import {
  type DetectionState,
  type Exposure,
  useProjectAdd,
} from "../project-add";
import { useTunnel } from "../tunnel";

/**
 * A project added as the screen drives it: an address in, a running project
 * and its journal out. The agent is a stub, because what is under test is what
 * the store does with an envelope, not what a server does with a repository.
 */

const REPO = "https://github.com/moi/vite-starter.git";

const SHOP = "https://github.com/moi/shop.git";

const TUNNEL: Exposure = { host: "192.0.2.10", provider: "cloudflare" };

const CADDY: Exposure = { host: "192.0.2.10", provider: "caddy" };

function project(params: ProjectAddParams) {
  return {
    ...params,
    install: "bun install",
    path: `/home/dev/projects/${params.dir}`,
    routes: params.routes.map(({ label, port, subdomain }) => ({
      label,
      port,
      ...(subdomain ? { hostname: `${subdomain}.example.org` } : {}),
    })),
    state: "stopped" as const,
  };
}

function mainPort(): number {
  return useProjectAdd.getState().draft.rows[0]?.port ?? Number.NaN;
}

function web(index = 0): string {
  return useProjectAdd.getState().draft.rows[index]?.web ?? "";
}

function phase(id: string): string {
  return (
    useProjectAdd.getState().phases.find((entry) => entry.id === id)?.status ??
    "absent"
  );
}

const QUIET_RUN = {
  addProject: (_serverId: string, params: ProjectAddParams) =>
    Promise.resolve({ ok: true as const, result: project(params) }),
  listProjects: () =>
    Promise.resolve({ ok: true as const, result: { projects: [] } }),
  projectAddress: () =>
    Promise.resolve({
      ok: true as const,
      result: { url: "http://127.0.0.1:3000" },
    }),
  followProjectJournal: () => ({
    cancel: () => undefined,
    done: Promise.resolve({ ok: true as const, result: { lines: [] } }),
  }),
  projectJournal: () =>
    Promise.resolve({ ok: true as const, result: { lines: [] } }),
  startProject: () =>
    Promise.resolve({
      ok: true as const,
      result: { port: 3000, state: "online" as const },
    }),
  pullProject: () =>
    Promise.resolve({
      ok: true as const,
      result: { pulled: true, state: "stopped" as const },
    }),
  installProject: () =>
    Promise.resolve({
      ok: true as const,
      result: { command: "bun install", done: true as const },
    }),
};

beforeEach(() => {
  useProjectAdd.getState().reset();
  useTunnel.getState().forget();
});

describe("un dépôt qui démarre", () => {
  it("va de l'adresse à online, avec son journal et son URL", async () => {
    const asked: ProjectAddParams[] = [];

    stubPupitre({
      ...QUIET_RUN,
      addProject: (_serverId, params) => {
        asked.push(params);

        return Promise.resolve({ ok: true, result: project(params) });
      },
      followProjectJournal: (_serverId, _name, _lines, onLine) => {
        onLine("VITE v7.3.5  ready in 312 ms");

        return {
          cancel: () => undefined,
          done: Promise.resolve({ ok: true, result: { lines: [] } }),
        };
      },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().launch("srv-1");

    expect(asked[0]).toEqual({
      cmd: "bun run dev --port 3000",
      dir: "vite-starter",
      host: "127.0.0.1",
      name: "vite-starter",
      pkgmgr: "bun",
      port: 3000,
      repo: REPO,
      routes: [{ label: "web", port: 3000 }],
    });
    expect(useProjectAdd.getState().run).toMatchObject({
      name: "vite-starter",
      state: "online",
      status: "done",
      url: "http://127.0.0.1:3000",
    });
    expect(useProjectAdd.getState().logs).toContain(
      "VITE v7.3.5  ready in 312 ms"
    );
    expect(phase("publish")).toBe("skip");
  });

  it("récupère les sources, puis installe les dépendances, en deux phases", async () => {
    const order: string[] = [];

    stubPupitre({
      ...QUIET_RUN,
      installProject: () => {
        order.push("install");

        return QUIET_RUN.installProject();
      },
      pullProject: () => {
        order.push("pull");

        return QUIET_RUN.pullProject();
      },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().launch("srv-1");

    expect(order).toEqual(["pull", "install"]);
    expect(
      useProjectAdd.getState().phases.filter((entry) => entry.id !== "logs")
    ).toEqual([
      { detail: "vite-starter · port 3000", id: "add", status: "ok" },
      { detail: REPO, id: "sources", status: "ok" },
      { detail: "bun install", id: "install", status: "ok" },
      { detail: "port 3000", id: "up", status: "ok" },
      {
        detail: translate()("projectAdd.publish.local"),
        id: "publish",
        status: "skip",
      },
    ]);
  });

  it("dit qu'un projet sans commande d'installation n'a rien eu à installer", async () => {
    stubPupitre({
      ...QUIET_RUN,
      installProject: () =>
        Promise.resolve({ ok: true as const, result: { done: true as const } }),
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().launch("srv-1");

    expect(
      useProjectAdd.getState().phases.find((entry) => entry.id === "install")
    ).toEqual({
      detail: translate()("projectAdd.install.nothing"),
      id: "install",
      status: "skip",
    });
  });

  it("propose un sous-domaine quand une exposition est là, et rien sinon", async () => {
    stubPupitre({ listProjects: QUIET_RUN.listProjects });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setSource(REPO);

    expect(web()).toBe("vite-starter");
    expect(useProjectAdd.getState().params().routes).toEqual([
      { label: "web", port: 3000, subdomain: "vite-starter" },
    ]);

    // Publishing is the reader's choice, not the tunnel's.
    useProjectAdd.getState().setRowPublish(0, false);
    expect(useProjectAdd.getState().params().routes).toEqual([
      { label: "web", port: 3000 },
    ]);

    useProjectAdd.getState().reset();
    await useProjectAdd.getState().prepare("srv-1", CADDY);
    useProjectAdd.getState().setSource(REPO);
    expect(web()).toBe("vite-starter");

    useProjectAdd.getState().reset();
    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);

    expect(web()).toBe("");
    expect(useProjectAdd.getState().params().routes).toEqual([
      { label: "web", port: 3000 },
    ]);
  });

  it("tient une ligne par port, la première étant le port principal", async () => {
    stubPupitre({ listProjects: QUIET_RUN.listProjects });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setSource(SHOP);
    useProjectAdd.getState().addRow();
    useProjectAdd.getState().addRow();

    const { rows } = useProjectAdd.getState().draft;

    expect(rows.map((row) => [row.label, row.port, row.web])).toEqual([
      ["web", 3000, "shop"],
      ["api", 3001, "api-shop"],
      ["docs", 3002, "docs-shop"],
    ]);

    useProjectAdd.getState().setRowLabel(1, "backend");
    expect(web(1)).toBe("backend-shop");

    useProjectAdd.getState().removeRow(1);
    expect(useProjectAdd.getState().params()).toMatchObject({
      port: 3000,
      routes: [
        { label: "web", port: 3000, subdomain: "shop" },
        { label: "docs", port: 3002, subdomain: "docs-shop" },
      ],
    });

    // The main port stays: a project always has one.
    useProjectAdd.getState().removeRow(0);
    expect(useProjectAdd.getState().draft.rows).toHaveLength(2);
  });

  /** The agent wrote the route; the name that reaches it is written from the account the app holds. */
  it("fait pointer le nom vers le tunnel quand le projet est publié", async () => {
    const sent: string[] = [];
    const named: string[] = [];

    stubPupitre({
      ...QUIET_RUN,
      agentCall: (_server, cmd) => {
        sent.push(cmd);

        return Promise.resolve({
          ok: true,
          result: {
            installed: true,
            provider: "cloudflare",
            routes: [
              {
                hostname: "vite-starter.example.org",
                project: "vite-starter",
                service: "http://127.0.0.1:3000",
              },
            ],
            state: "running",
          },
        } as AgentResponse<unknown>);
      },
      projectAddress: () =>
        Promise.resolve({
          ok: true,
          result: { url: "https://vite-starter.example.org" },
        }),
      syncTunnelRecords: (_server, routes) => {
        named.push(...routes.map((route) => route.hostname));

        return Promise.resolve({ ok: true, result: routes.length });
      },
    });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().launch("srv-1");

    expect(sent).toEqual(["tunnel.sync"]);
    expect(named).toEqual(["vite-starter.example.org"]);
    expect(phase("publish")).toBe("ok");
    expect(useProjectAdd.getState().run).toMatchObject({
      status: "done",
      url: "https://vite-starter.example.org",
    });
  });

  it("s'arrête sur le nom refusé, et reprend là", async () => {
    let refuse = true;

    stubPupitre({
      ...QUIET_RUN,
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: {
            installed: true,
            provider: "cloudflare",
            routes: [],
            state: "running",
          },
        } as AgentResponse<unknown>),
      syncTunnelRecords: () =>
        Promise.resolve(
          refuse
            ? {
                error: { code: "bad_request", message: "zone inconnue" },
                ok: false,
              }
            : { ok: true, result: 0 }
        ),
    });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().launch("srv-1");

    expect(useProjectAdd.getState().run).toMatchObject({
      phase: "publish",
      status: "failed",
    });
    expect(phase("up")).toBe("ok");

    refuse = false;
    await useProjectAdd.getState().retry("srv-1");

    expect(useProjectAdd.getState().run).toMatchObject({ status: "done" });
  });
});

describe("ce que l'agent lit dans la source", () => {
  function detecting(answer: AgentResponse<unknown>): { asked: unknown[] } {
    const asked: unknown[] = [];

    stubPupitre({
      ...QUIET_RUN,
      agentCall: (_server, _cmd, params) => {
        asked.push(params);

        return Promise.resolve(answer);
      },
    });

    return { asked };
  }

  it("prend le gestionnaire, le port et la commande que le dépôt déclare", async () => {
    const { asked } = detecting({
      ok: true,
      result: {
        cmd: "pnpm dev --port 5173",
        install: "pnpm install",
        pkgmgr: "pnpm",
        port_hint: 5173,
      },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);
    await useProjectAdd.getState().detect("srv-1");

    expect(asked).toEqual([{ repo: REPO }]);
    expect(useProjectAdd.getState().detection.status).toBe("read");
    expect(useProjectAdd.getState().draft).toMatchObject({
      cmd: "pnpm dev --port 5173",
      pkgmgr: "pnpm",
    });
    expect(mainPort()).toBe(5173);

    // The reader keeps the last word on the port: the command follows it.
    useProjectAdd.getState().setRowPort(0, 5200);
    expect(useProjectAdd.getState().draft.cmd).toBe("pnpm dev --port 5200");
  });

  // The wait names what the agent is cloning, so a reader who just changed
  // the branch sees that the change was taken rather than a line that did not move.
  it("dit, pendant la lecture, quelle branche l'agent clone", async () => {
    let seen: DetectionState | undefined;

    stubPupitre({
      listProjects: QUIET_RUN.listProjects,
      agentCall: () => {
        seen = useProjectAdd.getState().detection;

        return Promise.resolve({
          ok: true,
          result: { install: "bun install", pkgmgr: "bun" },
        });
      },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);
    useProjectAdd.getState().setBranch(" release/2.0 ");
    await useProjectAdd.getState().detect("srv-1");

    expect(seen).toEqual({
      branch: "release/2.0",
      source: REPO,
      status: "reading",
    });

    useProjectAdd.getState().setBranch("");
    await useProjectAdd.getState().detect("srv-1");

    expect(seen).toEqual({ source: REPO, status: "reading" });
  });

  // A script that freezes --host react-box.localhost binds to a name only the
  // laptop resolves: declared as the host, the agent makes the server answer to it.
  it("déclare le nom en .localhost que le dépôt fige, et la boucle locale sinon", async () => {
    detecting({
      ok: true,
      result: {
        cmd: "bun run dev --port 3000",
        host_hint: "react-box.localhost",
        install: "bun install",
        pkgmgr: "bun",
        port_hint: 3000,
      },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(REPO);

    expect(useProjectAdd.getState().params().host).toBe("127.0.0.1");

    await useProjectAdd.getState().detect("srv-1");

    expect(useProjectAdd.getState().params().host).toBe("react-box.localhost");

    useProjectAdd.getState().setSource(SHOP);

    expect(useProjectAdd.getState().params().host).toBe("127.0.0.1");
  });

  it("prend les ports d'un monorepo, une ligne par workspace", async () => {
    detecting({
      ok: true,
      result: {
        cmd: "bunx turbo run dev",
        install: "bun install",
        pkgmgr: "bun",
        port_hint: 3100,
        routes: [
          { label: "web", port: 3100 },
          { label: "api", port: 3101 },
        ],
      },
    });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().detect("srv-1");

    expect(useProjectAdd.getState().draft.cmd).toBe("bunx turbo run dev");
    expect(useProjectAdd.getState().params().routes).toEqual([
      { label: "web", port: 3100, subdomain: "shop" },
      { label: "api", port: 3101, subdomain: "api-shop" },
    ]);
  });

  it("nomme un dossier du serveur comme tel, et ne relit pas la même source", async () => {
    const { asked } = detecting({
      ok: true,
      result: { install: "uv sync", pkgmgr: "uv" },
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/api");
    await useProjectAdd.getState().detect("srv-1");
    await useProjectAdd.getState().detect("srv-1");

    expect(asked).toEqual([{ dir: "apps/api" }]);
    expect(useProjectAdd.getState().draft).toMatchObject({
      cmd: "uv run dev --port 3000",
      pkgmgr: "uv",
    });
  });

  it("garde le refus de l'agent sous la source, et l'oublie avec elle", async () => {
    const absent: AgentError = {
      code: "bad_request",
      fix: "Clonez-le d'abord, ou donnez son adresse git.",
      message: "apps/ghost n'existe pas sous le dossier des projets",
    };

    detecting({ error: absent, ok: false });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/ghost");
    await useProjectAdd.getState().detect("srv-1");

    expect(useProjectAdd.getState().detection).toMatchObject({
      error: absent,
      status: "failed",
    });

    useProjectAdd.getState().setSource("apps/real");
    expect(useProjectAdd.getState().detection.status).toBe("idle");
  });

  it("ne relit pas un projet que le serveur déclare déjà", async () => {
    const { asked } = detecting({ ok: true, result: { pkgmgr: "bun" } });

    stubPupitre({
      ...QUIET_RUN,
      agentCall: (_server, _cmd, params) => {
        asked.push(params);

        return Promise.resolve({ ok: true, result: { pkgmgr: "bun" } });
      },
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
                routes: [{ label: "api", port: 3400 }],
                state: "stopped",
              },
            ],
          },
        }),
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/api");
    await useProjectAdd.getState().detect("srv-1");

    expect(asked).toEqual([]);
    expect(useProjectAdd.getState().detected).toBe(true);
    expect(useProjectAdd.getState().draft).toMatchObject({
      cmd: "uv run dev --port 3400",
      pkgmgr: "uv",
    });
    expect(mainPort()).toBe(3400);
    expect(useProjectAdd.getState().params()).not.toHaveProperty("repo");
  });
});

describe("un port déjà pris", () => {
  const taken: AgentError = {
    code: "bad_request",
    fix: "Donne un autre port à shop.",
    message: "le port 3000 est déjà pris par web",
    remedy: { code: "port_taken", port_free: 3001 },
  };

  function stub(): { asked: ProjectAddParams[] } {
    const asked: ProjectAddParams[] = [];

    stubPupitre({
      ...QUIET_RUN,
      addProject: (_serverId, params) => {
        asked.push(params);

        return Promise.resolve(
          asked.length === 1
            ? { ok: false, error: taken }
            : { ok: true, result: project(params) }
        );
      },
      projectAddress: () =>
        Promise.resolve({ ok: true, result: { url: "http://127.0.0.1:3001" } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { port: 3001, state: "online" } }),
    });

    return { asked };
  }

  it("garde le refus tel quel et prend le port libre du champ, pas de la phrase", async () => {
    stub();

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().launch("srv-1");

    expect(useProjectAdd.getState().run).toMatchObject({
      error: taken,
      phase: "add",
      status: "failed",
    });
    expect(mainPort()).toBe(3001);
    expect(useProjectAdd.getState().draft.cmd).toBe("bun run dev --port 3001");
  });

  it("aboutit au second essai, sur le port du remède", async () => {
    const { asked } = stub();

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().launch("srv-1");
    await useProjectAdd.getState().retry("srv-1");

    expect(asked.map((params) => params.port)).toEqual([3000, 3001]);
    expect(useProjectAdd.getState().run).toMatchObject({
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
      ...QUIET_RUN,
      addProject: (_serverId, params) => {
        counters.adds += 1;

        return Promise.resolve({ ok: true, result: project(params) });
      },
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
    });

    return counters;
  }

  it("laisse le journal visible et rend l'erreur de l'agent telle quelle", async () => {
    stub(() => false);

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().launch("srv-1");

    expect(useProjectAdd.getState().run).toMatchObject({
      error: dead,
      phase: "up",
      status: "failed",
    });
    expect(useProjectAdd.getState().logs).toEqual([
      "error: Cannot find module 'vite'",
    ]);
    expect(phase("up")).toBe("fail");
  });

  it("reprend au démarrage sans redéclarer le projet", async () => {
    let up = false;
    const counters = stub(() => up);

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().launch("srv-1");

    up = true;
    await useProjectAdd.getState().retry("srv-1");

    expect(counters.adds).toBe(1);
    expect(useProjectAdd.getState().run).toMatchObject({
      state: "online",
      status: "done",
    });
    expect(phase("add")).toBe("ok");
  });

  it("tient pour un échec un projet que l'agent ne donne pas en marche", async () => {
    stubPupitre({
      ...QUIET_RUN,
      projectJournal: () =>
        Promise.resolve({ ok: true, result: { lines: ["exit status 1"] } }),
      startProject: () =>
        Promise.resolve({ ok: true, result: { state: "failed" } }),
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setSource(SHOP);
    await useProjectAdd.getState().launch("srv-1");

    expect(useProjectAdd.getState().run).toMatchObject({
      phase: "up",
      status: "failed",
    });
    expect(useProjectAdd.getState().logs).toEqual(["exit status 1"]);
  });
});

describe("un dossier déjà présent sur le serveur", () => {
  it("ne récupère aucune source pour un dossier qui est déjà là", async () => {
    stubPupitre(QUIET_RUN);

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/web");
    await useProjectAdd.getState().launch("srv-1");

    expect(phase("sources")).toBe("skip");
    expect(phase("install")).toBe("ok");
    expect(useProjectAdd.getState().run).toMatchObject({ status: "done" });
  });

  it("refuse de partir sans nom, sans port valable ou sans commande", async () => {
    stubPupitre({ listProjects: QUIET_RUN.listProjects });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    expect(useProjectAdd.getState().ready()).toBe(false);

    useProjectAdd.getState().setSource("apps/web");
    expect(useProjectAdd.getState().ready()).toBe(true);

    useProjectAdd.getState().setRowPort(0, Number.NaN);
    expect(useProjectAdd.getState().ready()).toBe(false);

    useProjectAdd.getState().setRowPort(0, 80);
    expect(useProjectAdd.getState().ready()).toBe(false);

    useProjectAdd.getState().setRowPort(0, 3000);
    useProjectAdd.getState().setCmd("  ");
    expect(useProjectAdd.getState().ready()).toBe(false);
  });

  it("refuse deux lignes sur le même libellé ou le même port", async () => {
    stubPupitre({ listProjects: QUIET_RUN.listProjects });

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/web");
    useProjectAdd.getState().addRow();
    expect(useProjectAdd.getState().ready()).toBe(true);

    useProjectAdd.getState().setRowLabel(1, "web");
    expect(useProjectAdd.getState().rowProblem(1)).toBe("labelTaken");
    expect(useProjectAdd.getState().ready()).toBe(false);

    useProjectAdd.getState().setRowLabel(1, "api");
    useProjectAdd.getState().setRowPort(1, 3000);
    expect(useProjectAdd.getState().rowProblem(1)).toBe("portTaken");
  });
});

describe("le sous-domaine du projet", () => {
  const held = {
    ...QUIET_RUN,
    listProjects: () =>
      Promise.resolve({
        ok: true as const,
        result: {
          projects: [
            {
              cmd: "bun run dev --port 3400",
              dir: "other",
              host: "127.0.0.1",
              name: "other",
              path: "/home/dev/projects/other",
              pkgmgr: "bun" as const,
              port: 3400,
              routes: [
                { hostname: "my-site.example.org", label: "web", port: 3400 },
              ],
              state: "online" as const,
            },
          ],
        },
      }),
  };

  it("se déduit d'un nom à point sous une forme que l'agent accepte", async () => {
    stubPupitre(QUIET_RUN);

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource("https://github.com/moi/my.site.git");

    expect(useProjectAdd.getState().draft.name).toBe("my.site");
    expect(web()).toBe("my-site");
    expect(useProjectAdd.getState().rowProblem(0)).toBeNull();
  });

  it("refuse une valeur mal formée sans appeler l'agent", async () => {
    const asked: ProjectAddParams[] = [];

    stubPupitre({
      ...QUIET_RUN,
      addProject: (_serverId, params) => {
        asked.push(params);

        return Promise.resolve({ ok: true, result: project(params) });
      },
    });

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource(SHOP);
    useProjectAdd.getState().setRowWeb(0, "-shop");

    expect(useProjectAdd.getState().rowProblem(0)).toBe("web");
    expect(useProjectAdd.getState().ready()).toBe(false);
    expect(asked).toEqual([]);
  });

  it("refuse un sous-domaine qu'un projet déclaré tient déjà", async () => {
    stubPupitre(held);

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource(SHOP);
    useProjectAdd.getState().setRowWeb(0, "my-site");

    expect(useProjectAdd.getState().rowProblem(0)).toBe("webTaken");
    expect(useProjectAdd.getState().ready()).toBe(false);
  });

  it("propose un nom libre quand on le lui demande", async () => {
    stubPupitre(held);

    await useProjectAdd.getState().prepare("srv-1", TUNNEL);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource("https://github.com/moi/my.site.git");
    useProjectAdd.getState().setRowWeb(0, "-shop");
    useProjectAdd.getState().generateRowWeb(0);

    expect(web()).toBe("my-site-2");
    expect(useProjectAdd.getState().rowProblem(0)).toBeNull();
  });

  it("ne juge rien quand la machine n'a pas de tunnel", async () => {
    stubPupitre(QUIET_RUN);

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource(SHOP);
    useProjectAdd.getState().setRowWeb(0, "-shop");

    expect(useProjectAdd.getState().rowProblem(0)).toBeNull();
  });
});

describe("les dépôts du compte GitHub", () => {
  const REPO_ROW = {
    cloneUrl: "https://github.com/acme/atlas-web.git",
    defaultBranch: "release/2.0",
    fullName: "acme/atlas-web",
    name: "atlas-web",
    owner: "acme",
    private: true,
    pushedAt: "2026-09-01T10:00:00Z",
  };

  it("met le dépôt, la branche et le nom dans le brouillon", async () => {
    stubPupitre({
      ...QUIET_RUN,
      githubRepos: () => Promise.resolve({ ok: true, result: [REPO_ROW] }),
    });

    await useProjectAdd.getState().prepare("srv-1", null);
    await useProjectAdd.getState().loadRepos();

    expect(useProjectAdd.getState().repos).toMatchObject({ status: "ready" });

    useProjectAdd.getState().pickRepo(REPO_ROW);

    expect(useProjectAdd.getState().draft).toMatchObject({
      branch: "release/2.0",
      name: "atlas-web",
      privateRepo: true,
      source: REPO_ROW.cloneUrl,
    });
    expect(useProjectAdd.getState().params()).toMatchObject({
      branch: "release/2.0",
      repo: REPO_ROW.cloneUrl,
    });
  });

  it("lit l'absence de compte comme une invite, et un échec comme une erreur", async () => {
    stubPupitre({
      ...QUIET_RUN,
      githubRepos: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.connection.absent",
            phrase: { id: "refusal.connection.absent" },
          },
          ok: false,
        }),
    });

    await useProjectAdd.getState().loadRepos();
    expect(useProjectAdd.getState().repos.status).toBe("absent");

    stubPupitre({
      ...QUIET_RUN,
      githubRepos: () =>
        Promise.resolve({
          error: { code: "bad_request", message: "github a refusé" },
          ok: false,
        }),
    });

    await useProjectAdd.getState().loadRepos();
    expect(useProjectAdd.getState().repos.status).toBe("failed");
  });

  it("ne demande une branche que pour un dépôt", async () => {
    stubPupitre(QUIET_RUN);

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("git");
    useProjectAdd.getState().setSource(SHOP);
    useProjectAdd.getState().setBranch("main");
    useProjectAdd.getState().setKind("dir");
    useProjectAdd.getState().setSource("apps/web");

    expect(useProjectAdd.getState().params()).not.toHaveProperty("branch");
    expect(useProjectAdd.getState().params()).not.toHaveProperty("repo");
  });
});

describe("le navigateur de dossiers", () => {
  function browsing(): { asked: { cmd: string; params: unknown }[] } {
    const asked: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      ...QUIET_RUN,
      agentCall: (_server, cmd, params) => {
        asked.push({ cmd, params });

        if (cmd === "fs.list") {
          return Promise.resolve({
            ok: true,
            result: {
              entries: [
                {
                  kind: "dir",
                  mode: "0755",
                  modified_at: "2026-09-01T10:00:00Z",
                  name: "flymate",
                  size_bytes: 0,
                },
                {
                  kind: "file",
                  mode: "0644",
                  modified_at: "2026-09-01T10:00:00Z",
                  name: "notes.md",
                  size_bytes: 12,
                },
              ],
              path: "projects",
              truncated: false,
            },
          });
        }

        return Promise.resolve({ ok: true, result: { path: "projects/new" } });
      },
      completions: () =>
        Promise.resolve({
          ok: true,
          result: {
            command: "dev",
            path: "",
            paths: [],
            projects: [],
            root: "/home/dev/projects",
            sub: [],
          },
        }),
    });

    return { asked };
  }

  it("ne liste que les dossiers, sous la racine que l'agent nomme", async () => {
    const { asked } = browsing();

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    await useProjectAdd.getState().browse("srv-1", "");

    expect(asked).toEqual([{ cmd: "fs.list", params: { path: "projects" } }]);
    expect(useProjectAdd.getState().folders).toMatchObject({
      folders: ["flymate"],
      path: "",
      status: "ready",
    });
  });

  it("pose le dossier choisi comme dir du projet", async () => {
    browsing();

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    await useProjectAdd.getState().browse("srv-1", "");
    useProjectAdd.getState().pickFolder("flymate/api");

    expect(useProjectAdd.getState().draft).toMatchObject({
      dir: "flymate/api",
      name: "api",
    });
    expect(useProjectAdd.getState().params()).toMatchObject({
      dir: "flymate/api",
    });
  });

  it("crée un dossier sous celui qui est ouvert, puis le relit", async () => {
    const { asked } = browsing();

    await useProjectAdd.getState().prepare("srv-1", null);
    useProjectAdd.getState().setKind("dir");
    await useProjectAdd.getState().browse("srv-1", "flymate");
    await useProjectAdd.getState().makeFolder("srv-1", "api");

    expect(asked.map((call) => call.cmd)).toEqual([
      "fs.list",
      "fs.mkdir",
      "fs.list",
    ]);
    expect(asked[1]).toEqual({
      cmd: "fs.mkdir",
      params: { path: "projects/flymate/api" },
    });
  });
});
