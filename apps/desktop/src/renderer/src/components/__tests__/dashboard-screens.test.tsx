import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { DashboardMachine } from "../dashboard/dashboard-machine";
import { DashboardPanel } from "../dashboard/dashboard-panel";
import { DashboardServices } from "../dashboard/dashboard-services";
import { ServerRebootingScreen } from "../shell/server-rebooting-screen";

/**
 * The dashboard, rendered from one `snapshot` fixture.
 *
 * The harness is `react-dom/server`: the panel takes everything it draws as a
 * prop, so a static render says what a browser would without pulling a DOM into
 * `bun test`.
 */

const NOOP = () => undefined;

const RESOLVED = () => Promise.resolve();

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const STRAINED = {
  ...SNAPSHOT.machine,
  disk_free_gb: 8,
  load: [6.5, 5.2, 4.1] as [number, number, number],
  ram_used_mb: 7680,
};

function panel(): string {
  return renderToStaticMarkup(
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

  it("ne montre que les services qui tiennent un processus", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).toContain("Claude Code");
    expect(html).not.toContain("GitHub");
  });

  it("dit que rien ne tourne quand la machine n'a que des langages et des outils", () => {
    const html = renderToStaticMarkup(
      <DashboardServices
        services={SNAPSHOT.services.filter((service) => !service.runs)}
      />
    );

    expect(html).toContain("Rien en marche");
  });

  it("n'invente rien pour un serveur sans service ni projet", () => {
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
        snapshot={{ ...SNAPSHOT, projects: [], services: [], sessions: [] }}
      />
    );

    expect(html).toContain("Rien en marche");
    expect(html).toContain("aucun projet");
    expect(html).toContain("Aucune session en arrière-plan");
  });
});

describe("les alertes de la machine", () => {
  function machine(running: number, strained = STRAINED): string {
    return renderToStaticMarkup(
      <DashboardMachine
        machine={strained}
        onCleanSessions={RESOLVED}
        onOpenTerminal={NOOP}
        onStopProject={NOOP}
        projectCount={3}
        projectsRam={1948}
        runningProjects={running}
      />
    );
  }

  it("ne portent aucun remède tant que rien ne dépasse", () => {
    const html = machine(1, SNAPSHOT.machine);

    expect(html).not.toContain("data-alert");
    expect(html).not.toContain("data-remedy");
  });

  it("disent quoi faire sous chaque jauge en alerte, avec le geste", () => {
    const html = machine(1);

    expect(html.match(/data-alert="true"/g)).toHaveLength(3);
    expect(html).toContain('data-remedy="memory"');
    expect(html).toContain('data-remedy="load"');
    expect(html).toContain('data-remedy="disk"');
    expect(text(html)).toContain("un projet arrêté rend sa mémoire");
    expect(text(html)).toContain("Arrêter un projet");
    expect(text(html)).toContain("Nettoyer les sessions");
    expect(text(html)).toContain("Ouvrir un terminal");
  });

  it("n'offrent pas d'arrêter un projet quand aucun ne tourne", () => {
    const html = machine(0);

    expect(text(html)).not.toContain("Arrêter un projet");
    expect(text(html)).toContain("aucun projet ne tourne");
    expect(text(html)).toContain("Ouvrir un terminal");
  });
});

describe("la carte d'un service", () => {
  it("dit si le service est connecté quand il travaille pour un compte", () => {
    const html = renderToStaticMarkup(
      <DashboardServices
        accounts={{
          "ai.claude": "signed_out",
          "exposure.cloudflare": "signed_in",
        }}
        services={SNAPSHOT.services}
      />
    );

    expect(html).toMatch(
      /data-service="ai.claude"[\s\S]*?data-state="running"[\s\S]*?data-state="signed_out"[\s\S]*?<\/button>/
    );
    expect(html).toContain("non connecté");
    expect(html).toMatch(
      /data-service="exposure.cloudflare"[\s\S]*?data-state="failed"[\s\S]*?data-state="signed_in"[\s\S]*?<\/button>/
    );
    expect(html).toMatch(
      /data-service="db.postgres"(?:(?!<\/button>)[\s\S])*?data-state="running"(?:(?!<\/button>)[\s\S])*?<\/button>/
    );
    expect(html).not.toMatch(
      /data-service="db.postgres"(?:(?!<\/button>)[\s\S])*?data-state="signed_/
    );
  });

  it("ne dit rien du compte tant que personne n'a répondu", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).not.toContain('data-state="signed_');
  });

  it("ouvre sa fiche", () => {
    const html = renderToStaticMarkup(
      <DashboardServices onOpen={NOOP} services={SNAPSHOT.services} />
    );

    expect(html).toContain('data-service="db.postgres"');
    expect(html).toContain('data-tooltip="Ouvrir PostgreSQL"');
    expect(html).toMatch(/<button[^>]*data-service="db.postgres"/);
  });
});

describe("un serveur qui redémarre", () => {
  it("dit son nom et ce que la personne attend", () => {
    const html = renderToStaticMarkup(
      <ServerRebootingScreen onSettings={NOOP} serverName="atelier" />
    );

    expect(html).toContain('data-rebooting="atelier"');
    expect(text(html)).toContain("Redémarrage de atelier");
    expect(text(html)).toContain("En attente que atelier réponde");
    expect(html).toContain('aria-busy="true"');
    expect(text(html)).toContain("Gérer les serveurs");
  });
});
