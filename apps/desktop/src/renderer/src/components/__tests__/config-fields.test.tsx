import { describe, expect, it } from "bun:test";
import type { SecretMarks } from "@shared/secrets";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG, CATALOG_NEXT } from "../../__tests__/catalog-fixtures";
import {
  type FieldProblemView,
  fieldsOf,
  select,
} from "../../lib/catalog-selection";
import { ConfigModuleGroup } from "../config/config-module-group";

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
    problems?: readonly FieldProblemView[];
  } = {}
): string {
  return fieldsOf(modules, selected)
    .map((group) =>
      renderToStaticMarkup(
        <ConfigModuleGroup
          group={group}
          handlers={{}}
          key={group.module.id}
          marks={extra.secrets?.[group.module.id]}
          problems={(extra.problems ?? []).filter(
            (one) => one.module === group.module.id
          )}
          values={extra.values?.[group.module.id] ?? {}}
        />
      )
    )
    .join("");
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
    const wrapper = field(html, "db.postgres.app_password");
    const input = control(html, "db.postgres.app_password");

    expect(wrapper).toContain('data-kind="secret"');
    expect(input).toContain('type="password"');
    expect(input).not.toContain("value=");
  });

  /**
   * A managed value comes from a connection the app holds. Asking for it here
   * would be asking twice, and the form never shows one.
   */
  it("ne demande jamais un champ que l'app remplit elle-même", () => {
    expect(html).toContain('data-field="exposure.cloudflare.domain"');
    expect(html).not.toContain('data-field="exposure.cloudflare.tunnel_id"');
    expect(html).not.toContain(
      'data-field="exposure.cloudflare.tunnel_secret"'
    );
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

describe("les champs du socle", () => {
  const html = form();

  it("laisse le fuseau, l'identité git et le dossier des projets au manifeste", () => {
    for (const key of ["timezone", "git_name", "git_email", "projects_dir"]) {
      expect(html).toContain(`data-field="core.system.${key}"`);
    }
  });

  /** The machine is named where a machine is named: adding it, and in the list. */
  it("ne demande pas le nom de la machine", () => {
    expect(html).not.toContain('data-field="machine.name"');
  });
});

describe("ce qu'un champ refusé montre", () => {
  const problems = [
    {
      code: "format" as const,
      declared: undefined,
      expected: "email",
      field: "git_email",
      manifest: CATALOG.modules[0],
      message: "Une adresse électronique est attendue.",
      module: "core.system",
    },
  ];

  const html = form(CATALOG.modules, ALL, { problems });

  it("porte la phrase du refus sous le champ, et pas ailleurs", () => {
    expect(text(html)).toContain("Une adresse électronique est attendue.");
  });

  it("le dit aussi à qui ne voit pas l'écran", () => {
    expect(control(html, "core.system.git_email")).toContain(
      'aria-invalid="true"'
    );
    expect(control(html, "core.system.git_email")).toContain(
      'aria-describedby="core.system.git_email-problem"'
    );
  });

  it("ne marque que le champ nommé", () => {
    expect(control(html, "core.system.git_name")).not.toContain("aria-invalid");
  });
});

describe("l'aide d'un champ", () => {
  const html = form();

  it("met la phrase courte sous le contrôle et le reste dans une bulle", () => {
    expect(text(html)).toContain("Ce que les commits porteront comme auteur.");
    expect(html).toContain('data-hint="Dossier des projets"');
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
