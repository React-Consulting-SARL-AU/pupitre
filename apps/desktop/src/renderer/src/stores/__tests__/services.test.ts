import { beforeEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { ServiceDetail } from "@shared/services";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useNavigation } from "../navigation";
import { useServices } from "../services";

const SERVER = "srv-1";

const PASSWORD = "mot-de-passe-de-la-base";

const DETAIL: ServiceDetail = {
  configured: true,
  credentials: ["Rôle applicatif", "Rôle distant"],
  id: "db.postgres",
  name: "PostgreSQL 17",
  port: 5432,
  state: "running",
  unit: "postgresql.service",
  version: "17.2",
};

function step(
  module: string,
  name: string,
  status: "start" | "ok" | "fail",
  ms: number
): Event {
  return { id: 3, event: "step", module, step: name, status, ms } as Event;
}

beforeEach(() => {
  useServices.getState().forget();
});

describe("la fiche d'un service", () => {
  it("montre ce que le processus principal a bien voulu en dire", async () => {
    stubPupitre({
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");

    const { detail } = useServices.getState();

    expect(detail.status).toBe("ready");
    expect(detail.status === "ready" && detail.detail.port).toBe(5432);
  });

  it("ne garde jamais la valeur d'un identifiant révélé", async () => {
    const asked: string[] = [];

    stubPupitre({
      revealCredential: (_server, _module, label) => {
        asked.push(label);

        return Promise.resolve(PASSWORD);
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");

    const shown = await useServices
      .getState()
      .reveal(SERVER, "db.postgres", "Rôle applicatif");

    expect(shown).toBe(PASSWORD);
    expect(asked).toEqual(["Rôle applicatif"]);
    expect(JSON.stringify(useServices.getState())).not.toContain(PASSWORD);
  });

  it("fait copier de l'autre côté du pont", async () => {
    const copied: string[] = [];

    stubPupitre({
      copyCredential: (_server, _module, label) => {
        copied.push(label);

        return Promise.resolve(true);
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    const done = await useServices
      .getState()
      .copy(SERVER, "db.postgres", "Rôle distant");

    expect(done).toBe(true);
    expect(copied).toEqual(["Rôle distant"]);
  });

  it("fait oublier les valeurs en refermant la fiche", async () => {
    const forgotten: string[] = [];

    stubPupitre({
      forgetCredentials: (_server, moduleId) => {
        forgotten.push(moduleId ?? "");

        return Promise.resolve();
      },
      forgetInstallSecrets: () => Promise.resolve(),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    await useServices.getState().close(SERVER);

    expect(forgotten).toEqual(["db.postgres"]);
    expect(useServices.getState().detail.status).toBe("idle");
  });
});

describe("la configuration d'un module installé", () => {
  it("remet dans le formulaire ce que l'agent a retenu", async () => {
    stubPupitre({
      agentCall: (_server, cmd, params) => {
        expect(cmd).toBe("module.config");
        expect(params).toEqual({ id: "db.mysql" });

        return Promise.resolve({
          ok: true,
          result: {
            id: "db.mysql",
            values: { engine: "mysql", port: 3306 },
            secrets: ["app_password", "remote_password"],
          },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().readConfig(SERVER, "db.mysql");

    const { config, values } = useServices.getState();

    expect(config.status).toBe("ready");
    expect(config.status === "ready" && config.held).toEqual([
      "app_password",
      "remote_password",
    ]);
    expect(values).toEqual({ engine: "mysql", port: 3306 });
  });

  it("renvoie la configuration entière du seul module, sans le mot de passe", async () => {
    const sent: { modules: readonly string[]; config: unknown }[] = [];
    const filed: { key: string; value: string }[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: {
            id: "db.mysql",
            values: { engine: "mysql", port: 3306 },
            secrets: ["app_password"],
          },
        } as AgentResponse<unknown>),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
      setInstallSecret: (_server, _module, key, value) => {
        filed.push({ key, value });

        return Promise.resolve({ ok: true, result: {} });
      },
      startInstall: (_server, modules, config) => {
        sent.push({ config, modules });

        return Promise.resolve({
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        });
      },
    });

    await useServices.getState().readConfig(SERVER, "db.mysql");
    useServices.getState().setValue("port", 3307);
    await useServices
      .getState()
      .setSecret(SERVER, "db.mysql", "app_password", PASSWORD);
    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(filed).toEqual([{ key: "app_password", value: PASSWORD }]);
    expect(sent).toEqual([
      {
        config: { "db.mysql": { engine: "mysql", port: 3307 } },
        modules: ["db.mysql"],
      },
    ]);
    expect(JSON.stringify(useServices.getState())).not.toContain(PASSWORD);
  });
});

describe("l'attente d'une configuration appliquée", () => {
  // The agent checks the machine before its first step says anything: a row
  // that read "waiting" until then looked like a click that had done nothing.
  it("montre le module au travail dès le geste, avant la première étape", async () => {
    let seen: string | undefined;

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { id: "db.mysql", values: { port: 3306 }, secrets: [] },
        } as AgentResponse<unknown>),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
      startInstall: () => {
        seen = useServices.getState().steps[0]?.status;

        return Promise.resolve({
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        });
      },
    });

    await useServices.getState().readConfig(SERVER, "db.mysql");
    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(seen).toBe("running");
  });
});

describe("le domaine d'une exposition", () => {
  const web = (hostname: string) => ({
    dir: "web",
    name: "web",
    path: "/home/dev/projects/web",
    processes: [
      {
        cmd: "bun run dev",
        dir: ".",
        host: "127.0.0.1",
        id: "web",
        path: "/home/dev/projects/web",
        pkgmgr: "bun" as const,
        port: 3000,
        routes: [{ hostname, label: "web", port: 3000 }],
        state: "online" as const,
      },
    ],
    state: "online" as const,
  });

  // The agent moved the names; the records follow from here: the ones of
  // before go, the ones of now are written, and nothing else in the zone moves.
  it("retire les noms d'avant et écrit ceux du nouveau domaine", async () => {
    const order: string[] = [];
    let domain = "flymate.dev";

    stubPupitre({
      agentCall: (_server, cmd) => {
        order.push(cmd);

        if (cmd === "module.config") {
          return Promise.resolve({
            ok: true,
            result: {
              id: "exposure.cloudflare",
              values: { domain },
              secrets: [],
            },
          } as AgentResponse<unknown>);
        }

        return Promise.resolve({
          ok: true,
          result: {
            installed: true,
            provider: "cloudflare",
            routes: [
              {
                hostname: `web.${domain}`,
                project: "web",
                service: "http://127.0.0.1:3000",
              },
            ],
            state: "running",
          },
        } as AgentResponse<unknown>);
      },
      listProjects: () =>
        Promise.resolve({
          ok: true,
          result: { projects: [web(`web.${domain}`)] },
        }),
      releaseTunnelRecords: (_server, hostnames) => {
        order.push(`release ${hostnames.join(",")}`);

        return Promise.resolve({ ok: true, result: hostnames.length });
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
      startInstall: () => {
        order.push("install");
        domain = "flymate.studio";

        return Promise.resolve({
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        });
      },
      syncTunnelRecords: (_server, routes) => {
        order.push(
          `records ${routes.map((route) => route.hostname).join(",")}`
        );

        return Promise.resolve({ ok: true, result: routes.length });
      },
    });

    await useServices.getState().readConfig(SERVER, "exposure.cloudflare");
    useServices.getState().setValue("domain", "flymate.studio");
    await useServices.getState().reconfigure(SERVER, "exposure.cloudflare");

    expect(
      order.filter(
        (step) => !step.startsWith("module.config") && step !== "service.status"
      )
    ).toEqual([
      "install",
      "release web.flymate.dev",
      "tunnel.sync",
      "records web.flymate.studio",
    ]);
  });

  it("ne touche à aucun enregistrement quand le domaine ne change pas", async () => {
    const order: string[] = [];

    stubPupitre({
      agentCall: (_server, cmd) => {
        order.push(cmd);

        return Promise.resolve({
          ok: true,
          result: {
            id: "exposure.cloudflare",
            values: { domain: "flymate.dev" },
            secrets: [],
          },
        } as AgentResponse<unknown>);
      },
      listProjects: () =>
        Promise.resolve({
          ok: true,
          result: { projects: [web("web.flymate.dev")] },
        }),
      releaseTunnelRecords: () => {
        order.push("release");

        return Promise.resolve({ ok: true, result: 0 });
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
      startInstall: () =>
        Promise.resolve({
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        }),
      syncTunnelRecords: () => {
        order.push("records");

        return Promise.resolve({ ok: true, result: 0 });
      },
    });

    await useServices.getState().readConfig(SERVER, "exposure.cloudflare");
    await useServices.getState().reconfigure(SERVER, "exposure.cloudflare");

    expect(order).not.toContain("release");
    expect(order).not.toContain("records");
  });
});

const MANIFEST: Manifest = {
  arch: ["amd64", "arm64"],
  category: "database",
  conflicts: [],
  fields: [
    {
      default: 3306,
      key: "port",
      kind: "number",
      label: "Port",
      max: 65_535,
      min: 1024,
      required: true,
    },
    {
      generate: true,
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
    },
  ],
  id: "db.mysql",
  mandatory: false,
  name: "MySQL",
  requires: ["core.system"],
  resources: { disk_mb: 0, ram_mb: 0 },
  runs: true,
  since: "0.1.0",
  summary: "MySQL",
};

function configuredMySQL(
  overrides: Parameters<typeof stubPupitre>[0] = {}
): void {
  stubPupitre({
    agentCall: () =>
      Promise.resolve({
        ok: true,
        result: {
          id: "db.mysql",
          values: { port: 3306 },
          secrets: ["app_password"],
        },
      } as AgentResponse<unknown>),
    forgetInstallSecrets: () => Promise.resolve(),
    generateInstallSecret: () =>
      Promise.resolve({
        ok: true,
        result: {
          "db.mysql": {
            app_password: { filled: true, generated: true, revealed: false },
          },
        },
      }),
    serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    ...overrides,
  });
}

describe("le formulaire d'un module installé", () => {
  it("n'a rien à appliquer tant que rien n'a changé, et le sait dès qu'une valeur ou un secret change", async () => {
    configuredMySQL();

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    expect(useServices.getState().dirty()).toBe(false);

    useServices.getState().setValue("port", 3307);
    expect(useServices.getState().dirty()).toBe(true);

    useServices.getState().setValue("port", 3306);
    expect(useServices.getState().dirty()).toBe(false);

    await useServices.getState().generate(SERVER, "db.mysql", "app_password");
    expect(useServices.getState().dirty()).toBe(true);
  });

  it("revient à ce que le serveur tient, secrets tapés compris", async () => {
    let forgotten = 0;
    configuredMySQL({
      forgetInstallSecrets: () => {
        forgotten += 1;

        return Promise.resolve();
      },
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    useServices.getState().setValue("port", 3307);
    await useServices.getState().generate(SERVER, "db.mysql", "app_password");

    await useServices.getState().discard(SERVER);

    expect(forgotten).toBe(1);
    expect(useServices.getState().values).toEqual({ port: 3306 });
    expect(useServices.getState().secrets).toEqual({});
    expect(useServices.getState().dirty()).toBe(false);
  });

  it("dit ce qui cloche sur un champ répondu, et sur tous une fois l'application demandée", async () => {
    const sent: unknown[] = [];
    configuredMySQL({
      startInstall: () => {
        sent.push("install");

        return Promise.resolve({
          ok: true,
          result: { failed: [], report_path: "/r", warned: [] },
        });
      },
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    expect(useServices.getState().shown()).toEqual([]);

    useServices.getState().setValue("port", 80);
    expect(useServices.getState().shown()).toMatchObject([
      { code: "min", field: "port", module: "db.mysql" },
    ]);

    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(sent).toEqual([]);
    expect(useServices.getState().apply.status).toBe("idle");
    expect(useServices.getState().attempted).toBe(true);
  });

  it("tient un secret que le serveur garde pour répondu", async () => {
    configuredMySQL();

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    useServices.getState().setValue("port", 3307);

    expect(useServices.getState().problems()).toEqual([]);
  });

  it("demande au serveur de peser les valeurs avant de les appliquer, et pose son refus sur le champ", async () => {
    const sent: unknown[] = [];
    configuredMySQL({
      checkInstall: (_server, modules, config) => {
        sent.push({ check: { config, modules } });

        return Promise.resolve({
          ok: true,
          result: {
            problems: [
              {
                code: "format",
                expected: "port",
                field: "port",
                message: "le port 3307 est déjà pris par nginx",
                module: "db.mysql",
              },
            ],
            warnings: [],
          },
        });
      },
      startInstall: () => {
        sent.push("install");

        return Promise.resolve({
          ok: true,
          result: { failed: [], report_path: "/r", warned: [] },
        });
      },
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    useServices.getState().setValue("port", 3307);
    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(sent).toEqual([
      {
        check: {
          config: { "db.mysql": { port: 3307 } },
          modules: ["db.mysql"],
        },
      },
    ]);
    expect(useServices.getState().apply.status).toBe("idle");
    expect(useServices.getState().shown()).toMatchObject([
      { field: "port", message: "le port 3307 est déjà pris par nginx" },
    ]);

    // The verdict was about that value: changing it is what lifts the refusal.
    useServices.getState().setValue("port", 3308);
    expect(useServices.getState().refused).toEqual([]);
  });

  it("pose sur le champ ce qu'un install refusé a nommé", async () => {
    configuredMySQL({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "bad_request",
            message: "configuration refusée",
            remedy: {
              code: "invalid_fields",
              problems: [
                {
                  code: "required",
                  field: "port",
                  message: "le port est requis",
                  module: "db.mysql",
                },
              ],
            },
          },
        }),
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);
    useServices.getState().setValue("port", 3307);
    await useServices.getState().reconfigure(SERVER, "db.mysql");

    expect(useServices.getState().apply.status).toBe("idle");
    expect(useServices.getState().shown()).toMatchObject([
      { field: "port", message: "le port est requis" },
    ]);
  });
});

describe("un module posé sans ses réglages", () => {
  /**
   * The catalogue would have made the password when the module was chosen; a
   * module put off got none, and the panel makes it so that applying is all
   * that finishes the module.
   */
  it("reçoit à l'ouverture les secrets que son manifeste dit de générer", async () => {
    const made: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { id: "db.mysql", secrets: [], values: {} },
        } as AgentResponse<unknown>),
      generateInstallSecret: (_server, _module, key) => {
        made.push(key);

        return Promise.resolve({
          ok: true,
          result: {
            "db.mysql": {
              [key]: { filled: true, generated: true, revealed: false },
            },
          },
        });
      },
      serviceDetail: () =>
        Promise.resolve({
          ok: true,
          result: { ...DETAIL, configured: false, id: "db.mysql" },
        }),
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);

    expect(made).toEqual(["app_password"]);
    expect(useServices.getState().values).toEqual({ port: 3306 });
    expect(
      useServices.getState().secrets["db.mysql"]?.app_password
    ).toMatchObject({
      generated: true,
    });
  });

  it("laisse en paix un module configuré, et un secret que le serveur tient déjà", async () => {
    const made: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { id: "db.mysql", secrets: ["app_password"], values: {} },
        } as AgentResponse<unknown>),
      generateInstallSecret: (_server, _module, key) => {
        made.push(key);

        return Promise.resolve({ ok: true, result: {} });
      },
      serviceDetail: () =>
        Promise.resolve({ ok: true, result: { ...DETAIL, id: "db.mysql" } }),
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { id: "db.mysql", secrets: ["app_password"], values: {} },
        } as AgentResponse<unknown>),
      generateInstallSecret: (_server, _module, key) => {
        made.push(key);

        return Promise.resolve({ ok: true, result: {} });
      },
      serviceDetail: () =>
        Promise.resolve({
          ok: true,
          result: { ...DETAIL, configured: false, id: "db.mysql" },
        }),
    });

    await useServices.getState().open(SERVER, "db.mysql", MANIFEST);

    expect(made).toEqual([]);
  });
});

describe("retirer un module", () => {
  it("suit les étapes de l'agent comme une installation", async () => {
    stubPupitre({
      agentStream: (_server, cmd, params, onEvent) => {
        expect(cmd).toBe("uninstall");
        expect(params).toEqual({ modules: ["db.postgres"] });

        onEvent(step("db.postgres", "systemd", "start", 0));
        onEvent(step("db.postgres", "systemd", "ok", 1200));
        onEvent(step("db.postgres", "purge", "ok", 3400));

        return Promise.resolve({
          ok: true,
          result: { failed: [] },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().remove(SERVER, "db.postgres");

    const { removal, steps } = useServices.getState();

    expect(removal.status).toBe("done");
    expect(steps[0]?.status).toBe("ok");
    expect(steps[0]?.steps.map((entry) => entry.step)).toEqual([
      "systemd",
      "purge",
    ]);
    expect(steps[0]?.ms).toBe(4600);
  });

  it("garde ce que le serveur dit n'avoir pas pu retirer", async () => {
    stubPupitre({
      agentStream: () =>
        Promise.resolve({
          ok: true,
          result: { failed: ["db.postgres"] },
        } as AgentResponse<unknown>),
    });

    await useServices.getState().remove(SERVER, "db.postgres");

    const { removal } = useServices.getState();

    expect(removal.status === "done" && removal.failed).toEqual([
      "db.postgres",
    ]);
  });
});

describe("les gestes d'une base", () => {
  it("déduit le moteur du module et rend le chemin de l'export", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result: { path: "/home/dev/dumps/app.dump", size_bytes: 4_200_000 },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().dump(SERVER, "db.mysql");

    expect(sent).toEqual([{ cmd: "db.dump", params: { engine: "mysql" } }]);
    expect(useServices.getState().database).toEqual({
      bytes: 4_200_000,
      kind: "dump",
      lines: ["/home/dev/dumps/app.dump"],
    });
  });

  it("ouvre le shell dans l'onglet que le processus principal a nommé, sans lire la ligne", async () => {
    const asked: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({ ok: true, result: {} } as AgentResponse<unknown>),
      openDatabaseShell: (_server, moduleId) => {
        asked.push(moduleId);

        return Promise.resolve({
          ok: true,
          result: { id: "db1abc", session: "db-postgres-1" },
        });
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    await useServices.getState().shell(SERVER, "db.postgres");

    const navigation = useNavigation.getState();
    const tab = navigation.terminals.find((one) => one.id === "db1abc");

    expect(asked).toEqual(["db.postgres"]);
    expect(tab?.kind).toBe("shell");
    expect(tab?.project).toBeNull();
    expect(tab?.title).toBe("PostgreSQL 17");
    expect(navigation.view).toBe("terminals");
    expect(navigation.activeTerminal).toBe("db1abc");
    expect(JSON.stringify(useServices.getState())).not.toContain("psql");
  });

  it("garde le refus du processus principal quand le shell ne s'ouvre pas", async () => {
    stubPupitre({
      openDatabaseShell: () =>
        Promise.resolve({
          error: { code: "bad_request", message: "pas une base" },
          ok: false,
        }),
    });

    await useServices.getState().shell(SERVER, "runtime.node");

    expect(useServices.getState().problem?.message).toBe("pas une base");
    expect(useServices.getState().busy).toBeNull();
  });

  it("ne dit rien à l'agent pour un module qui n'est pas une base", async () => {
    const sent: string[] = [];

    stubPupitre({
      agentCall: (_server, cmd) => {
        sent.push(cmd);

        return Promise.resolve({
          ok: true,
          result: {},
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().dump(SERVER, "runtime.node");

    expect(sent).toEqual([]);
  });
});

describe("l'unité d'un service", () => {
  it("démarre, arrête ou redémarre et garde l'état que l'agent a répondu", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result: {
            credentials: {},
            id: "db.postgres",
            name: "PostgreSQL 17",
            port: 5432,
            state: "stopped",
            version: "17.3",
          },
        } as AgentResponse<unknown>);
      },
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    await useServices.getState().control(SERVER, "db.postgres", "service.stop");

    const { detail, busy, problem } = useServices.getState();

    expect(sent).toEqual([
      { cmd: "service.stop", params: { id: "db.postgres" } },
    ]);
    expect(detail.status === "ready" && detail.detail.state).toBe("stopped");
    expect(detail.status === "ready" && detail.detail.version).toBe("17.3");
    expect(detail.status === "ready" && detail.detail.credentials).toEqual(
      DETAIL.credentials
    );
    expect(busy).toBeNull();
    expect(problem).toBeNull();
  });

  it("dit le refus de systemd tel quel et laisse l'état d'avant", async () => {
    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          error: {
            code: "internal",
            fix: "Lisez le journal du service.",
            message: "Job for postgresql.service failed",
          },
          ok: false,
        } as AgentResponse<unknown>),
      serviceDetail: () => Promise.resolve({ ok: true, result: DETAIL }),
    });

    await useServices.getState().open(SERVER, "db.postgres");
    await useServices
      .getState()
      .control(SERVER, "db.postgres", "service.start");

    const { detail, problem } = useServices.getState();

    expect(detail.status === "ready" && detail.detail.state).toBe("running");
    expect(problem?.fix).toBe("Lisez le journal du service.");
  });
});

describe("les dumps du serveur", () => {
  const ENTRIES = [
    {
      kind: "file",
      mode: "0644",
      modified_at: "2026-09-10T10:00:00Z",
      name: "fulldump_shop_20260910.sql.gz",
      size_bytes: 4_200_000,
    },
    {
      kind: "dir",
      mode: "0755",
      modified_at: "2026-09-10T10:00:00Z",
      name: "old",
      size_bytes: 4096,
    },
  ];

  it("se lisent dans le dossier des dumps, fichiers seulement", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result: { entries: ENTRIES, path: "dumps", truncated: false },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().readDumps(SERVER);

    const { dumps } = useServices.getState();

    expect(sent).toEqual([{ cmd: "fs.list", params: { path: "dumps" } }]);
    expect(dumps.status === "ready" && dumps.dumps.map((d) => d.name)).toEqual([
      "fulldump_shop_20260910.sql.gz",
    ]);
  });

  it("restaurent un dump choisi dans la base que son nom dit", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result: { imported: ["shop"] },
        } as AgentResponse<unknown>);
      },
    });

    await useServices
      .getState()
      .restoreDump(SERVER, "db.postgres", "fulldump_shop_20260910.sql.gz");

    expect(sent).toEqual([
      { cmd: "db.import", params: { engine: "postgres", name: "shop" } },
    ]);
    expect(useServices.getState().database).toEqual({
      kind: "import",
      lines: ["shop"],
    });
  });

  it("suppriment un dump sous le dossier des dumps, puis relisent la liste", async () => {
    const sent: { cmd: string; params: unknown }[] = [];

    stubPupitre({
      agentCall: (_server, cmd, params) => {
        sent.push({ cmd, params });

        return Promise.resolve({
          ok: true,
          result:
            cmd === "fs.remove"
              ? { path: "dumps/x.sql", removed: 1 }
              : { entries: [], path: "dumps", truncated: false },
        } as AgentResponse<unknown>);
      },
    });

    await useServices.getState().removeDump(SERVER, "x.sql");

    expect(sent.map((one) => one.cmd)).toEqual(["fs.remove", "fs.list"]);
    expect(sent[0]?.params).toEqual({ path: "dumps/x.sql" });
    expect(useServices.getState().dumps).toEqual({
      dumps: [],
      status: "ready",
    });
  });
});
