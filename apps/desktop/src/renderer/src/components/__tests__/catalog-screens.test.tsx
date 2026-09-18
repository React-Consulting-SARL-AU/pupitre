import { describe, expect, it } from "bun:test";
import type {
  CatalogResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ARM_MACHINE,
  CATALOG,
  CATALOG_NEXT,
  LARGE_MACHINE,
  SMALL_MACHINE,
} from "../../__tests__/catalog-fixtures";
import {
  blocked,
  fromPreset,
  presetOffer,
  resourceWarnings,
  select,
} from "../../lib/catalog-selection";
import { CatalogChoice } from "../catalog/catalog-choice";
import { CatalogPresetChoice } from "../catalog/catalog-preset-choice";

/**
 * The catalogue as it is drawn, from a catalogue and a probe and nothing else.
 * `react-dom/server` is enough: the screen holds no state of its own, the store
 * above it does.
 */

function screen(
  catalog: CatalogResult,
  selected: readonly string[],
  probe: ProbeResult,
  { query = "", installed = [] as readonly string[] } = {}
): string {
  return renderToStaticMarkup(
    <CatalogChoice
      blocked={blocked(catalog.modules, selected, probe, installed)}
      catalog={catalog}
      installed={installed}
      probe={probe}
      query={query}
      selected={selected}
      warnings={resourceWarnings(catalog.modules, selected, probe)}
    />
  );
}

