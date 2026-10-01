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

const NOOP = () => undefined;

const SERVER: Server = {
  host: "atelier.example.net",
  id: "srv-1",
  name: "Atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

describe("the sidebar", () => {
  it("ranks its entries on three levels and marks the active entry", () => {
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
        selection="flyleaf-api"
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

  it("names the organization the console attaches the server to", () => {
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

  it("lists the snapshot's projects with their state and memory", () => {
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

    expect(html).toContain("flyleaf-api");
    expect(html).toContain("412 Mo");
    expect(html).toContain('data-shape="filled"');
    expect(html).toContain('data-shape="empty"');
    expect(html).toContain('data-shape="struck"');
  });
});

describe("a server that does not answer yet", () => {
  it("shows the agent's message and fix, as they are", () => {
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

describe("the app without a single machine", () => {
  it("says what the assistant will do, in the order it does it", () => {
    const html = renderToStaticMarkup(
      <FirstRunScreen onAddServer={NOOP} onSettings={NOOP} />
    );

    expect(html).toContain("Prenez une machine en main");
    expect(html).toContain("Pupitre inspecte la machine");
    expect(html).toContain("Pupitre installe ce que vous choisissez");
    expect(html).toContain("Pupitre ferme l&#x27;accès root");
    expect(html).toContain("Ajouter un serveur");
  });

  it("reports no failure: nothing has failed", () => {
    const html = renderToStaticMarkup(
      <FirstRunScreen onAddServer={NOOP} onSettings={NOOP} />
    );

    expect(html).not.toContain("Réessayer");
    expect(html).not.toContain('data-shape="struck"');
  });
});

describe("processes and sessions", () => {
  it("renders what weighs and what survives, from the snapshot", () => {
    const html = renderToStaticMarkup(
      <ActivityPanel
        attached={["claude:flyleaf-api"]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        serverName="atelier"
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(html).toContain("bun run dev");
    expect(html).toContain("63 %");
    expect(html).toContain("2,5 Go");
    expect(html).toContain("idea-backend");
    expect(html).toContain("éditeur distant");
  });

  it("distinguishes the session an app tab still holds", () => {
    const attached = renderToStaticMarkup(
      <ActivityPanel
        attached={["claude:flyleaf-api"]}
        lingering={[]}
        onCleanSessions={NOOP}
        onReattach={NOOP}
        onRetryProcesses={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        processesProblem={null}
        serverName="atelier"
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
        serverName="atelier"
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(attached).toContain("onglet ouvert");
    expect(alone).not.toContain("onglet ouvert");
  });
});

describe("the agent's restricted mode", () => {
  const IDLE: ReenrollState = { status: "idle" };

  type Props = ComponentProps<typeof ServerRestrictedNotice>;

  function restricted(over: Partial<Props> = {}): string {
    return renderToStaticMarkup(
      <ServerRestrictedNotice
        license="restricted"
        onOpenConsole={NOOP}
        onRepair={NOOP}
        repair={IDLE}
        repairable={true}
        {...over}
      />
    );
  }

  it("says why nothing is possible and points to the console", () => {
    const html = restricted();

    expect(html).toContain("se laisse lire");
    expect(html).toContain("Rien de ce qui tournait dessus ne s&#x27;est");
    expect(html).toContain("une licence est requise au-delà");
    expect(html).toContain("Ouvrir la console");
  });

  it("says nothing about a server whose licence holds", () => {
    for (const license of ["valid", "grace", "dev"] as const) {
      expect(restricted({ license })).toBe("");
    }
  });

  it("offers re-enrolment next to the console", () => {
    const html = restricted();

    expect(html).toContain("Rattacher à nouveau ce serveur");
    expect(html).toContain("Ouvrir la console");
  });

  it("says the exchange is in progress while it runs", () => {
    const html = restricted({
      repair: { serverId: "srv-1", status: "running" },
    });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  // Without a licence the platform would refuse the token, so a repair would fix nothing.
  it("does not offer the repair when the account has no licence", () => {
    const html = restricted({ repairable: false });

    expect(html).not.toContain("Rattacher à nouveau ce serveur");
    expect(html).toContain("Ouvrir la console");
    expect(html).toContain("se laisse lire");
  });

  it("shows the refusal and its fix as they are when the exchange fails", () => {
    const html = restricted({
      repair: {
        error: {
          code: "license_required",
          fix: "Régularise la licence dans la console.",
          message: "Cette organisation n'a pas de licence en cours.",
        },
        serverId: "srv-1",
        status: "failed",
      },
    });

    expect(html).toContain("Cette organisation n&#x27;a pas de licence");
    expect(html).toContain("Régularise la licence dans la console.");
  });
});

describe("who can repair a restricted server", () => {
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
        license: "valid",
        source: "platform",
        status: "granted",
        validUntil: null,
      },
      ...over,
    };
  }

  it("lets an account whose licence holds repair", () => {
    expect(repairable(account())).toBe(true);
  });

  it("does not let an account without a licence repair", () => {
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

  it("does not allow repair without a device the console knows", () => {
    expect(
      repairable(
        account({
          build: "development",
          device: null,
          usage: {
            license: "none",
            source: "development",
            status: "granted",
            validUntil: null,
          },
        })
      )
    ).toBe(false);
  });
});

describe("a server not yet reached", () => {
  it("says it is being reached, without mentioning a refusal", () => {
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

describe("the history arrows", () => {
  it("name both directions with their shortcut and dim the one with nothing further", () => {
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

describe("what is said above the screens", () => {
  it("says a link is lost, and that it reopens", () => {
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

  it("says a dashboard has stopped moving, with the agent's word and a reread", () => {
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
    expect(html).toContain("Actualiser");
  });

  it("says nothing when the link holds and the reading is fresh", () => {
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

  it("asks for confirmation before killing a process or a session", () => {
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
        serverName="atelier"
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(html).toContain(">Arrêter<");
    expect(html).not.toContain("Envoie SIGTERM");
  });
});
