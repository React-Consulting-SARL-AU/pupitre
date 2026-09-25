import { describe, expect, it } from "bun:test";
import type { Manifest, Preset } from "@pupitre/shared/catalog";
import {
  ARM_MACHINE,
  CATALOG,
  CATALOG_NEXT,
  FULL_DISK_MACHINE,
  LARGE_MACHINE,
  SMALL_MACHINE,
} from "../../__tests__/catalog-fixtures";
import {
  asked,
  blocked,
  bringsNothing,
  byCategory,
  carriesSecret,
  deselect,
  droppedBy,
  fieldsOf,
  fromPreset,
  mandatory,
  matching,
  presetOffer,
  problemsOf,
  resourceWarnings,
  restored,
  select,
  splitFields,
  totals,
  withChoice,
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
      "Ce service n'existe pas pour l'architecture arm64."
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

describe("un préréglage contre la machine qui le reçoit", () => {
  const FULL = CATALOG.presets.find((p) => p.id === "full") as Preset;
  const WEB = CATALOG.presets.find((p) => p.id === "web-js") as Preset;

  it("porte le module exclusif choisi, et aucun autre", () => {
    expect(withChoice(FULL, "exposure.caddy").modules).toContain(
      "exposure.caddy"
    );
    expect(withChoice(FULL, "exposure.caddy").modules).not.toContain(
      "exposure.cloudflare"
    );
    expect(withChoice(FULL, "tool.legacy")).toBe(FULL);
  });

  it("nomme ce qu'appliquer un préréglage retirerait de la sélection", () => {
    const chosen = fromPreset(MODULES, FULL, [], LARGE_MACHINE);

    expect(
      droppedBy(MODULES, WEB, chosen, [], LARGE_MACHINE).map(
        (module) => module.id
      )
    ).toContain("db.postgres");
    expect(droppedBy(MODULES, FULL, chosen, [], LARGE_MACHINE)).toEqual([]);
  });

  it("laisse de côté ce que l'architecture ne porte pas", () => {
    const wide: Preset = { ...FULL, modules: [...FULL.modules, "tool.legacy"] };

    expect(fromPreset(MODULES, wide, [], LARGE_MACHINE)).toContain(
      "tool.legacy"
    );
    expect(fromPreset(MODULES, wide, [], ARM_MACHINE)).not.toContain(
      "tool.legacy"
    );
  });

  it("laisse de côté ce qui se dispute la machine avec un module déjà posé", () => {
    const exposing: Preset = {
      ...WEB,
      choose_one: undefined,
      modules: [...WEB.modules, "exposure.cloudflare"],
    };

    expect(
      fromPreset(MODULES, exposing, ["exposure.caddy"], LARGE_MACHINE)
    ).not.toContain("exposure.cloudflare");
  });

  it("refuse un module entier quand ce qu'il exige est hors de portée", () => {
    const dashboard: Manifest = {
      arch: ["amd64", "arm64"],
      category: "tool",
      conflicts: [],
      fields: [],
      id: "tool.dashboard",
      mandatory: false,
      name: "Tableau de bord",
      requires: ["tool.legacy"],
      resources: { disk_mb: 100, ram_mb: 64 },
      runs: false,
      since: "0.6.0",
      summary: "S'appuie sur le binaire hérité.",
    };
    const wider = [...MODULES, dashboard];

    expect(select(wider, [], "tool.dashboard", [], LARGE_MACHINE)).toEqual([
      "core.system",
      "tool.legacy",
      "tool.dashboard",
    ]);
    expect(select(wider, [], "tool.dashboard", [], ARM_MACHINE)).toEqual([]);
  });
});

describe("ce qu'un préréglage vaut ici", () => {
  const WEB = CATALOG.presets.find((p) => p.id === "web-js") as Preset;
  const FULL = CATALOG.presets.find((p) => p.id === "full") as Preset;

  it("nomme ce qu'il ajoute, sans le socle que tout serveur reçoit", () => {
    const offer = presetOffer(MODULES, WEB, [], [], LARGE_MACHINE);

    expect(offer.adds.map((one) => one.id)).toEqual([
      "runtime.node",
      "db.mysql",
      "editor.vscode",
    ]);
  });

  it("ne promet pas ce que le serveur fait déjà tourner", () => {
    const offer = presetOffer(
      MODULES,
      WEB,
      [],
      ["core.system", "core.hardening", "runtime.node"],
      LARGE_MACHINE
    );

    expect(offer.adds.map((one) => one.id)).toEqual([
      "db.mysql",
      "editor.vscode",
    ]);
  });

  it("dit qu'il n'apporte rien quand tout est déjà là", () => {
    const offer = presetOffer(
      MODULES,
      WEB,
      [],
      [
        "core.system",
        "core.hardening",
        "runtime.node",
        "db.mysql",
        "editor.vscode",
      ],
      LARGE_MACHINE
    );

    expect(bringsNothing(offer)).toBe(true);
  });

  it("n'oppose que les exclusifs que cette machine peut encore prendre", () => {
    const offer = presetOffer(
      MODULES,
      FULL,
      [],
      ["exposure.caddy"],
      LARGE_MACHINE
    );

    expect(offer.choices).toEqual([]);
  });

  it("se sait appliqué, avec ou sans l'exclusif choisi", () => {
    const base = fromPreset(MODULES, FULL, [], LARGE_MACHINE);
    const withOne = select(MODULES, base, "exposure.caddy", [], LARGE_MACHINE);

    expect(presetOffer(MODULES, FULL, base, [], LARGE_MACHINE).applied).toBe(
      true
    );
    expect(presetOffer(MODULES, FULL, withOne, [], LARGE_MACHINE).applied).toBe(
      true
    );
    expect(
      presetOffer(MODULES, FULL, base.slice(1), [], LARGE_MACHINE).applied
    ).toBe(false);
  });
});

describe("chercher un service", () => {
  it("rend tout le catalogue quand la phrase est vide", () => {
    expect(matching(MODULES, "   ")).toHaveLength(MODULES.length);
  });

  it("trouve par le nom, sans casse ni accents", () => {
    expect(matching(MODULES, "MYSQL").map((one) => one.id)).toEqual([
      "db.mysql",
    ]);
    expect(matching(MODULES, "durcissement").map((one) => one.id)).toEqual([
      "core.hardening",
    ]);
  });

  it("trouve par le résumé et par l'identifiant", () => {
    expect(matching(MODULES, "fail2ban").map((one) => one.id)).toEqual([
      "core.hardening",
    ]);
    expect(matching(MODULES, "exposure.").map((one) => one.id)).toEqual([
      "exposure.cloudflare",
      "exposure.caddy",
    ]);
  });

  it("resserre à chaque mot au lieu d'élargir", () => {
    expect(matching(MODULES, "base de donnees").length).toBeLessThan(
      matching(MODULES, "base").length
    );
  });

  it("ne rend rien plutôt que de deviner", () => {
    expect(matching(MODULES, "kubernetes")).toEqual([]);
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
      "Les services choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
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
      "Les services choisis demandent 6,0 Go de disque ; il en reste 3,5 sur cette machine."
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

describe("un catalogue ouvert sur un serveur déjà installé", () => {
  const INSTALLED = ["core.system", "core.hardening", "runtime.node"];

  it("ne repropose pas les modules obligatoires déjà en place", () => {
    expect(mandatory(CATALOG.modules, INSTALLED)).toEqual([]);
  });

  it("n'entraîne pas les dépendances que le serveur satisfait déjà", () => {
    expect(select(CATALOG.modules, [], "db.postgres", INSTALLED)).toEqual([
      "db.postgres",
    ]);
  });

  it("entraîne celles qui manquent encore", () => {
    expect(select(CATALOG.modules, [], "editor.jetbrains", INSTALLED)).toEqual([
      "runtime.java",
      "editor.jetbrains",
    ]);
  });

  it("grise ce qui se dispute la machine avec un module déjà en place", () => {
    const running = [...INSTALLED, "exposure.caddy"];
    const why = blocked(CATALOG.modules, [], null, running);

    expect(why.get("exposure.cloudflare")).toBe(
      "En conflit avec « Caddy », déjà sur ce serveur : retirez-le d'abord, depuis Services."
    );
    expect(select(CATALOG.modules, [], "exposure.cloudflare", running)).toEqual(
      []
    );
  });

  it("dit d'un module présent qu'il est déjà là, plutôt que de le proposer", () => {
    expect(
      blocked(CATALOG.modules, [], null, INSTALLED).get("runtime.node")
    ).toBe("Déjà installé sur ce serveur.");
  });

  it("réduit un préréglage à ce qu'il reste à poser", () => {
    const preset = CATALOG.presets.find((p) => p.id === "web-js");

    expect(preset && fromPreset(CATALOG.modules, preset, INSTALLED)).toEqual([
      "db.mysql",
      "editor.vscode",
    ]);
  });
});

describe("une sélection reprise après coup", () => {
  const RUNNING = ["core.system", "core.hardening", "runtime.node"];

  it("garde l'ordre du catalogue, quel que soit celui du brouillon", () => {
    expect(
      restored(CATALOG.modules, ["editor.vscode", "runtime.node"])
    ).toEqual(["runtime.node", "editor.vscode"]);
  });

  it("laisse tomber ce que le catalogue ne déclare plus", () => {
    expect(
      restored(CATALOG.modules, ["db.clickhouse", "runtime.node"])
    ).toEqual(["runtime.node"]);
  });

  it("laisse tomber ce que la machine fait déjà tourner", () => {
    expect(
      restored(CATALOG.modules, ["runtime.node", "db.mysql"], RUNNING)
    ).toEqual(["db.mysql"]);
  });
});

describe("ce que la sélection refuse", () => {
  // Like the agent, a field with a manifest default is never missing.
  it("nomme le module et le champ qu'aucune valeur ne remplit", () => {
    const problems = problemsOf(
      MODULES,
      ["core.system"],
      { "core.system": { timezone: "Europe/Paris", git_name: "  " } },
      {}
    );

    expect(problems.map((entry) => `${entry.module}.${entry.field}`)).toEqual([
      "core.system.git_name",
      "core.system.git_email",
    ]);
  });

  it("ne réclame rien quand tout est rempli", () => {
    const problems = problemsOf(
      MODULES,
      ["core.system", "core.hardening"],
      {
        "core.system": {
          timezone: "Europe/Paris",
          git_name: "Jordan",
          git_email: "jordan@example.org",
          projects_dir: "/home/dev/projects",
        },
      },
      {}
    );

    expect(problems).toEqual([]);
  });

  it("compte un secret sur la marque que le processus principal a rendue", () => {
    const values = { "db.postgres": {} };
    const before = problemsOf(MODULES, ["db.postgres"], values, {});

    const after = problemsOf(MODULES, ["db.postgres"], values, {
      "db.postgres": {
        app_password: { filled: true, generated: true, revealed: false },
        remote_password: { filled: true, generated: true, revealed: false },
      },
    });

    expect(before.map((entry) => entry.field)).toEqual([
      "app_password",
      "remote_password",
    ]);
    expect(after).toEqual([]);
  });

  // Same format rules as the agent, so both refuse the same shapes.
  it("refuse une valeur qui n'a pas la forme que le manifeste déclare", () => {
    const problems = problemsOf(
      MODULES,
      ["core.system"],
      {
        "core.system": {
          timezone: "Europe/Paris",
          git_name: "Jordan",
          git_email: "pas-une-adresse",
          projects_dir: "projets",
        },
      },
      {}
    );

    expect(problems.map((entry) => `${entry.field}:${entry.code}`)).toEqual([
      "git_email:format",
      "projects_dir:format",
    ]);
  });

  // A missing connection is reported alone, before any field it would unlock.
  it("réclame la connexion d'un module qui en déclare une", () => {
    const problems = problemsOf(
      MODULES,
      ["exposure.cloudflare"],
      {},
      {},
      () => false
    );

    expect(problems.map((entry) => entry.code)).toEqual(["connection"]);
  });
});

describe("ce qui est demandé, et ce qui est déjà réglé", () => {
  const core = CATALOG.modules.find((one) => one.id === "core.system");
  const postgres = CATALOG.modules.find((one) => one.id === "db.postgres");
  const node = CATALOG.modules.find((one) => one.id === "runtime.node");

  it("demande un champ requis sans valeur, laisse ce qui a un défaut", () => {
    if (!core) {
      throw new Error("core.system manque au catalogue de test");
    }

    const split = splitFields(core.fields);

    expect(split.asked.map((field) => field.key)).toEqual([
      "git_name",
      "git_email",
    ]);
    expect(split.kept.map((field) => field.key)).toEqual([
      "timezone",
      "projects_dir",
    ]);
  });

  it("demande toujours un secret, généré ou non", () => {
    if (!postgres) {
      throw new Error("db.postgres manque au catalogue de test");
    }

    const split = splitFields(postgres.fields);

    expect(split.asked.map((field) => field.key)).toEqual([
      "app_password",
      "remote_password",
    ]);
    expect(split.kept).toEqual([]);
  });

  it("ne demande rien d'un runtime dont tout a un défaut", () => {
    if (!node) {
      throw new Error("runtime.node manque au catalogue de test");
    }

    const split = splitFields(node.fields);

    expect(split.asked).toEqual([]);
    expect(split.kept.length).toBe(node.fields.length);
  });

  it("ne déplace pas une question une fois répondue", () => {
    if (!core) {
      throw new Error("core.system manque au catalogue de test");
    }

    const name = core.fields.find((field) => field.key === "git_name");
    const timezone = core.fields.find((field) => field.key === "timezone");

    if (!(name && timezone)) {
      throw new Error("le socle de test manque de champs");
    }

    expect(asked(name)).toBe(true);
    expect(asked(timezone)).toBe(false);
  });
});
