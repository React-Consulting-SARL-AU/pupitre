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
import { blocked, resourceWarnings, select } from "../../lib/catalog-selection";
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
  probe: ProbeResult
): string {
  return renderToStaticMarkup(
    <CatalogChoice
      blocked={blocked(catalog.modules, selected, probe)}
      catalog={catalog}
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

  it("montre le nom, le résumé et les ressources de chaque module", () => {
    const readable = text(html);

    expect(readable).toContain("PostgreSQL 17");
    expect(readable).toContain(
      "Local seulement, rôles applicatif et distant, import de dumps."
    );
    expect(readable).toContain("1024 Mo");
    expect(readable).toContain("900 Mo");
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
      "Ce module n'existe pas pour l'architecture arm64."
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
      "Les modules choisis demandent 4928 Mo de mémoire ; cette machine en a 4096."
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

  it("demande lequel prendre plutôt que de choisir à la place du lecteur", () => {
    if (!preset) {
      throw new Error(
        "le catalogue de test ne porte aucun préréglage exclusif"
      );
    }

    const html = renderToStaticMarkup(
      <CatalogPresetChoice
        modules={CATALOG.modules}
        onCancel={() => undefined}
        onChoose={() => undefined}
        preset={preset}
      />
    );

    for (const id of preset.choose_one ?? []) {
      expect(html).toContain(`value="${id}"`);
    }
  });

  /** A preset that carried one of them would be choosing; one that carried none would leave a hole. */
  it("ne porte lui-même aucun des modules qu'il oppose", () => {
    for (const id of preset?.choose_one ?? []) {
      expect(preset?.modules).not.toContain(id);
    }
  });
});