/** The opening tag that carries this attribute, whatever order it renders in. */
function tag(html: string, attribute: string, value: string): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<[a-z]+[^>]*${attribute}="${escaped}"[^>]*>`)
  );

  return match?.[0] ?? "";
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

describe("les préréglages en tête", () => {
  const html = screen(
    CATALOG,
    ["core.system", "core.hardening"],
    LARGE_MACHINE
  );

  it("propose les trois du catalogue, dans l'ordre reçu", () => {
    expect(
      [...html.matchAll(/data-preset="([^"]+)"/g)].map((m) => m[1])
    ).toEqual(["web-js", "full", "minimal"]);
  });

  it("nomme les trois du contrat en français", () => {
    expect(text(html)).toContain("Web JavaScript");
    expect(text(html)).toContain("Tout le catalogue");
    expect(text(html)).toContain("Minimal");
  });
});

describe("les catégories et leurs modules", () => {
  const html = screen(
    CATALOG,
    ["core.system", "core.hardening"],
    LARGE_MACHINE
  );

  it("groupe par catégorie, dans l'ordre du contrat", () => {
    expect(
      [...html.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1])
    ).toEqual([
      "core",
      "runtime",
      "database",
      "ai",
      "editor",
      "exposure",
      "tool",
    ]);
  });

  it("montre le nom et le résumé de chaque module, sans ses chiffres", () => {
    const readable = text(html);

    expect(readable).toContain("PostgreSQL 17");
    expect(readable).toContain(
      "Local seulement, rôles applicatif et distant, import de dumps."
    );
    expect(tag(html, "data-module", "db.postgres")).not.toContain("900");
  });

  it("dit ce que le choix pèse, une fois, contre la machine", () => {
    expect(html).toContain('data-resources="true"');
    expect(text(html)).toContain("Mémoire 320 Mo sur");
  });

  it("nomme ce qu'un préréglage apporte plutôt que de le compter", () => {
    expect(text(html)).toContain("Node.js, MySQL 8, VS Code Remote");
  });

  it("ne promet pas à un serveur ce qu'il fait déjà tourner", () => {
    const again = screen(CATALOG, [], LARGE_MACHINE, {
      installed: ["core.system", "core.hardening", "runtime.node"],
    });

    expect(text(again)).toContain("MySQL 8, VS Code Remote");
    expect(text(again)).not.toContain("Node.js, MySQL 8");
  });

  it("grise le préréglage qui n'apporte plus rien, et dit pourquoi", () => {
    const done = screen(CATALOG, [], LARGE_MACHINE, {
      installed: [
        "core.system",
        "core.hardening",
        "runtime.node",
        "db.mysql",
        "editor.vscode",
      ],
    });

    expect(tag(done, "data-preset", "web-js")).toContain("disabled");
    expect(text(done)).toContain(
      "Tout ce qu'il apporte est déjà sur ce serveur."
    );
  });

  it("marque celui qui est appliqué plutôt que de laisser le clic sans réponse", () => {
    const preset = CATALOG.presets.find((one) => one.id === "web-js");
    const applied = screen(
      CATALOG,
      preset ? fromPreset(CATALOG.modules, preset, [], LARGE_MACHINE) : [],
      LARGE_MACHINE
    );

    expect(tag(applied, "data-preset", "web-js")).toContain(
      'aria-pressed="true"'
    );
    expect(tag(applied, "data-preset", "minimal")).toContain(
      'aria-pressed="false"'
    );
  });

  it("pose le logo en couleurs quand le module en a un", () => {
    expect(html).toContain('data-logo="db.postgres"');
    expect(html).toContain("PostgreSQL");
  });

  it("retombe sur une icône sobre quand aucun logo n'est licite", () => {
    expect(html).toContain('data-logo-fallback="core.system"');
    expect(html).not.toContain('data-logo="core.system"');
  });

  it("coche et verrouille les modules obligatoires", () => {
    const card = tag(html, "data-module", "core.system");

    expect(card).toContain('data-selected="true"');
    expect(card).toContain('data-locked="true"');
  });
});

describe("ce qui est hors de portée", () => {
  it("grise un module en conflit et dit lequel", () => {
    const chosen = select(CATALOG.modules, [], "exposure.cloudflare");
    const html = screen(CATALOG, chosen, LARGE_MACHINE);

    expect(tag(html, "data-module", "exposure.caddy")).toContain(
      'data-blocked="true"'
    );
    expect(text(html)).toContain(
      "En conflit avec « Cloudflare Tunnel », déjà sélectionné."
    );
  });

  it("grise un module que l'architecture de la machine ne porte pas", () => {
    const html = screen(CATALOG, ["core.system"], ARM_MACHINE);

    expect(tag(html, "data-module", "tool.legacy")).toContain(
      'data-blocked="true"'
    );
    expect(text(html)).toContain(
      "Ce service n'existe pas pour l'architecture arm64."
    );
  });
});

describe("les ressources cumulées", () => {
  it("reste muet tant que la machine suffit", () => {
    const base = select(CATALOG.modules, [], "core.hardening");
    const chosen = select(CATALOG.modules, base, "editor.jetbrains");
    const html = screen(CATALOG, chosen, SMALL_MACHINE);

    expect(html).not.toContain('data-tone="warn"');
  });

  it("avertit quand postgres s'ajoute à jetbrains sur 4 Go", () => {
    const base = select(CATALOG.modules, [], "core.hardening");
    const withJetbrains = select(CATALOG.modules, base, "editor.jetbrains");
    const chosen = select(CATALOG.modules, withJetbrains, "db.postgres");
    const html = screen(CATALOG, chosen, SMALL_MACHINE);

    expect(html).toContain('data-tone="warn"');
    expect(text(html)).toContain(
      "Les services choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
    );
  });
});

describe("un module que l'agent vient d'ajouter", () => {
  it("apparaît dans sa catégorie sans une ligne de code de plus", () => {
    const before = screen(CATALOG, ["core.system"], LARGE_MACHINE);
    const after = screen(CATALOG_NEXT, ["core.system"], LARGE_MACHINE);

    expect(before).not.toContain('data-module="db.clickhouse"');
    expect(after).toContain('data-module="db.clickhouse"');
    expect(text(after)).toContain("ClickHouse");
    expect(text(after)).toContain(
      "Base analytique en colonnes, locale, pour les tableaux de bord."
    );
    expect(after).toContain('data-logo-fallback="db.clickhouse"');
  });
});

describe("un préréglage qui nomme des modules exclusifs", () => {
  const preset = CATALOG.presets.find((one) => one.choose_one);

  function question(installed: readonly string[] = []): string {
    if (!preset) {
      throw new Error(
        "le catalogue de test ne porte aucun préréglage exclusif"
      );
    }

    const offer = presetOffer(
      CATALOG.modules,
      preset,
      [],
      installed,
      LARGE_MACHINE
    );

    return renderToStaticMarkup(
      <CatalogPresetChoice
        choices={offer.choices}
        onCancel={() => undefined}
        onChoose={() => undefined}
        preset={preset}
      />
    );
  }

  it("demande lequel prendre plutôt que de choisir à la place du lecteur", () => {
    const html = question();

    for (const id of preset?.choose_one ?? []) {
      expect(html).toContain(`data-preset-option="${id}"`);
    }

    expect(html).toContain('role="radiogroup"');
  });

  /** Exposing nothing is a state of its own, not a reason to cancel the preset. */
  it("laisse n'en prendre aucun sans abandonner le préréglage", () => {
    expect(question()).toContain('data-preset-option="none"');
  });

  it("n'oppose pas un module que le serveur fait déjà tourner", () => {
    const html = question(["exposure.caddy"]);

    expect(html).not.toContain('value="exposure.caddy"');
    expect(html).not.toContain('value="exposure.cloudflare"');
  });

  /** A preset that carried one of them would be choosing; one that carried none would leave a hole. */
  it("ne porte lui-même aucun des modules qu'il oppose", () => {
    for (const id of preset?.choose_one ?? []) {
      expect(preset?.modules).not.toContain(id);
    }
  });
});

describe("chercher un service dans le catalogue", () => {
  it("offre le champ, et compte ce qu'il laisse", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "mysql" });

    expect(html).toContain('data-catalog-search="true"');
    expect(html).toContain('data-search-found="1"');
  });

  it("ne garde que les catégories qui ont encore quelque chose", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "sql" });

    expect(
      [...html.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1])
    ).toEqual(["database"]);
    expect(html).toContain('data-module="db.mysql"');
    expect(html).toContain('data-module="db.postgres"');
    expect(html).not.toContain('data-module="runtime.node"');
  });

  /** The presets answer « what should I install »; a name already answers it. */
  it("retire les préréglages tant qu'une phrase est tapée", () => {
    expect(screen(CATALOG, [], LARGE_MACHINE)).toContain('data-preset="full"');
    expect(
      screen(CATALOG, [], LARGE_MACHINE, { query: "mysql" })
    ).not.toContain('data-preset="full"');
  });

  it("dit qu'il n'a rien trouvé, avec la phrase cherchée", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "kubernetes" });

    expect(text(html)).toContain("Aucun service ne répond à « kubernetes ».");
    expect(html).not.toContain("data-category=");
  });
});
