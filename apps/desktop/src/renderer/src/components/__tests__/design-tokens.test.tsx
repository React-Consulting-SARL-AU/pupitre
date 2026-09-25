import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG } from "../../__tests__/catalog-fixtures";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { CatalogCategorySection } from "../catalog/catalog-category-section";
import { DashboardPanel } from "../dashboard/dashboard-panel";
import { DashboardProjectCard } from "../dashboard/dashboard-project-card";
import { ServiceRow } from "../services/service-row";
import { Callout } from "../ui/callout";
import { WaitingNotice } from "../ui/waiting-notice";

const NOOP = () => undefined;

const RENDERER = path.resolve(import.meta.dir, "../..");

const SCREENS_AT_LEAST = 60;

const HARDCODED =
  /#[0-9a-fA-F]{3,8}\b|\bhsl\(|\brgba?\(|\boklch\(|rounded-\[|shadow-\[/;

function sources(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sources(full));
    } else if (
      entry.name.endsWith(".tsx") &&
      entry.name !== "agent-icons.tsx"
    ) {
      found.push(full);
    }
  }

  return found;
}

describe("les tokens", () => {
  it("ne laisse aucune ombre, aucun rayon ni aucune couleur en dur", () => {
    const files = sources(RENDERER);
    const offenders = files.filter((file) =>
      HARDCODED.test(readFileSync(file, "utf8"))
    );

    expect(files.length).toBeGreaterThan(SCREENS_AT_LEAST);
    expect(offenders).toEqual([]);
  });

  it("déclare l'élévation par une classe et jamais par un box-shadow", () => {
    const styles = readFileSync(path.join(RENDERER, "styles.css"), "utf8");

    expect(styles).toContain("box-shadow: var(--shadow-raised)");
    expect(styles).toContain("box-shadow: var(--shadow-overlay)");
  });
});

describe("l'élévation", () => {
  it("pose les cartes du tableau de bord sur le fond", () => {
    const html = renderToStaticMarkup(
      <DashboardPanel
        attached={[]}
        busy={null}
        onAct={NOOP}
        onAddProject={() => undefined}
        onCleanSessions={NOOP}
        onOpenProject={NOOP}
        onReboot={NOOP}
        onStopSession={NOOP}
        snapshot={SNAPSHOT}
      />
    );

    expect(html).toContain("elevation-raised");
    expect(html).toContain("rounded-md");
  });

  it("pose l'avis d'attente et l'avis d'erreur", () => {
    const waiting = renderToStaticMarkup(
      <WaitingNotice detail="Ports, utilisateurs" title="Inspection" />
    );
    const callout = renderToStaticMarkup(
      <Callout fix="systemctl status pupitred" tone="danger">
        L'agent ne répond plus.
      </Callout>
    );

    expect(waiting).toContain("elevation-raised");
    expect(callout).toContain("elevation-raised");
  });
});

describe("les logos", () => {
  it("montre la marque de chaque service installé", () => {
    const html = renderToStaticMarkup(
      <ServiceRow onOpen={NOOP} service={SNAPSHOT.services[0]} />
    );

    expect(html).toContain('data-logo="db.postgres"');
    expect(html).toContain("<svg");
  });

  it("montre la marque de chaque module du catalogue", () => {
    const modules = CATALOG.modules.filter(
      (module) => module.category === "database"
    );

    const html = renderToStaticMarkup(
      <CatalogCategorySection
        blocked={new Map()}
        category="database"
        modules={modules}
        onToggle={NOOP}
        selected={[]}
      />
    );

    expect(html).toContain('data-logo="db.postgres"');
    expect(html).toContain('data-logo="db.mysql"');
  });

  it("montre le runtime d'un projet, ou une icône quand aucune marque n'est redistribuable", () => {
    const [bun, node] = SNAPSHOT.projects;

    const withoutMark = renderToStaticMarkup(
      <DashboardProjectCard
        busy={false}
        onAct={NOOP}
        onOpen={NOOP}
        project={bun}
      />
    );
    const withMark = renderToStaticMarkup(
      <DashboardProjectCard
        busy={false}
        onAct={NOOP}
        onOpen={NOOP}
        project={node}
      />
    );

    expect(withoutMark).toContain("data-logo-fallback");
    expect(withMark).toContain('data-logo="runtime.node"');
  });
});
