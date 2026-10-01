import { beforeEach, describe, expect, it } from "bun:test";
import type { SecretMarks } from "@shared/secrets";
import {
  ARM_MACHINE,
  CATALOG,
  CATALOG_NEXT,
  SMALL_MACHINE,
} from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useCatalog } from "../catalog";
import { useInspection } from "../inspection";

// Kept secrets only leave through a reveal, as in the real main process.
function fakeMain(catalog = CATALOG) {
  const kept = new Map<string, string>();
  const madeHere = new Set<string>();
  const seen = new Set<string>();
  let generated = 0;

  const mark = (): SecretMarks => {
    const state: SecretMarks = {};

    for (const path of kept.keys()) {
      const [moduleId, key] = path.split("|");

      if (!(moduleId && key)) {
        continue;
      }
      state[moduleId] ??= {};
      state[moduleId][key] = {
        filled: true,
        generated: madeHere.has(path),
        revealed: seen.has(path),
      };
    }

    return state;
  };

  return {
    kept,
    api: {
      catalog: (serverId: string) =>
        Promise.resolve(
          serverId === "srv-1"
            ? ({ ok: true, result: catalog } as const)
            : ({
                ok: false,
                error: {
                  code: "bad_request" as const,
                  message: "Ce serveur n'est plus dans la liste.",
                  fix: "Choisis un serveur dans les réglages.",
                },
              } as const)
        ),
      setInstallSecret: (
        _serverId: string,
        moduleId: string,
        key: string,
        value: string
      ) => {
        kept.set(`${moduleId}|${key}`, value);
        madeHere.delete(`${moduleId}|${key}`);

        return Promise.resolve({ ok: true as const, result: mark() });
      },
      generateInstallSecret: (
        _serverId: string,
        moduleId: string,
        key: string
      ) => {
        generated += 1;
        kept.set(`${moduleId}|${key}`, `généré-${generated}`);
        madeHere.add(`${moduleId}|${key}`);

        return Promise.resolve({ ok: true as const, result: mark() });
      },
      revealInstallSecret: (
        _serverId: string,
        moduleId: string,
        key: string
      ) => {
        const path = `${moduleId}|${key}`;
        const value = seen.has(path) ? null : (kept.get(path) ?? null);

        seen.add(path);

        return Promise.resolve({ value, marks: mark() });
      },
      forgetInstallSecrets: (_serverId: string) => {
        kept.clear();
        madeHere.clear();
        seen.clear();

        return Promise.resolve();
      },
    },
  };
}

async function ready(catalog = CATALOG) {
  const main = fakeMain(catalog);

  stubPupitre(main.api);
  await useCatalog.getState().load("srv-1");

  return main;
}

beforeEach(() => {
  useCatalog.getState().reset();
  useInspection.setState({ inspection: { status: "idle" }, probes: {} });
});

describe("the catalogue comes from the agent", () => {
  it("keeps what the command returned, untouched", async () => {
    await ready();

    const state = useCatalog.getState().catalog;

    expect(state.status).toBe("ready");
    expect(state.status === "ready" && state.catalog).toEqual(CATALOG);
  });

  it("forgets on reset what a load forgets too", async () => {
    await ready();

    useCatalog.getState().adoptRestore({
      deferred: ["runtime.node"],
      held: {},
      selected: ["core.system"],
      values: {},
    });
    useCatalog.setState({
      problem: {
        code: "bad_request",
        message: "Le secret n'a pas été lu.",
        fix: "Réessaie.",
      },
    });

    useCatalog.getState().reset();

    expect(useCatalog.getState()).toMatchObject({
      deferred: [],
      problem: null,
    });
  });

  it("keeps the error and its fix as is", async () => {
    stubPupitre(fakeMain().api);

    await useCatalog.getState().load("srv-inconnu");

    expect(useCatalog.getState().catalog).toMatchObject({
      status: "failed",
      error: { fix: "Choisis un serveur dans les réglages." },
    });
  });

  it("ticks the catalogue's required modules as soon as it arrives", async () => {
    await ready();

    expect(useCatalog.getState().selected).toEqual([
      "core.system",
      "core.hardening",
    ]);
  });

  it("shows a module the app does not know, without an extra line", async () => {
    await ready(CATALOG_NEXT);

    const state = useCatalog.getState().catalog;
    const ids =
      state.status === "ready" ? state.catalog.modules.map((m) => m.id) : [];

    expect(ids).toContain("db.clickhouse");

    useCatalog.getState().toggle("db.clickhouse");

    expect(useCatalog.getState().selected).toContain("db.clickhouse");
  });
});

