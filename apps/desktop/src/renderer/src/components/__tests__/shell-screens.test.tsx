import { describe, expect, it } from "bun:test";
import type { Server } from "@shared/servers";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROCESSES,
  SECRETS,
  SNAPSHOT,
} from "../../__tests__/snapshot-fixtures";
import { ActivityPanel } from "../activity/activity-panel";
import { SecretsPanel } from "../secrets/secrets-panel";
import { AppSidebar } from "../shell/app-sidebar";
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
