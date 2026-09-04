import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { DashboardMachine } from "../dashboard/dashboard-machine";
import { DashboardPanel } from "../dashboard/dashboard-panel";
import { DashboardServices } from "../dashboard/dashboard-services";

/**
 * The dashboard, rendered from one `snapshot` fixture.
 *
 * The harness is `react-dom/server`: the panel takes everything it draws as a
 * prop, so a static render says what a browser would without pulling a DOM into
 * `bun test`.
 */

const NOOP = () => undefined;

function panel(): string {
  return renderToStaticMarkup(
    <DashboardPanel
      busy={null}
      onAct={NOOP}
      onCleanSessions={NOOP}
      onOpenProject={NOOP}
      onReboot={NOOP}
      onStopSession={NOOP}
      snapshot={SNAPSHOT}
    />
  );
}

describe("le tableau de bord", () => {
  it("rend la machine, les services, les projets et les sessions", () => {
    const html = panel();

    expect(html).toContain("atelier");
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("flymate-api");
    expect(html).toContain("atlas-web");
    expect(html).toContain("billing");
    expect(html).toContain("idea-backend");
  });

  it("compte les projets en ligne et ceux en échec", () => {
    const html = panel();

    expect(html).toContain("1 projet en ligne");
    expect(html).toContain("3 projets");
    expect(html).toContain("1 en échec");
  });

  it("montre la mémoire et le disque de la machine, pas une estimation", () => {
    const html = renderToStaticMarkup(
      <DashboardMachine
        machine={SNAPSHOT.machine}
        projectCount={3}
        projectsRam={1948}
      />
    );

    expect(html).toContain("3,5 Go / 8,0 Go");
    expect(html).toContain("63 Go libres");
    expect(html).toContain("0,42");
  });

  it("distingue l'état de chaque service par sa forme", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).toContain('data-state="running"');
    expect(html).toContain('data-state="stopped"');
    expect(html).toContain('data-state="failed"');
    expect(html).toContain('data-shape="struck"');
  });

  it("n'invente rien pour un serveur sans service ni projet", () => {
    const html = renderToStaticMarkup(
      <DashboardPanel
        busy={null}
        onAct={NOOP}
        onCleanSessions={NOOP}
        onOpenProject={NOOP}
        onReboot={NOOP}
        onStopSession={NOOP}
        snapshot={{ ...SNAPSHOT, projects: [], services: [], sessions: [] }}
      />
    );

    expect(html).toContain("Aucun service");
    expect(html).toContain("aucun projet");
    expect(html).toContain("Aucune session en arrière-plan");
  });
});
