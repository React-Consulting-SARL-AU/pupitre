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
import { mount } from "../../__tests__/dom";
import {
  blocked,
  fromPreset,
  presetOffer,
  resourceWarnings,
  select,
} from "../../lib/catalog-selection";
import { CatalogChoice } from "../catalog/catalog-choice";
import { CatalogPresetChoice } from "../catalog/catalog-preset-choice";
import { CatalogPresets } from "../catalog/catalog-presets";

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

// Attribute order in the rendered tag is not stable, so the whole opening tag is matched.
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

describe("the presets at the top", () => {
  const html = screen(
    CATALOG,
    ["core.system", "core.hardening"],
    LARGE_MACHINE
  );

  it("offers the three from the catalogue, in the order received", () => {
    expect(
      [...html.matchAll(/data-preset="([^"]+)"/g)].map((m) => m[1])
    ).toEqual(["web-js", "full", "minimal"]);
  });

  it("names the three from the contract in French", () => {
    expect(text(html)).toContain("Web JavaScript");
    expect(text(html)).toContain("Tout le catalogue");
    expect(text(html)).toContain("Minimal");
  });
});

describe("the categories and their modules", () => {
  const html = screen(
    CATALOG,
    ["core.system", "core.hardening"],
    LARGE_MACHINE
  );

  it("groups by category, in the contract's order", () => {
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

  it("shows the name and summary of each module, without its figures", () => {
    const readable = text(html);

    expect(readable).toContain("PostgreSQL 17");
    expect(readable).toContain(
      "Local seulement, rôles applicatif et distant, import de dumps."
    );
    expect(tag(html, "data-module", "db.postgres")).not.toContain("900");
  });

  it("says what the choice weighs against the machine, once", () => {
    expect(html).toContain('data-resources="true"');
    expect(text(html)).toContain("Mémoire 320 Mo sur");
  });

  it("names what a preset brings rather than counting it", () => {
    expect(text(html)).toContain("Node.js, MySQL 8, VS Code Remote");
  });

  it("does not promise a server what it already runs", () => {
    const again = screen(CATALOG, [], LARGE_MACHINE, {
      installed: ["core.system", "core.hardening", "runtime.node"],
    });

    expect(text(again)).toContain("MySQL 8, VS Code Remote");
    expect(text(again)).not.toContain("Node.js, MySQL 8");
  });

  it("greys out the preset that brings nothing more, and says why", () => {
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

  it("marks the one that is applied rather than leaving the click unanswered", () => {
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

  it("sets the logo in colour when the module has one", () => {
    expect(html).toContain('data-logo="db.postgres"');
    expect(html).toContain("PostgreSQL");
  });

  it("falls back to a plain icon when no logo is lawful", () => {
    expect(html).toContain('data-logo-fallback="core.system"');
    expect(html).not.toContain('data-logo="core.system"');
  });

  it("ticks and locks the mandatory modules", () => {
    const card = tag(html, "data-module", "core.system");

    expect(card).toContain('data-selected="true"');
    expect(card).toContain('data-locked="true"');
  });
});

describe("what is out of reach", () => {
  it("greys out a conflicting module and says which", () => {
    const chosen = select(CATALOG.modules, [], "exposure.cloudflare");
    const html = screen(CATALOG, chosen, LARGE_MACHINE);

    expect(tag(html, "data-module", "exposure.caddy")).toContain(
      'data-blocked="true"'
    );
    expect(text(html)).toContain(
      "En conflit avec « Cloudflare Tunnel », déjà sélectionné."
    );
  });

  it("greys out a module the machine's architecture cannot run", () => {
    const html = screen(CATALOG, ["core.system"], ARM_MACHINE);

    expect(tag(html, "data-module", "tool.legacy")).toContain(
      'data-blocked="true"'
    );
    expect(text(html)).toContain(
      "Ce service n'existe pas pour l'architecture arm64."
    );
  });
});

describe("the cumulated resources", () => {
  it("stays silent while the machine is enough", () => {
    const base = select(CATALOG.modules, [], "core.hardening");
    const chosen = select(CATALOG.modules, base, "editor.jetbrains");
    const html = screen(CATALOG, chosen, SMALL_MACHINE);

    expect(html).not.toContain('data-tone="warn"');
  });

  it("warns when postgres is added to jetbrains on 4 GB", () => {
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

describe("a module the agent has just added", () => {
  it("appears in its category without another line of code", () => {
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

describe("a preset that names exclusive modules", () => {
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

  it("asks which to take rather than choosing in the reader's place", () => {
    const html = question();

    for (const id of preset?.choose_one ?? []) {
      expect(html).toContain(`data-preset-option="${id}"`);
    }

    expect(html).toContain('role="radiogroup"');
  });

  it("lets none be taken without abandoning the preset", () => {
    expect(question()).toContain('data-preset-option="none"');
  });

  it("does not set against each other a module the server already runs", () => {
    const html = question(["exposure.caddy"]);

    expect(html).not.toContain('value="exposure.caddy"');
    expect(html).not.toContain('value="exposure.cloudflare"');
  });

  // A preset carrying one of them would already have chosen for the reader.
  it("carries none of the modules it sets against each other", () => {
    for (const id of preset?.choose_one ?? []) {
      expect(preset?.modules).not.toContain(id);
    }
  });
});

describe("searching for a service in the catalogue", () => {
  it("offers the field, and counts what it leaves", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "mysql" });

    expect(html).toContain('data-catalog-search="true"');
    expect(html).toContain('data-search-found="1"');
  });

  it("keeps only the categories that still have something", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "sql" });

    expect(
      [...html.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1])
    ).toEqual(["database"]);
    expect(html).toContain('data-module="db.mysql"');
    expect(html).toContain('data-module="db.postgres"');
    expect(html).not.toContain('data-module="runtime.node"');
  });

  // A typed name already answers "what should I install", which is what presets are for.
  it("removes the presets while a phrase is typed", () => {
    expect(screen(CATALOG, [], LARGE_MACHINE)).toContain('data-preset="full"');
    expect(
      screen(CATALOG, [], LARGE_MACHINE, { query: "mysql" })
    ).not.toContain('data-preset="full"');
  });

  it("says it found nothing, with the phrase searched", () => {
    const html = screen(CATALOG, [], LARGE_MACHINE, { query: "kubernetes" });

    expect(text(html)).toContain("Aucun service ne répond à « kubernetes ».");
    expect(html).not.toContain("data-category=");
  });
});

describe("a preset on an existing selection", () => {
  const FULL = CATALOG.presets.find((p) => p.id === "full");
  const chosen = FULL
    ? fromPreset(CATALOG.modules, FULL, [], LARGE_MACHINE)
    : [];

  it("asks before removing what was ticked, naming it", async () => {
    const picked: string[] = [];
    const view = await mount(
      <CatalogPresets
        modules={CATALOG.modules}
        onPick={(id) => picked.push(id)}
        presets={CATALOG.presets}
        probe={LARGE_MACHINE}
        selected={chosen}
      />
    );

    await view.click(view.container.querySelector('[data-preset="web-js"]'));

    expect(picked).toEqual([]);
    expect(view.text()).toContain("Appliquer « Web JavaScript » ?");
    expect(view.text()).toContain("PostgreSQL");

    view.unmount();
  });

  it("applies without asking when nothing would be removed", async () => {
    const picked: string[] = [];
    const view = await mount(
      <CatalogPresets
        modules={CATALOG.modules}
        onPick={(id) => picked.push(id)}
        presets={CATALOG.presets}
        probe={LARGE_MACHINE}
        selected={[]}
      />
    );

    await view.click(view.container.querySelector('[data-preset="web-js"]'));

    expect(picked).toEqual(["web-js"]);

    view.unmount();
  });
});
