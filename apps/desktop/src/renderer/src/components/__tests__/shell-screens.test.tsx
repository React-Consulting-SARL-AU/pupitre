import { describe, expect, it } from "bun:test";
import type { AccountState } from "@shared/account";
import type { Server } from "@shared/servers";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROCESSES,
  SECRETS,
  SNAPSHOT,
} from "../../__tests__/snapshot-fixtures";
import { type ReenrollState, repairable } from "../../stores/reenroll";
import { ActivityPanel } from "../activity/activity-panel";
import { SecretsPanel } from "../secrets/secrets-panel";
import { AppSidebar } from "../shell/app-sidebar";
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
        onCloseTerminal={NOOP}
        onNewTerminal={NOOP}
        onProject={NOOP}
        onTerminal={NOOP}
        onView={NOOP}
        projects={SNAPSHOT.projects}
        selection="flymate-api"
        server={SERVER}
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

  it("liste les projets du snapshot avec leur état et leur mémoire", () => {
    const html = renderToStaticMarkup(
      <AppSidebar
        activeTerminal={null}
        allTerminals={[]}
        onCloseTerminal={NOOP}
        onNewTerminal={NOOP}
        onProject={NOOP}
        onTerminal={NOOP}
        onView={NOOP}
        projects={SNAPSHOT.projects}
        selection={null}
        server={SERVER}
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

  it("propose d'ajouter un serveur quand il n'y en a aucun", () => {
    const html = renderToStaticMarkup(
      <ServerUnreadyScreen
        error={null}
        onInstall={NOOP}
        onRetry={NOOP}
        onSettings={NOOP}
        server={null}
      />
    );

    expect(html).toContain("Aucun serveur pour l&#x27;instant");
    expect(html).toContain("Ajouter un serveur");
  });
});

describe("processus et sessions", () => {
  it("rend ce qui pèse et ce qui survit, depuis le snapshot", () => {
    const html = renderToStaticMarkup(
      <ActivityPanel
        attached={["claude:flymate-api"]}
        onCleanSessions={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
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
        onCleanSessions={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        sessions={SNAPSHOT.sessions}
      />
    );
    const alone = renderToStaticMarkup(
      <ActivityPanel
        attached={[]}
        onCleanSessions={NOOP}
        onStopProcess={NOOP}
        onStopSession={NOOP}
        processes={PROCESSES}
        sessions={SNAPSHOT.sessions}
      />
    );

    expect(attached).toContain("onglet ouvert");
    expect(alone).not.toContain("onglet ouvert");
  });
});

describe("les secrets", () => {
  it("montre les clés et leur état, jamais une valeur", () => {
    const html = renderToStaticMarkup(
      <SecretsPanel
        onOpen={NOOP}
        onReload={NOOP}
        onSave={NOOP}
        open={null}
        problem={null}
        saved={null}
        saving={null}
        state={{ secrets: SECRETS, status: "read" }}
      />
    );

    expect(html).toContain("GITHUB_TOKEN");
    expect(html).toContain("CLOUDFLARE_TOKEN");
    expect(html).toContain("en place");
    expect(html).toContain("absente");
    expect(html).toContain("1 sur 2 en place");
  });

  it("dit le remède de l'agent quand il refuse une valeur", () => {
    const html = renderToStaticMarkup(
      <SecretsPanel
        onOpen={NOOP}
        onReload={NOOP}
        onSave={NOOP}
        open={null}
        problem={{
          code: "bad_request",
          fix: "Donne une valeur sur une seule ligne.",
          message: "La valeur tient sur plusieurs lignes.",
        }}
        saved={null}
        saving={null}
        state={{ secrets: SECRETS, status: "read" }}
      />
    );

    expect(html).toContain("plusieurs lignes");
    expect(html).toContain("une seule ligne");
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

  /** Le compte est valide, le serveur ne l'est pas : la réparation est offerte. */
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
   * Le compte n'a pas de droit d'usage : la plateforme refuserait le jeton, et
   * l'app n'offre pas un geste qui ne réparerait rien. La console reste là.
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

  /** Un build de développement sans appareil connu : rien à signer, rien à réparer. */
  it("ne laisse pas réparer sans appareil connu de la plateforme", () => {
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
