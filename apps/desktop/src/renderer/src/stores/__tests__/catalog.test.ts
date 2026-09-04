import { beforeEach, describe, expect, it } from "bun:test";
import type { SecretMarks } from "@shared/secrets";
import {
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

        return Promise.resolve(mark());
      },
      generateInstallSecret: (
        _serverId: string,
        moduleId: string,
        key: string
      ) => {
        generated += 1;
        kept.set(`${moduleId}|${key}`, `généré-${generated}`);
        madeHere.add(`${moduleId}|${key}`);

        return Promise.resolve(mark());
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
      "Les modules choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
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
