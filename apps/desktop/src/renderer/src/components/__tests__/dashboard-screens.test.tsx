import { describe, expect, it } from "bun:test";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { renderToStaticMarkup } from "react-dom/server";
import { mount } from "../../__tests__/dom";
import { SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { DashboardMachine } from "../dashboard/dashboard-machine";
import { DashboardPanel } from "../dashboard/dashboard-panel";
import { DashboardProjectCard } from "../dashboard/dashboard-project-card";
import { DashboardServices } from "../dashboard/dashboard-services";
import { ServerRebootingScreen } from "../shell/server-rebooting-screen";

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

describe("the dashboard", () => {
  it("renders the machine, the services, the projects and the sessions", () => {
    const html = panel();

    expect(html).toContain("atelier");
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("flyleaf-api");
    expect(html).toContain("atlas-web");
    expect(html).toContain("billing");
    expect(html).toContain("idea-backend");
  });

  it("offers to rerun the hardening while root access stays open, and only then", () => {
    const open = text(
      renderToStaticMarkup(
        <DashboardPanel
          attached={[]}
          busy={null}
          onAct={NOOP}
          onAddProject={NOOP}
          onCleanSessions={NOOP}
          onOpenProject={NOOP}
          onReboot={NOOP}
          onSecure={NOOP}
          onStopSession={NOOP}
          securing="root"
          snapshot={SNAPSHOT}
        />
      )
    );

    expect(open).toContain("L'accès root de ce serveur est resté ouvert.");
    expect(open).toContain("Relancer la sécurisation");
    expect(text(panel())).not.toContain("Relancer la sécurisation");
  });

  it("offers to rerun the hardening while dev becomes root without a password", () => {
    const open = text(
      renderToStaticMarkup(
        <DashboardPanel
          attached={[]}
          busy={null}
          onAct={NOOP}
          onAddProject={NOOP}
          onCleanSessions={NOOP}
          onOpenProject={NOOP}
          onReboot={NOOP}
          onSecure={NOOP}
          onStopSession={NOOP}
          securing="sudo"
          snapshot={SNAPSHOT}
        />
      )
    );

    expect(open).toContain(
      "Sur ce serveur, dev devient encore root sans mot de passe."
    );
    expect(open).toContain("Relancer la sécurisation");
    expect(open).not.toContain("L'accès root de ce serveur est resté ouvert.");
  });

  it("puts the projects before the services", () => {
    const html = panel();

    expect(html.indexOf('data-section="projects"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-section="projects"')).toBeLessThan(
      html.indexOf('data-section="services"')
    );
  });

  // In the fixture only flyleaf-api has a public hostname; atlas-web is local only.
  it("offers to open only the projects that have a name on the web", () => {
    const html = panel();

    expect(html.split("Ouvrir<").length - 1).toBe(1);
  });

  it("offers to start all or stop all only for what can be", () => {
    const halted = SNAPSHOT.projects.map((project) => ({
      ...project,
      processes: project.processes.map((process) => ({
        ...process,
        state: "stopped" as const,
      })),
      state: "stopped" as const,
    }));

    function withProjects(projects: Project[]): string {
      return renderToStaticMarkup(
        <DashboardPanel
          attached={[]}
          busy={null}
          onAct={NOOP}
          onAddProject={NOOP}
          onCleanSessions={NOOP}
          onOpenProject={NOOP}
          onReboot={NOOP}
          onStopSession={NOOP}
          snapshot={{ ...SNAPSHOT, projects }}
        />
      );
    }

    const disabled = (label: string) =>
      new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`);

    expect(panel()).not.toMatch(disabled("Tout démarrer"));
    expect(panel()).not.toMatch(disabled("Tout arrêter"));
    expect(withProjects(halted)).toMatch(disabled("Tout arrêter"));
    expect(withProjects(halted)).not.toMatch(disabled("Tout démarrer"));
    expect(text(withProjects([]))).not.toContain("Tout démarrer");
    expect(text(withProjects([]))).not.toContain("Tout arrêter");
  });

  it("counts the projects online and those failing", () => {
    const html = panel();

    expect(html).toContain("1 en ligne sur 3 projets");
    expect(html).toContain("1 en échec");
  });

  it("shows the machine's memory and disk, not an estimate", () => {
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

  it("tells the state of each service apart by shape", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).toContain('data-state="running"');
    expect(html).toContain('data-state="stopped"');
    expect(html).toContain('data-state="failed"');
    expect(html).toContain('data-shape="struck"');
  });

  it("shows only the services that hold a process", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).toContain("Claude Code");
    expect(html).not.toContain("GitHub");
  });

  it("says nothing is running when the machine only has languages and tools", () => {
    const html = renderToStaticMarkup(
      <DashboardServices
        services={SNAPSHOT.services.filter((service) => !service.runs)}
      />
    );

    expect(html).toContain("Aucun service ne tourne en continu sur ce serveur");
  });

  it("offers to add a service when none is running", () => {
    const idle = SNAPSHOT.services.filter((service) => !service.runs);

    expect(
      renderToStaticMarkup(<DashboardServices onAdd={NOOP} services={idle} />)
    ).toContain("Ajouter un service");
    expect(
      renderToStaticMarkup(<DashboardServices services={idle} />)
    ).not.toContain("Ajouter un service");
  });

  it("invents nothing for a server with no service or project", () => {
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

    expect(html).toContain("Aucun service ne tourne en continu sur ce serveur");
    expect(html).toContain("aucun projet");
    expect(html).toContain("Aucune session en arrière-plan");
  });
});

describe("the machine alerts", () => {
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

  it("carry no fix while nothing is over the limit", () => {
    const html = machine(1, SNAPSHOT.machine);

    expect(html).not.toContain("data-alert");
    expect(html).not.toContain("data-remedy");
  });

  it("say what to do under each gauge in alert, with the gesture", () => {
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

  it("do not offer to stop a project when none is running", () => {
    const html = machine(0);

    expect(text(html)).not.toContain("Arrêter un projet");
    expect(text(html)).toContain("aucun projet ne tourne");
    expect(text(html)).toContain("Ouvrir un terminal");
  });
});

describe("a service card", () => {
  it("says whether the service is connected when it works for an account", () => {
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

  it("says nothing of the account until someone has answered", () => {
    const html = renderToStaticMarkup(
      <DashboardServices services={SNAPSHOT.services} />
    );

    expect(html).not.toContain('data-state="signed_');
  });

  it("opens its page", () => {
    const html = renderToStaticMarkup(
      <DashboardServices onOpen={NOOP} services={SNAPSHOT.services} />
    );

    expect(html).toContain('data-service="db.postgres"');
    expect(html).toContain('data-tooltip="Ouvrir PostgreSQL"');
    expect(html).toMatch(/<button[^>]*data-service="db.postgres"/);
  });
});

describe("a project card", () => {
  const FLYLEAF = SNAPSHOT.projects[0] as Project;
  const MAIN = FLYLEAF.processes[0] as Project["processes"][number];

  function card(project: Project): string {
    return renderToStaticMarkup(
      <DashboardProjectCard
        busy={false}
        onAct={NOOP}
        onOpen={NOOP}
        project={project}
      />
    );
  }

  it("offers each of the addresses of a project that publishes several", async () => {
    const view = await mount(
      <DashboardProjectCard
        busy={false}
        onAct={NOOP}
        onOpen={NOOP}
        project={FLYLEAF}
      />
    );

    await view.click(view.container.querySelector('[data-open="menu"]'));

    const entries = [...document.querySelectorAll("[role=menuitem]")].map(
      (entry) => entry.textContent
    );

    view.unmount();

    expect(entries).toEqual([
      "webflyleaf.example.org",
      "apiapi-flyleaf.example.org",
    ]);
  });

  it("opens in one gesture the address of a project that publishes only one", () => {
    const html = card({
      ...FLYLEAF,
      processes: [{ ...MAIN, routes: MAIN.routes.slice(0, 1) }],
    });

    expect(html.split("Ouvrir</button>").length - 1).toBe(1);
    expect(html).not.toContain('data-open="menu"');
  });

  it("does not offer to open a stopped project", () => {
    const html = card({
      ...FLYLEAF,
      processes: [{ ...MAIN, state: "stopped" }],
      state: "stopped",
    });

    expect(text(html)).not.toContain("Ouvrir");
  });

  it("shows the project's name on the web rather than its address on the machine", () => {
    const html = card(FLYLEAF);

    expect(text(html)).toContain("flyleaf.example.org · main");
    expect(text(html)).not.toContain("127.0.0.1:3000");
  });

  it("does not fill with a dash what a stopped project does not measure", () => {
    const html = card(SNAPSHOT.projects[1] as Project);

    expect(text(html)).not.toContain("—");
  });
});

describe("a server that restarts", () => {
  it("says its name and what the person is waiting for", () => {
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
