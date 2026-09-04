import { describe, expect, it } from "bun:test";
import type { SecretMarks } from "@shared/secrets";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG, CATALOG_NEXT } from "../../__tests__/catalog-fixtures";
import { fieldsOf, select } from "../../lib/catalog-selection";
import { ConfigForm } from "../config/config-form";

/**
 * Every kind of field the contract defines, drawn from a manifest and nothing
 * else. A kind that had no control would render an empty group, which is what
 * these assertions are looking for.
 */

const ALL = [
  "core.system",
  "core.hardening",
  "runtime.node",
  "runtime.java",
  "db.mysql",
  "db.postgres",
  "ai.hermes",
  "editor.jetbrains",
  "editor.vscode",
  "exposure.cloudflare",
];

function form(
  modules = CATALOG.modules,
  selected: readonly string[] = ALL,
  extra: {
    values?: Record<string, Record<string, unknown>>;
    secrets?: SecretMarks;
    machineName?: string;
  } = {}
): string {
  return renderToStaticMarkup(
    <ConfigForm
      groups={fieldsOf(modules, selected)}
      machineName={extra.machineName ?? "staging"}
      secrets={extra.secrets ?? {}}
      values={extra.values ?? {}}
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

function field(html: string, path: string): string {
  return tag(html, "data-field", path);
}

function control(html: string, name: string): string {
  return tag(html, "name", name);
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("un groupe par module choisi", () => {
  const html = form();

  it("suit l'ordre du catalogue et nomme chaque module", () => {
    expect(
      [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    ).toEqual(ALL);
    expect(text(html)).toContain("PostgreSQL 17");
  });

  it("ne montre que les modules choisis", () => {
    expect(form(CATALOG.modules, ["core.system"])).not.toContain(
      'data-group="db.postgres"'
    );
  });
});

describe("chaque genre de champ a son contrôle", () => {
  const html = form();

  it("text : une entrée de texte", () => {
    expect(field(html, "core.system.git_name")).toContain('data-kind="text"');
    expect(control(html, "core.system.git_name")).toContain('type="text"');
  });

  it("number : une entrée numérique", () => {
    expect(field(html, "db.mysql.buffer_pool")).toContain('data-kind="number"');
    expect(control(html, "db.mysql.buffer_pool")).toContain('type="number"');
  });

  it("select : une liste des options du manifeste", () => {
    expect(field(html, "db.mysql.engine")).toContain('data-kind="select"');
    expect(control(html, "db.mysql.engine").startsWith("<select")).toBe(true);
    expect(html).toContain('value="mysql"');
    expect(html).toContain('value="mariadb"');
  });

  it("version : une liste des versions, la valeur par défaut choisie", () => {
    expect(field(html, "runtime.java.java_version")).toContain(
      'data-kind="version"'
    );
    expect(
      control(html, "runtime.java.java_version").startsWith("<select")
    ).toBe(true);
    expect(html).toContain(">21</option>");
    expect(html).toContain(">17</option>");
  });

  it("boolean : une case à cocher, jamais requise", () => {
    const wrapper = field(html, "core.hardening.ssh_443");

    expect(wrapper).toContain('data-kind="boolean"');
    expect(wrapper).toContain('data-required="false"');
    expect(control(html, "core.hardening.ssh_443")).toContain(
      'type="checkbox"'
    );
  });

  it("boolean : la valeur par défaut du manifeste est déjà posée", () => {
    const posed = form(CATALOG.modules, ALL, {
      values: { "runtime.node": { bun: true } },
    });

    expect(control(posed, "runtime.node.bun")).toContain('checked=""');
    expect(control(html, "runtime.node.bun")).not.toContain('checked=""');
  });

  it("list de text : une entrée par élément, avec de quoi en ajouter", () => {
    expect(field(html, "editor.vscode.extensions")).toContain(
      'data-kind="list"'
    );
    expect(html).toContain('data-item="editor.vscode.extensions.0"');
    expect(control(html, "editor.vscode.extensions.0")).toContain(
      'type="text"'
    );
    expect(text(html)).toContain("Ajouter");
  });

  it("list : les bornes du manifeste sont dites", () => {
    expect(text(html)).toContain("de 1 à 3 valeurs");
    expect(text(html)).toContain("jusqu'à 8 valeurs");
  });

  it("list de secret : chaque élément est un champ secret", () => {
    expect(field(html, "ai.hermes.providers")).toContain('data-items="secret"');
    expect(html).toContain('data-item="ai.hermes.providers.0"');
    expect(control(html, "ai.hermes.providers.0")).toContain('type="password"');
  });

  it("secret : masqué, jamais rempli depuis une valeur", () => {
    const wrapper = field(html, "exposure.cloudflare.api_token");
    const input = control(html, "exposure.cloudflare.api_token");

    expect(wrapper).toContain('data-kind="secret"');
    expect(input).toContain('type="password"');
    expect(input).not.toContain("value=");
  });
});

describe("un secret généré", () => {
  const marks: SecretMarks = {
    "db.postgres": {
      app_password: { filled: true, generated: true, revealed: false },
      remote_password: { filled: true, generated: true, revealed: true },
    },
  };
  const html = form(CATALOG.modules, ALL, { secrets: marks });

  it("dit qu'il est généré et propose de le montrer une fois", () => {
    expect(field(html, "db.postgres.app_password")).toContain(
      'data-generated="true"'
    );
    expect(text(html)).toContain("Généré pour cette machine");
    expect(text(html)).toContain("Montrer une fois");
  });

  it("ne le repropose plus une fois montré", () => {
    expect(field(html, "db.postgres.remote_password")).toContain(
      'data-revealed="true"'
    );
    expect(text(html)).toContain(
      "Déjà montré une fois ; il ne sera plus affiché."
    );
  });

  it("ne porte la valeur d'aucun secret dans le document", () => {
    const withValues = form(CATALOG.modules, ALL, {
      secrets: marks,
      values: { "db.postgres": { app_password: "ne-doit-pas-passer" } },
    });

    expect(withValues).not.toContain("ne-doit-pas-passer");
  });
});

describe("les champs communs de la machine", () => {
  const html = form();

  it("demande le nom de la machine, qui est celui de l'app", () => {
    expect(html).toContain('data-field="machine.name"');
    expect(html).toContain('value="staging"');
  });

  it("laisse le fuseau, l'identité git et le dossier des projets au manifeste", () => {
    for (const key of ["timezone", "git_name", "git_email", "projects_dir"]) {
      expect(html).toContain(`data-field="core.system.${key}"`);
    }
  });
});

describe("un module que l'agent vient d'ajouter", () => {
  it("est configurable sans une ligne de code de plus", () => {
    const html = form(CATALOG_NEXT.modules, [
      ...select(CATALOG_NEXT.modules, [], "db.clickhouse"),
    ]);

    expect(html).toContain('data-group="db.clickhouse"');
    expect(field(html, "db.clickhouse.app_password")).toContain(
      'data-kind="secret"'
    );
  });
});
