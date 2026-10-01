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

describe("dependencies", () => {
  it("ticks what a module requires, step by step", () => {
    const chosen = select(MODULES, [], "editor.jetbrains");

    expect([...chosen].sort()).toEqual([
      "core.system",
      "editor.jetbrains",
      "runtime.java",
    ]);
  });

  it("removes what depended on the unticked module", () => {
    const chosen = select(MODULES, [], "editor.jetbrains");

    expect(deselect(MODULES, chosen, "runtime.java")).toEqual(["core.system"]);
  });

  it("does not untick a mandatory module", () => {
    const chosen = select(MODULES, [], "core.hardening");

    expect(deselect(MODULES, chosen, "core.system")).toEqual(chosen);
  });

  it("keeps the catalogue's mandatory modules no matter what", () => {
    expect(mandatory(MODULES)).toEqual(["core.system", "core.hardening"]);
  });
});

describe("conflits", () => {
  it("greys out the conflicting module with the reason, in both directions", () => {
    const chosen = select(MODULES, [], "exposure.cloudflare");
    const why = blocked(MODULES, chosen, SMALL_MACHINE);

    expect(why.get("exposure.caddy")).toBe(
      "En conflit avec « Cloudflare Tunnel », déjà sélectionné."
    );
    expect(why.has("exposure.cloudflare")).toBe(false);
  });

  it("refuses to tick a blocked module", () => {
    const chosen = select(MODULES, [], "exposure.cloudflare");

    expect(select(MODULES, chosen, "exposure.caddy")).toEqual(chosen);
  });

  it("greys out a module the machine's architecture does not support", () => {
    const why = blocked(MODULES, [], ARM_MACHINE);

    expect(why.get("tool.legacy")).toBe(
      "Ce service n'existe pas pour l'architecture arm64."
    );
    expect(blocked(MODULES, [], SMALL_MACHINE).has("tool.legacy")).toBe(false);
  });
});

