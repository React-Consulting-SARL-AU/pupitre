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

describe("the tokens", () => {
  it("leaves no hardcoded shadow, radius or colour", () => {
    const files = sources(RENDERER);
    const offenders = files.filter((file) =>
      HARDCODED.test(readFileSync(file, "utf8"))
    );

    expect(files.length).toBeGreaterThan(SCREENS_AT_LEAST);
    expect(offenders).toEqual([]);
  });

  it("declares elevation by a class and never by a box-shadow", () => {
    const styles = readFileSync(path.join(RENDERER, "styles.css"), "utf8");

    expect(styles).toContain("box-shadow: var(--shadow-raised)");
    expect(styles).toContain("box-shadow: var(--shadow-overlay)");
  });
});

describe("the elevation", () => {
  it("sets the dashboard cards on the background", () => {
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

  it("sets the waiting notice and the error notice", () => {
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

describe("the logos", () => {
  it("shows the brand of each installed service", () => {
    const html = renderToStaticMarkup(
      <ServiceRow onOpen={NOOP} service={SNAPSHOT.services[0]} />
    );

    expect(html).toContain('data-logo="db.postgres"');
    expect(html).toContain("<svg");
  });

  it("shows the brand of each catalogue module", () => {
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

  it("shows a project's runtime, or an icon when no brand may be redistributed", () => {
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