describe("the selection", () => {
  it("pulls in dependencies and releases dependents", async () => {
    await ready();

    useCatalog.getState().toggle("editor.jetbrains");

    expect(useCatalog.getState().selected).toContain("runtime.java");

    useCatalog.getState().toggle("runtime.java");

    expect(useCatalog.getState().selected).not.toContain("editor.jetbrains");
  });

  it("sets the default values of the chosen module's fields", async () => {
    await ready();

    useCatalog.getState().toggle("db.mysql");

    expect(useCatalog.getState().values["db.mysql"]).toEqual({
      engine: "mysql",
      buffer_pool: 512,
    });
  });

  // A deferred service lets the install go on without it rather than refusing.
  it("stops counting a deferred service, and counts it again", async () => {
    await ready();

    useCatalog.getState().toggle("db.mysql");
    useCatalog.getState().setValue("db.mysql", "app_password", "");

    const before = useCatalog
      .getState()
      .problems()
      .filter((one) => one.module === "db.mysql");

    expect(before.length).toBeGreaterThan(0);

    useCatalog.getState().defer("db.mysql", true);

    expect(useCatalog.getState().deferred).toEqual(["db.mysql"]);
    expect(
      useCatalog
        .getState()
        .problems()
        .filter((one) => one.module === "db.mysql")
    ).toEqual([]);

    useCatalog.getState().defer("db.mysql", false);

    expect(useCatalog.getState().deferred).toEqual([]);
    expect(useCatalog.getState().values["db.mysql"]?.engine).toBe("mysql");
    expect(
      useCatalog
        .getState()
        .problems()
        .filter((one) => one.module === "db.mysql").length
    ).toBe(before.length);
  });

  it("starts from a catalogue preset", async () => {
    await ready();

    useCatalog.getState().usePreset("web-js");

    expect([...useCatalog.getState().selected].sort()).toEqual([
      "core.hardening",
      "core.system",
      "db.mysql",
      "editor.vscode",
      "runtime.node",
    ]);
  });

  // A preset ticking what the architecture cannot run would only be refused at install.
  it("does not tick, through a preset, what the architecture cannot run", async () => {
    await ready({
      ...CATALOG,
      presets: [
        {
          id: "full",
          modules: ["core.system", "core.hardening", "tool.legacy"],
          name: "Tout le catalogue",
        },
      ],
    });
    useInspection.setState({ probes: { "srv-1": ARM_MACHINE } });

    useCatalog.getState().usePreset("full");

    expect(useCatalog.getState().selected).not.toContain("tool.legacy");
  });

  it("does not tick either what competes for the machine with an already installed module", async () => {
    const main = fakeMain(CATALOG);

    stubPupitre(main.api);
    await useCatalog.getState().load("srv-1", ["exposure.caddy"]);

    useCatalog.getState().usePreset("full", "exposure.cloudflare");

    expect(useCatalog.getState().selected).not.toContain("exposure.cloudflare");
  });
});

describe("the combined resources against the probe", () => {
  it("warns when postgres is added to jetbrains on 4 GB", async () => {
    await ready();
    useInspection.setState({ probes: { "srv-1": SMALL_MACHINE } });

    useCatalog.getState().toggle("editor.jetbrains");

    expect(useCatalog.getState().warnings()).toEqual([]);

    useCatalog.getState().toggle("db.postgres");

    const warnings = useCatalog.getState().warnings();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toBe(
      "Les services choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
    );
  });
});

describe("secrets do not live here", () => {
  it("generates on selection what the manifest says to generate", async () => {
    const main = await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();

    expect(main.kept.get("db.postgres|app_password")).toBe("généré-1");
    expect(useCatalog.getState().secrets["db.postgres"]?.app_password).toEqual({
      filled: true,
      generated: true,
      revealed: false,
    });
  });

  it("never keeps the value, neither typed nor generated", async () => {
    const main = await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();
    await useCatalog
      .getState()
      .setSecret("db.postgres", "app_password", "s3cr3t-a-moi");
    await useCatalog
      .getState()
      .setSecret("ai.hermes", "providers.0", "clé-hermes");

    const dumped = JSON.stringify(useCatalog.getState());

    expect(dumped).not.toContain("s3cr3t-a-moi");
    expect(dumped).not.toContain("clé-hermes");
    expect(dumped).not.toContain("généré-");
    expect(main.kept.get("db.postgres|app_password")).toBe("s3cr3t-a-moi");
  });

  it("reveals once, then cannot anymore", async () => {
    await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();

    const first = await useCatalog
      .getState()
      .reveal("db.postgres", "app_password");
    const second = await useCatalog
      .getState()
      .reveal("db.postgres", "app_password");

    expect(first).toBe("généré-1");
    expect(second).toBeNull();
    expect(
      useCatalog.getState().secrets["db.postgres"]?.app_password?.revealed
    ).toBe(true);
    expect(JSON.stringify(useCatalog.getState())).not.toContain("généré-1");
  });

  it("lets the main process forget when the screen closes", async () => {
    const main = await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();
    await useCatalog.getState().forget();

    expect(main.kept.size).toBe(0);
    expect(useCatalog.getState().secrets).toEqual({});
  });

  it("does not pass a secret off as a configuration value", async () => {
    const main = await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();

    expect(useCatalog.getState().values["db.postgres"]).toEqual({});
    expect(JSON.stringify(useCatalog.getState().config())).not.toContain(
      "généré-1"
    );
    expect(main.kept.size).toBe(2);
  });
});