describe("presets", () => {
  it("starts from the preset and completes its dependencies", () => {
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

describe("a preset against the machine receiving it", () => {
  const FULL = CATALOG.presets.find((p) => p.id === "full") as Preset;
  const WEB = CATALOG.presets.find((p) => p.id === "web-js") as Preset;

  it("carries the chosen exclusive module, and no other", () => {
    expect(withChoice(FULL, "exposure.caddy").modules).toContain(
      "exposure.caddy"
    );
    expect(withChoice(FULL, "exposure.caddy").modules).not.toContain(
      "exposure.cloudflare"
    );
    expect(withChoice(FULL, "tool.legacy")).toBe(FULL);
  });

  it("names what applying a preset would remove from the selection", () => {
    const chosen = fromPreset(MODULES, FULL, [], LARGE_MACHINE);

    expect(
      droppedBy(MODULES, WEB, chosen, [], LARGE_MACHINE).map(
        (module) => module.id
      )
    ).toContain("db.postgres");
    expect(droppedBy(MODULES, FULL, chosen, [], LARGE_MACHINE)).toEqual([]);
  });

  it("leaves out what the architecture does not support", () => {
    const wide: Preset = { ...FULL, modules: [...FULL.modules, "tool.legacy"] };

    expect(fromPreset(MODULES, wide, [], LARGE_MACHINE)).toContain(
      "tool.legacy"
    );
    expect(fromPreset(MODULES, wide, [], ARM_MACHINE)).not.toContain(
      "tool.legacy"
    );
  });

  it("leaves out what competes for the machine with an already placed module", () => {
    const exposing: Preset = {
      ...WEB,
      choose_one: undefined,
      modules: [...WEB.modules, "exposure.cloudflare"],
    };

    expect(
      fromPreset(MODULES, exposing, ["exposure.caddy"], LARGE_MACHINE)
    ).not.toContain("exposure.cloudflare");
  });

  it("refuses a whole module when what it requires is out of reach", () => {
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

describe("what a preset is worth here", () => {
  const WEB = CATALOG.presets.find((p) => p.id === "web-js") as Preset;
  const FULL = CATALOG.presets.find((p) => p.id === "full") as Preset;

  it("names what it adds, without the base every server receives", () => {
    const offer = presetOffer(MODULES, WEB, [], [], LARGE_MACHINE);

    expect(offer.adds.map((one) => one.id)).toEqual([
      "runtime.node",
      "db.mysql",
      "editor.vscode",
    ]);
  });

  it("does not promise what the server already runs", () => {
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

  it("says it brings nothing when everything is already there", () => {
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

  it("pits only the exclusives this machine can still take", () => {
    const offer = presetOffer(
      MODULES,
      FULL,
      [],
      ["exposure.caddy"],
      LARGE_MACHINE
    );

    expect(offer.choices).toEqual([]);
  });

  it("knows it is applied, with or without the chosen exclusive", () => {
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

describe("searching for a service", () => {
  it("returns the whole catalogue when the phrase is empty", () => {
    expect(matching(MODULES, "   ")).toHaveLength(MODULES.length);
  });

  it("finds by name, ignoring case and accents", () => {
    expect(matching(MODULES, "MYSQL").map((one) => one.id)).toEqual([
      "db.mysql",
    ]);
    expect(matching(MODULES, "durcissement").map((one) => one.id)).toEqual([
      "core.hardening",
    ]);
  });

  it("finds by summary and by ID", () => {
    expect(matching(MODULES, "fail2ban").map((one) => one.id)).toEqual([
      "core.hardening",
    ]);
    expect(matching(MODULES, "exposure.").map((one) => one.id)).toEqual([
      "exposure.cloudflare",
      "exposure.caddy",
    ]);
  });

  it("narrows with each word instead of widening", () => {
    expect(matching(MODULES, "base de donnees").length).toBeLessThan(
      matching(MODULES, "base").length
    );
  });

  it("returns nothing rather than guessing", () => {
    expect(matching(MODULES, "kubernetes")).toEqual([]);
  });
});

describe("cumulative resources", () => {
  const base = select(MODULES, [], "core.hardening");
  const withJetbrains = select(MODULES, base, "editor.jetbrains");

  it("adds up what the chosen modules ask for", () => {
    expect(totals(MODULES, withJetbrains)).toEqual({
      ram_mb: 3904,
      disk_mb: 6150,
    });
  });

  it("warns when the cumulative memory exceeds the machine's", () => {
    const chosen = select(MODULES, withJetbrains, "db.postgres");

    expect(resourceWarnings(MODULES, withJetbrains, SMALL_MACHINE)).toEqual([]);

    const warnings = resourceWarnings(MODULES, chosen, SMALL_MACHINE);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("ram");
    expect(warnings[0]?.message).toBe(
      "Les services choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
    );
  });

  it("warns about disk with the probe's figures", () => {
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

  it("stays silent on a large machine", () => {
    expect(resourceWarnings(MODULES, withJetbrains, LARGE_MACHINE)).toEqual([]);
  });

  it("stays silent when no probe has measured the machine", () => {
    expect(resourceWarnings(MODULES, withJetbrains, null)).toEqual([]);
  });
});

describe("a newer catalogue", () => {
  it("weighs and configures a module the app does not know", () => {
    const chosen = select(CATALOG_NEXT.modules, [], "db.clickhouse");

    expect([...chosen].sort()).toEqual(["core.system", "db.clickhouse"]);
    expect(totals(CATALOG_NEXT.modules, chosen).ram_mb).toBe(2304);
    expect(
      fieldsOf(CATALOG_NEXT.modules, chosen).map((group) => group.module.id)
    ).toEqual(["core.system", "db.clickhouse"]);
  });

  it("files it in its category, without the app declaring it", () => {
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
  it("recognises a module whose manifest declares a secret", () => {
    const postgres = CATALOG.modules.find((m) => m.id === "db.postgres");

    expect(postgres && carriesSecret(postgres)).toBe(true);
  });

  it("lets through a module that declares none", () => {
    const node = CATALOG.modules.find((m) => m.id === "runtime.node");

    expect(node && carriesSecret(node)).toBe(false);
  });
});

describe("a catalogue opened on an already installed server", () => {
  const INSTALLED = ["core.system", "core.hardening", "runtime.node"];

  it("does not offer again the mandatory modules already in place", () => {
    expect(mandatory(CATALOG.modules, INSTALLED)).toEqual([]);
  });

  it("does not pull in dependencies the server already satisfies", () => {
    expect(select(CATALOG.modules, [], "db.postgres", INSTALLED)).toEqual([
      "db.postgres",
    ]);
  });

  it("pulls in those still missing", () => {
    expect(select(CATALOG.modules, [], "editor.jetbrains", INSTALLED)).toEqual([
      "runtime.java",
      "editor.jetbrains",
    ]);
  });

  it("greys out what competes for the machine with an already placed module", () => {
    const running = [...INSTALLED, "exposure.caddy"];
    const why = blocked(CATALOG.modules, [], null, running);

    expect(why.get("exposure.cloudflare")).toBe(
      "En conflit avec « Caddy », déjà sur ce serveur : retirez-le d'abord, depuis Services."
    );
    expect(select(CATALOG.modules, [], "exposure.cloudflare", running)).toEqual(
      []
    );
  });

  it("says a present module is already there, rather than offering it", () => {
    expect(
      blocked(CATALOG.modules, [], null, INSTALLED).get("runtime.node")
    ).toBe("Déjà installé sur ce serveur.");
  });

  it("reduces a preset to what remains to be placed", () => {
    const preset = CATALOG.presets.find((p) => p.id === "web-js");

    expect(preset && fromPreset(CATALOG.modules, preset, INSTALLED)).toEqual([
      "db.mysql",
      "editor.vscode",
    ]);
  });
});

describe("a selection resumed after the fact", () => {
  const RUNNING = ["core.system", "core.hardening", "runtime.node"];

  it("keeps the catalogue order, whatever the draft's order", () => {
    expect(
      restored(CATALOG.modules, ["editor.vscode", "runtime.node"])
    ).toEqual(["runtime.node", "editor.vscode"]);
  });

  it("drops what the catalogue no longer declares", () => {
    expect(
      restored(CATALOG.modules, ["db.clickhouse", "runtime.node"])
    ).toEqual(["runtime.node"]);
  });

  it("drops what the machine already runs", () => {
    expect(
      restored(CATALOG.modules, ["runtime.node", "db.mysql"], RUNNING)
    ).toEqual(["db.mysql"]);
  });
});

describe("what the selection refuses", () => {
  // Like the agent, a field with a manifest default is never missing.
  it("names the module and the field that no value fills", () => {
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

  it("asks for nothing when everything is filled", () => {
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

  it("counts a secret on the mark the main process returned", () => {
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
  it("refuses a value that does not have the shape the manifest declares", () => {
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
  it("asks for the connection of a module that declares one", () => {
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

describe("what is asked, and what is already settled", () => {
  const core = CATALOG.modules.find((one) => one.id === "core.system");
  const postgres = CATALOG.modules.find((one) => one.id === "db.postgres");
  const node = CATALOG.modules.find((one) => one.id === "runtime.node");

  it("asks for a required field with no value, leaves what has a default", () => {
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

  it("always asks for a secret, generated or not", () => {
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

  it("asks nothing of a runtime whose fields all have a default", () => {
    if (!node) {
      throw new Error("runtime.node manque au catalogue de test");
    }

    const split = splitFields(node.fields);

    expect(split.asked).toEqual([]);
    expect(split.kept.length).toBe(node.fields.length);
  });

  it("does not move a question once answered", () => {
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
