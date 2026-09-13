import { describe, expect, it } from "bun:test";
import type { AccountState } from "@shared/account";
import type { Server } from "@shared/servers";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PROCESSES, SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { type ReenrollState, repairable } from "../../stores/reenroll";
import { ActivityPanel } from "../activity/activity-panel";
import { AppSidebar } from "../shell/app-sidebar";
import { FirstRunScreen } from "../shell/first-run-screen";
import { HistoryArrows } from "../shell/history-arrows";
import { ServerLinkNotice } from "../shell/server-link-notice";
import { ServerRestrictedNotice } from "../shell/server-restricted-notice";
import { ServerUnreadyScreen } from "../shell/server-unready-screen";

/**
 * The shell around the screens: the sidebar, the two states of a server, and
 * the two pages that hang off the menu rather than off a project.
 */

const NOOP = () => undefined;

const SERVER: Server = {
  host: "atelier.example.net",
  id: "srv-1",
  name: "Atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

describe("la barre latérale", () => {
  it("hiérarchise ses entrées en trois plans et marque l'entrée active", () => {
    const html = renderToStaticMarkup(
      <AppSidebar
        activeTerminal={null}
        allTerminals={[]}
        onAddProject={() => undefined}
        onCloseTerminal={NOOP}
        onNewTerminal={NOOP}
        onProject={NOOP}
        onSwitchServer={NOOP}
        onTerminal={NOOP}
        onView={NOOP}
        projects={SNAPSHOT.projects}
        selection="flymate-api"
        server={SERVER}
        servers={[SERVER]}
        states={{}}
        terminals={[]}
        view="project"
      />
    );

    expect(html).toContain("Serveur");
    expect(html).toContain("Projets");
    expect(html).toContain("Terminaux");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("bg-ink");
    expect(html).toContain("Atelier");
    expect(html).toContain("atelier.example.net");
  });

  it("nomme l'organisation à laquelle la console rattache le serveur", () => {
    const granted: Server = {
      ...SERVER,
      grant: {
        adopted: false,
        id: "platform-1",
        keyReady: true,
        listed: true,
        opened: true,
        organization: { id: "org-1", name: "Atelier Ada" },
        status: "active",
      },
    };

    const html = renderToStaticMarkup(
      <AppSidebar
        activeTerminal={null}
        allTerminals={[]}
        onAddProject={NOOP}
        onCloseTerminal={NOOP}
        onNewTerminal={NOOP}
        onProject={NOOP}
        onSwitchServer={NOOP}
        onTerminal={NOOP}
        onView={NOOP}
        projects={[]}
        selection={null}
        server={granted}
        servers={[granted]}
        states={{}}
        terminals={[]}
        view="dashboard"
      />
    );

    expect(html).toContain("Atelier Ada");
  });

  it("liste les projets du snapshot avec leur état et leur mémoire", () => {
    const html = renderToStaticMarkup(
      <AppSidebar
        activeTerminal={null}
        allTerminals={[]}
        onAddProject={() => undefined}
        onCloseTerminal={NOOP}
        onNewTerminal={NOOP}
        onProject={NOOP}
        onSwitchServer={NOOP}
        onTerminal={NOOP}
        onView={NOOP}
        projects={SNAPSHOT.projects}
        selection={null}
        server={SERVER}
        servers={[SERVER]}
        states={{}}
        terminals={[]}
        view="dashboard"
      />
    );

    expect(html).toContain("flymate-api");
    expect(html).toContain("412 Mo");
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="empty"');
    expect(html).toContain('data-shape="struck"');
  });
});

describe("un serveur qui ne répond pas encore", () => {
  it("montre le message et le remède de l'agent, tels quels", () => {
    const html = renderToStaticMarkup(
      <ServerUnreadyScreen
        error={{
          code: "disconnected",
          fix: "Vérifie que le port 22 est ouvert.",
          message: "La connexion au serveur s'est interrompue.",
        }}
        onInstall={NOOP}
        onRetry={NOOP}
        onSettings={NOOP}
        server={SERVER}
      />
    );

    expect(html).toContain("disconnected");
    expect(html).toContain("interrompue");
    expect(html).toContain("le port 22 est ouvert");
    expect(html).toContain("Installer l&#x27;agent");
  });
});

describe("l'app sans la moindre machine", () => {
  it("dit ce que l'assistant va faire, dans l'ordre où il le fait", () => {
    const html = renderToStaticMarkup(
      <FirstRunScreen onAddServer={NOOP} onSettings={NOOP} />
    );

    expect(html).toContain("Prenez une machine en main");
    expect(html).toContain("Il inspecte la machine");
    expect(html).toContain("Il installe ce que vous choisissez");
    expect(html).toContain("Il referme la porte derrière lui");
    expect(html).toContain("Ajouter un serveur");
  });

  it("ne signale aucune panne : rien n'a échoué", () => {
    const html = renderToStaticMarkup(
      <FirstRunScreen onAddServer={NOOP} onSettings={NOOP} />
    );

    expect(html).not.toContain("Réessayer");
    expect(html).not.toContain('data-shape="struck"');
  });
});

describe("processus et sessions", () => {
  it("rend ce qui pèse et ce qui survit, depuis le snapshot", () => {
    const html = renderToStaticMarkup(
      <ActivityPanel
        attached={["claude:flymate-api"]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(html).toContain("bun run dev");
    expect(html).toContain("63 %");
    expect(html).toContain("2,5 Go");
    expect(html).toContain("idea-backend");
    expect(html).toContain("éditeur distant");
  });

  it("distingue la session qu'un onglet de l'app tient encore", () => {
    const attached = renderToStaticMarkup(
      <ActivityPanel
        attached={["claude:flymate-api"]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        sessions={SNAPSHOT.sessions}
      />
    );
    const alone = renderToStaticMarkup(
      <ActivityPanel
        attached={[]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(attached).toContain("onglet ouvert");
    expect(alone).not.toContain("onglet ouvert");
  });
});

describe("le mode restreint de l'agent", () => {
  const IDLE: ReenrollState = { status: "idle" };

  type Props = ComponentProps<typeof ServerRestrictedNotice>;

  function restricted(over: Partial<Props> = {}): string {
    return renderToStaticMarkup(
      <ServerRestrictedNotice
        entitlement="restricted"
        onOpenConsole={NOOP}
        onRepair={NOOP}
        repair={IDLE}
        repairable={true}
        {...over}
      />
    );
  }

  it("dit pourquoi rien n'est possible et renvoie vers la console", () => {
    const html = restricted();

    expect(html).toContain("se laisse lire");
    expect(html).toContain("Rien de ce qui tournait dessus ne s&#x27;est");
    expect(html).toContain("dans la console");
    expect(html).toContain("Ouvrir la console");
  });

  it("ne dit rien d'un serveur dont le droit d'usage tient", () => {
    for (const entitlement of ["valid", "grace", "dev"] as const) {
      expect(restricted({ entitlement })).toBe("");
    }
  });

  /** The account is valid, the server isn't: the repair is offered. */
  it("offre le ré-enrôlement à côté de la console", () => {
    const html = restricted();

    expect(html).toContain("Ré-enrôler ce serveur");
    expect(html).toContain("Ouvrir la console");
  });

  it("dit que l'échange est en cours pendant qu'il se fait", () => {
    const html = restricted({
      repair: { serverId: "srv-1", status: "running" },
    });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  /**
   * Without an entitlement the platform would refuse the token, so the app does
   * not offer a gesture that would repair nothing. The console stays available.
   */
  it("n'offre pas la réparation quand le compte n'a pas de droit d'usage", () => {
    const html = restricted({ repairable: false });

    expect(html).not.toContain("Ré-enrôler ce serveur");
    expect(html).toContain("Ouvrir la console");
    expect(html).toContain("se laisse lire");
  });

  it("affiche le refus et son remède tels quels quand l'échange échoue", () => {
    const html = restricted({
      repair: {
        error: {
          code: "entitlement_required",
          fix: "Régularise l'abonnement dans la console.",
          message: "Cette organisation n'a pas d'abonnement en cours.",
        },
        serverId: "srv-1",
        status: "failed",
      },
    });

    expect(html).toContain("Cette organisation n&#x27;a pas d&#x27;abonnement");
    expect(html).toContain("Régularise l&#x27;abonnement dans la console.");
  });
});

describe("qui peut réparer un serveur restreint", () => {
  function account(over: Partial<AccountState> = {}): AccountState {
    return {
      build: "production",
      checkedAt: "2026-09-05T10:00:00Z",
      consoleUrl: "https://app.pupitre.test/dashboard",
      device: {
        fingerprint: "SHA256:abc",
        id: "dev-1",
        name: "Atelier",
        publicKey: "ssh-ed25519 AAAA",
      },
      identity: null,
      refusal: null,
      sealed: true,
      usage: {
        entitlement: "valid",
        source: "platform",
        status: "granted",
        validUntil: null,
      },
      ...over,
    };
  }

  it("laisse réparer un compte dont le droit d'usage tient", () => {
    expect(repairable(account())).toBe(true);
  });

  it("ne laisse pas réparer un compte sans droit d'usage", () => {
    const refused = [
      { consoleUrl: "https://app.pupitre.test/dashboard", status: "absent" },
      { consoleUrl: "https://app.pupitre.test/dashboard", status: "suspended" },
      {
        consoleUrl: "https://app.pupitre.test/dashboard",
        since: "2026-08-01T10:00:00Z",
        status: "stale",
      },
    ] as const;

    for (const usage of refused) {
      expect(repairable(account({ usage }))).toBe(false);
    }
  });

  /** A development build with no known device: nothing to sign, nothing to repair. */
  it("ne laisse pas réparer sans appareil connu de la console", () => {
    expect(
      repairable(
        account({
          build: "development",
          device: null,
          usage: {
            entitlement: "none",
            source: "development",
            status: "granted",
            validUntil: null,
          },
        })
      )
    ).toBe(false);
  });
});

describe("un serveur qu'on n'a pas encore joint", () => {
  it("dit qu'on le joint, sans parler de refus", () => {
    const html = renderToStaticMarkup(
      <ServerUnreadyScreen
        error={null}
        onInstall={NOOP}
        onRetry={NOOP}
        onSettings={NOOP}
        server={SERVER}
      />
    );

    expect(html).toContain('data-unready="reaching"');
    expect(html).toContain("Connexion à Atelier");
    expect(html).toContain("dev@atelier.example.net:22");
    expect(html).not.toContain("ne répond pas");
    expect(html).not.toContain("Installer l&#x27;agent");
  });
});

describe("les flèches de l'historique", () => {
  it("nomment les deux sens avec leur raccourci et éteignent celui sans suite", () => {
    const html = renderToStaticMarkup(
      <HistoryArrows
        canGoBack={true}
        canGoForward={false}
        onBack={NOOP}
        onForward={NOOP}
      />
    );

    expect(html).toContain('aria-label="Retour (');
    expect(html).toContain('data-tooltip="Retour (');
    expect(html).toContain('aria-label="Avancer (');
    expect(html).toMatch(/aria-label="Avancer \([^"]*\)"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="Retour \([^"]*\)"[^>]*disabled=""/);
  });
});

describe("ce qui se dit au-dessus des écrans", () => {
  it("dit qu'un lien est perdu, et qu'il se rouvre", () => {
    const html = renderToStaticMarkup(
      <ServerLinkNotice
        channel="lost"
        onRetry={() => Promise.resolve()}
        serverName="Atelier"
        stale={null}
      />
    );

    expect(html).toContain("Connexion à Atelier perdue.");
    expect(html).toContain("Nouvelle tentative");
  });

  it("dit qu'un tableau de bord ne bouge plus, avec le mot de l'agent et une relecture", () => {
    const html = renderToStaticMarkup(
      <ServerLinkNotice
        channel="open"
        onRetry={() => Promise.resolve()}
        serverName="Atelier"
        stale={{
          code: "disconnected",
          message: "La session SSH s'est fermée.",
          fix: "Vérifie que la machine répond.",
        }}
      />
    );

    expect(html).toContain("Atelier ne répond plus.");
    expect(html).toContain("Vérifie que la machine répond.");
    expect(html).toContain("Relire");
  });

  it("ne dit rien quand le lien tient et que le relevé est frais", () => {
    const html = renderToStaticMarkup(
      <ServerLinkNotice
        channel="open"
        onRetry={() => Promise.resolve()}
        serverName="Atelier"
        stale={null}
      />
    );

    expect(html).toBe("");
  });

  it("demande confirmation avant de tuer un processus ou une session", () => {
    const html = renderToStaticMarkup(
      <ActivityPanel
        attached={[]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(html).toContain(">Arrêter<");
    expect(html).not.toContain("Envoie SIGTERM");
  });
});