describe("the configuration weighed by the server", () => {
  it("sets on the fields what only the machine knew", async () => {
    const main = await ready();

    stubPupitre({
      ...main.api,
      checkInstall: () =>
        Promise.resolve({
          ok: true as const,
          result: {
            problems: [
              {
                module: "db.mysql",
                field: "buffer_pool",
                code: "max" as const,
              },
            ],
            warnings: [],
          },
        }),
    });

    const refused = await useCatalog.getState().check(["db.mysql"]);

    expect(refused.map((one) => one.field)).toEqual(["buffer_pool"]);
    expect(refused[0]?.declared?.key).toBe("buffer_pool");
  });

  it("ignores a field the app fills in itself on the way out", async () => {
    const main = await ready();

    stubPupitre({
      ...main.api,
      checkInstall: () =>
        Promise.resolve({
          ok: true as const,
          result: {
            problems: [
              {
                module: "exposure.cloudflare",
                field: "tunnel_id",
                code: "required" as const,
              },
            ],
            warnings: [],
          },
        }),
    });

    const refused = await useCatalog.getState().check(["exposure.cloudflare"]);

    expect(refused).toEqual([]);
  });

  it("lets the installation through when the bridge does not answer", async () => {
    const main = await ready();

    stubPupitre({
      ...main.api,
      checkInstall: () => Promise.reject(new Error("no handler")),
    });

    const refused = await useCatalog.getState().check(["db.postgres"]);

    expect(refused).toEqual([]);
  });
});

describe("the accounts and values read with the catalogue", () => {
  it("knows from loading which accounts are connected", async () => {
    stubPupitre({
      ...fakeMain().api,
      connectionsState: () =>
        Promise.resolve({
          "1password": { status: "absent" },
          backup: { status: "absent" },
          cloudflare: {
            account: { id: "acc-1", name: "Ada" },
            sealed: true,
            status: "connected",
          },
          github: { status: "absent" },
          neon: { status: "absent" },
          stripe: { status: "absent" },
          supabase: { status: "absent" },
          vercel: { status: "absent" },
          wrangler: { status: "absent" },
        }),
    });

    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("exposure.cloudflare");

    expect(
      useCatalog
        .getState()
        .problems()
        .filter((one) => one.code === "connection")
    ).toEqual([]);
  });

  it("tells what is missing when the account is not connected", async () => {
    stubPupitre(fakeMain().api);

    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("exposure.cloudflare");

    expect(
      useCatalog
        .getState()
        .problems()
        .map((one) => `${one.module}:${one.code}`)
    ).toContain("exposure.cloudflare:connection");
  });

  it("prefills what a development build knows, without overwriting an answer", async () => {
    stubPupitre({
      ...fakeMain().api,
      devDefaults: () =>
        Promise.resolve({
          fields: {
            "core.system": {
              git_email: "ada@pupitre.studio",
              git_name: "Ada Lovelace",
              nobody_declares_this: "ignored",
            },
          },
          server: { host: "", name: "", password: "", port: null, user: "" },
        }),
    });

    await useCatalog.getState().load("srv-1");

    expect(useCatalog.getState().values["core.system"]).toMatchObject({
      git_email: "ada@pupitre.studio",
      git_name: "Ada Lovelace",
    });
    expect(useCatalog.getState().values["core.system"]).not.toHaveProperty(
      "nobody_declares_this"
    );
    expect(
      useCatalog
        .getState()
        .problems()
        .filter((one) => one.module === "core.system")
    ).toEqual([]);

    useCatalog.getState().restore(["core.system"], {
      "core.system": { git_name: "Grace" },
    });

    expect(useCatalog.getState().values["core.system"]?.git_name).toBe("Grace");
  });
});
