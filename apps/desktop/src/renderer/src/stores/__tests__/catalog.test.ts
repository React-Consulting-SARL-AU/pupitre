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

/**
 * A main process reduced to what the catalogue screens ask of it: it answers
 * the `catalog` command and keeps the secrets. The values it keeps never leave
 * it except for one reveal, exactly as the real one behaves.
 */
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

describe("le catalogue vient de l'agent", () => {
  it("garde ce que la commande a renvoyé, sans y toucher", async () => {
    await ready();

    const state = useCatalog.getState().catalog;

    expect(state.status).toBe("ready");
    expect(state.status === "ready" && state.catalog).toEqual(CATALOG);
  });

  it("garde l'erreur et son remède tels quels", async () => {
    stubPupitre(fakeMain().api);

    await useCatalog.getState().load("srv-inconnu");

    expect(useCatalog.getState().catalog).toMatchObject({
      status: "failed",
      error: { fix: "Choisis un serveur dans les réglages." },
    });
  });

  it("coche les obligatoires du catalogue dès qu'il arrive", async () => {
    await ready();

    expect(useCatalog.getState().selected).toEqual([
      "core.system",
      "core.hardening",
    ]);
  });

  it("montre un module que l'app ne connaît pas, sans une ligne de plus", async () => {
    await ready(CATALOG_NEXT);

    const state = useCatalog.getState().catalog;
    const ids =
      state.status === "ready" ? state.catalog.modules.map((m) => m.id) : [];

    expect(ids).toContain("db.clickhouse");

    useCatalog.getState().toggle("db.clickhouse");

    expect(useCatalog.getState().selected).toContain("db.clickhouse");
  });
});

describe("la sélection", () => {
  it("entraîne les dépendances et libère les dépendants", async () => {
    await ready();

    useCatalog.getState().toggle("editor.jetbrains");

    expect(useCatalog.getState().selected).toContain("runtime.java");

    useCatalog.getState().toggle("runtime.java");

    expect(useCatalog.getState().selected).not.toContain("editor.jetbrains");
  });

  it("pose les valeurs par défaut des champs du module choisi", async () => {
    await ready();

    useCatalog.getState().toggle("db.mysql");

    expect(useCatalog.getState().values["db.mysql"]).toEqual({
      engine: "mysql",
      buffer_pool: 512,
    });
  });

  /**
   * Deferring is the reader saying they will answer later: the questions stop
   * being weighed, and the install goes on without them rather than refusing.
   */
  it("cesse de peser un service remis à plus tard, et le reprend", async () => {
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

    // What was typed stays typed: taking the questions back up finds the form
    // as it was left.
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

  it("part d'un préréglage du catalogue", async () => {
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

  /** A preset ticking what the machine cannot run is an install refused later. */
  it("ne coche pas, par préréglage, ce que l'architecture ne porte pas", async () => {
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

  it("ne coche pas non plus ce qui se dispute la machine avec un module déjà posé", async () => {
    const main = fakeMain(CATALOG);
    stubPupitre(main.api);
    await useCatalog.getState().load("srv-1", ["exposure.caddy"]);

    useCatalog.getState().usePreset("full", "exposure.cloudflare");

    expect(useCatalog.getState().selected).not.toContain("exposure.cloudflare");
  });
});

describe("les ressources cumulées face à la sonde", () => {
  it("avertit quand postgres s'ajoute à jetbrains sur 4 Go", async () => {
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

describe("les secrets ne vivent pas ici", () => {
  it("génère à la sélection ce que le manifeste dit de générer", async () => {
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

  it("ne garde jamais la valeur, ni saisie ni générée", async () => {
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

  it("révèle une fois, puis ne peut plus", async () => {
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

  it("laisse le processus principal oublier quand l'écran se ferme", async () => {
    const main = await ready();

    useCatalog.getState().toggle("db.postgres");
    await useCatalog.getState().settled();
    await useCatalog.getState().forget();

    expect(main.kept.size).toBe(0);
    expect(useCatalog.getState().secrets).toEqual({});
  });

  it("ne fait pas passer un secret pour une valeur de configuration", async () => {
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

describe("la configuration pesée par le serveur", () => {
  it("pose sur les champs ce que la machine seule savait", async () => {
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

  it("ignore un champ que l'app remplit elle-même à la sortie", async () => {
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

  it("laisse passer l'installation quand le pont ne répond pas", async () => {
    const main = await ready();
    stubPupitre({
      ...main.api,
      checkInstall: () => Promise.reject(new Error("no handler")),
    });

    const refused = await useCatalog.getState().check(["db.postgres"]);

    expect(refused).toEqual([]);
  });
});

describe("les comptes et les valeurs lues avec le catalogue", () => {
  /**
   * The accounts used to be read when a connection card was on screen, so the
   * configuration weighed a module as unconnected until its own panel had been
   * visited — and said three services were still to be configured.
   */
  it("sait dès le chargement quels comptes sont connectés", async () => {
    stubPupitre({
      ...fakeMain().api,
      connectionsState: () =>
        Promise.resolve({
          "1password": { status: "absent" },
          cloudflare: {
            account: { id: "acc-1", name: "Ada" },
            sealed: true,
            status: "connected",
          },
          github: { status: "absent" },
          neon: { status: "absent" },
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

  it("dit ce qui manque quand le compte n'est pas connecté", async () => {
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

  it("préremplit ce qu'un build de développement sait, sans écraser une réponse", async () => {
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
