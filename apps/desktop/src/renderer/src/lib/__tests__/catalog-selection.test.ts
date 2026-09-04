import { describe, expect, it } from "bun:test";
import {
  ARM_MACHINE,
  CATALOG,
  CATALOG_NEXT,
  FULL_DISK_MACHINE,
  LARGE_MACHINE,
  SMALL_MACHINE,
} from "../../__tests__/catalog-fixtures";
import {
  blocked,
  byCategory,
  carriesSecret,
  deselect,
  fieldsOf,
  fromPreset,
  mandatory,
  resourceWarnings,
  select,
  totals,
} from "../catalog-selection";

const MODULES = CATALOG.modules;

describe("dépendances", () => {
  it("coche ce qu'un module exige, de proche en proche", () => {
    const chosen = select(MODULES, [], "editor.jetbrains");

    expect([...chosen].sort()).toEqual([
      "core.system",
      "editor.jetbrains",
      "runtime.java",
    ]);
  });

  it("retire ce qui dépendait du module décoché", () => {
    const chosen = select(MODULES, [], "editor.jetbrains");

    expect(deselect(MODULES, chosen, "runtime.java")).toEqual(["core.system"]);
  });

  it("ne décoche pas un module obligatoire", () => {
    const chosen = select(MODULES, [], "core.hardening");

    expect(deselect(MODULES, chosen, "core.system")).toEqual(chosen);
  });

  it("garde les obligatoires du catalogue quoi qu'il arrive", () => {
    expect(mandatory(MODULES)).toEqual(["core.system", "core.hardening"]);
  });
});

describe("conflits", () => {
  it("grise le module en conflit avec la raison, dans les deux sens", () => {
    const chosen = select(MODULES, [], "exposure.cloudflare");
    const why = blocked(MODULES, chosen, SMALL_MACHINE);

    expect(why.get("exposure.caddy")).toBe(
      "En conflit avec « Cloudflare Tunnel », déjà sélectionné."
    );
    expect(why.has("exposure.cloudflare")).toBe(false);
  });

  it("refuse de cocher un module bloqué", () => {
    const chosen = select(MODULES, [], "exposure.cloudflare");

    expect(select(MODULES, chosen, "exposure.caddy")).toEqual(chosen);
  });

  it("grise un module que l'architecture de la machine ne porte pas", () => {
    const why = blocked(MODULES, [], ARM_MACHINE);

    expect(why.get("tool.legacy")).toBe(
      "Ce module n'existe pas pour l'architecture arm64."
    );
    expect(blocked(MODULES, [], SMALL_MACHINE).has("tool.legacy")).toBe(false);
  });
});

describe("préréglages", () => {
  it("part du préréglage et complète ses dépendances", () => {
    const preset = CATALOG.presets.find((p) => p.id === "web-js") ?? {
      id: "web-js" as const,
      name: "Web JavaScript",
      modules: [],
    };

    expect([...fromPreset(MODULES, preset)].sort()).toEqual([
      "core.hardening",
      "core.system",
      "db.mysql",
      "editor.vscode",
      "runtime.node",
    ]);
  });
});

describe("ressources cumulées", () => {
  const base = select(MODULES, [], "core.hardening");
  const withJetbrains = select(MODULES, base, "editor.jetbrains");

  it("additionne ce que les modules choisis demandent", () => {
    expect(totals(MODULES, withJetbrains)).toEqual({
      ram_mb: 3904,
      disk_mb: 6150,
    });
  });

  it("avertit quand la mémoire cumulée dépasse celle de la machine", () => {
    const chosen = select(MODULES, withJetbrains, "db.postgres");

    expect(resourceWarnings(MODULES, withJetbrains, SMALL_MACHINE)).toEqual([]);

    const warnings = resourceWarnings(MODULES, chosen, SMALL_MACHINE);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("ram");
    expect(warnings[0]?.message).toBe(
      "Les modules choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
    );
  });

  it("avertit sur le disque avec les chiffres de la sonde", () => {
    const warnings = resourceWarnings(
      MODULES,
      withJetbrains,
      FULL_DISK_MACHINE
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("disk");
    expect(warnings[0]?.message).toBe(
      "Les modules choisis demandent 6,0 Go de disque ; il en reste 3,5 sur cette machine."
    );
  });

  it("se tait sur une machine large", () => {
    expect(resourceWarnings(MODULES, withJetbrains, LARGE_MACHINE)).toEqual([]);
  });

  it("se tait quand aucune sonde n'a mesuré la machine", () => {
    expect(resourceWarnings(MODULES, withJetbrains, null)).toEqual([]);
  });
});

describe("un catalogue plus récent", () => {
  it("pèse et configure un module que l'app ne connaît pas", () => {
    const chosen = select(CATALOG_NEXT.modules, [], "db.clickhouse");

    expect([...chosen].sort()).toEqual(["core.system", "db.clickhouse"]);
    expect(totals(CATALOG_NEXT.modules, chosen).ram_mb).toBe(2304);
    expect(
      fieldsOf(CATALOG_NEXT.modules, chosen).map((group) => group.module.id)
    ).toEqual(["core.system", "db.clickhouse"]);
  });

  it("le range dans sa catégorie, sans que l'app la déclare", () => {
    const databases = byCategory(CATALOG_NEXT.modules).find(
      (group) => group.category === "database"
    );

    expect(databases?.modules.map((m) => m.id)).toEqual([
      "db.mysql",
      "db.postgres",
      "db.clickhouse",
    ]);
  });
});

describe("carriesSecret", () => {
  it("reconnaît un module dont le manifeste déclare un secret", () => {
    const postgres = CATALOG.modules.find((m) => m.id === "db.postgres");

    expect(postgres && carriesSecret(postgres)).toBe(true);
  });

  it("laisse passer un module qui n'en déclare aucun", () => {
    const node = CATALOG.modules.find((m) => m.id === "runtime.node");

    expect(node && carriesSecret(node)).toBe(false);
  });
});
