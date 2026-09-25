import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { excluding } from "../../lib/backups";
import { BackupsContentDatabases } from "../backups/backups-content-databases";
import { BackupsContentProjects } from "../backups/backups-content-projects";

const DATABASES = [
  { engine: "postgres", included: true, item: "postgres:shop", name: "shop" },
  { engine: "mysql", included: true, item: "mysql:intranet", name: "intranet" },
  { engine: "redis", included: false, item: "redis:*", name: "*" },
] as const;

const PROJECTS = [
  { included: true, name: "flyleaf-api", repo: true },
  { included: true, name: "billing", repo: false },
];

function databases(
  excluded: readonly string[],
  carried = true,
  unreadable: ("postgres" | "mysql" | "mongodb" | "redis")[] = []
): string {
  return renderToStaticMarkup(
    <BackupsContentDatabases
      carried={carried}
      databases={[...DATABASES]}
      excluded={excluded}
      label="Bases de données"
      onCarried={() => undefined}
      onExcluded={() => undefined}
      unreadable={unreadable}
    />
  );
}

/** The drawn checkbox of one line, found back from the hidden input that names it. */
function box(html: string, name: string): string {
  const at = html.indexOf(`name="${name}"`);
  const role = html.lastIndexOf('role="checkbox"', at);
  const start = html.lastIndexOf("<", role);

  return html.slice(start, html.indexOf(">", role) + 1);
}

describe("le contenu des sauvegardes", () => {
  it("nomme chaque base par son moteur, l'instantané Redis compris", () => {
    const html = databases([]);

    expect(html).toContain("PostgreSQL · shop");
    expect(html).toContain("MySQL · intranet");
    expect(html).toContain("Redis · snapshot");
  });

  it("décoche ce que les réglages laissent dehors, et garde une exclusion d'une base partie", () => {
    const html = databases(["redis:*", "mysql:archives"]);

    expect(html).toContain("MySQL · archives");
    expect(html).toContain("N&#x27;est plus sur ce serveur");
    expect(box(html, "backup-database-postgres:shop")).not.toContain(
      "data-unchecked"
    );
    expect(box(html, "backup-database-redis:*")).toContain("data-unchecked");
  });

  it("grise les bases quand la catégorie ne part plus", () => {
    expect(
      box(databases([], false), "backup-database-postgres:shop")
    ).toContain("disabled");
  });

  it("dit quel moteur n'a pas répondu", () => {
    expect(databases([], true, ["mongodb"])).toContain(
      "MongoDB n&#x27;a pas répondu"
    );
  });

  it("dit qu'un projet sans dépôt part toujours en entier, et grise le mode quand les projets ne partent pas", () => {
    const html = renderToStaticMarkup(
      <BackupsContentProjects
        carried={false}
        envOnly={{
          label: "Seulement leurs fichiers d'environnement",
          onChange: () => undefined,
          value: false,
        }}
        excluded={[]}
        label="Projets"
        onCarried={() => undefined}
        onExcluded={() => undefined}
        projects={PROJECTS}
      />
    );

    expect(html).toContain("Sans dépôt : toujours sauvegardé en entier.");
    expect(html).toContain('data-switch="backup-projects-env-only"');
  });

  it("met un élément dans la liste d'exclusion quand on le décoche, et l'en retire quand on le recoche", () => {
    expect(excluding(["redis:*"], "postgres:shop", false)).toEqual([
      "redis:*",
      "postgres:shop",
    ]);
    expect(excluding(["redis:*", "postgres:shop"], "redis:*", true)).toEqual([
      "postgres:shop",
    ]);
  });
});
