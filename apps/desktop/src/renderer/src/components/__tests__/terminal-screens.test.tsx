import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { noteStatus } from "../../lib/terminal-status";
import { TerminalEndedBar } from "../terminals/terminal-ended-bar";
import { TerminalNewButton } from "../terminals/terminal-new-button";
import { TerminalSearchBar } from "../terminals/terminal-search-bar";
import { TerminalStatusBar } from "../terminals/terminal-status-bar";
import { TerminalTab } from "../terminals/terminal-tab";

const NOOP = () => undefined;

describe("un onglet de session", () => {
  it("est un onglet au sens du clavier, et dit ce que fait sa session", () => {
    const html = renderToStaticMarkup(
      <TerminalTab
        active
        chord="⌘"
        onActivate={NOOP}
        onClose={NOOP}
        onRename={NOOP}
        session={{
          dir: null,
          dormant: false,
          id: "t1",
          kind: "claude",
          project: "flymate-api",
          session: "claude-flymate-api",
          title: "Claude",
        }}
        state="attention"
      />
    );

    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-shape="ringed"');
    expect(html).toContain('data-terminal-kind="claude"');
    expect(html).toContain("<title>Claude</title>");
    expect(html).toContain("Fermer l&#x27;onglet (⌘W)");
  });

  it("cache le bouton de fermeture d'un onglet qui n'est pas devant", () => {
    const html = renderToStaticMarkup(
      <TerminalTab
        active={false}
        chord="⌘"
        onActivate={NOOP}
        onClose={NOOP}
        onRename={NOOP}
        session={{
          dir: null,
          dormant: false,
          id: "t2",
          kind: "shell",
          project: null,
          session: null,
          title: "Terminal 2",
        }}
        state={undefined}
      />
    );

    expect(html).toContain("opacity-0");
    expect(html).toContain('tabindex="-1"');
  });
});

describe("le bouton d'une nouvelle session", () => {
  it("ouvre un shell sans rien demander quand c'est tout ce que la machine offre", () => {
    const html = renderToStaticMarkup(
      <TerminalNewButton chord="⌘" kinds={["shell"]} onNew={NOOP} />
    );

    expect(html).toContain('aria-label="Nouvelle session (⌘T)"');
    expect(html).not.toContain("aria-haspopup");
  });

  it("ouvre la liste des agents installés quand il y en a", () => {
    const html = renderToStaticMarkup(
      <TerminalNewButton
        chord="⌘"
        kinds={["shell", "claude", "opencode"]}
        onNew={NOOP}
      />
    );

    expect(html).toContain('aria-label="Nouvelle session (⌘T)"');
    expect(html).toContain('aria-haspopup="menu"');
  });
});

describe("la fin d'une session", () => {
  it("dit le code de sortie et offre de rouvrir ou de fermer", () => {
    const html = renderToStaticMarkup(
      <TerminalEndedBar code={130} onClose={NOOP} onReopen={NOOP} />
    );

    expect(html).toContain('data-ended="130"');
    expect(html).toContain("Session terminée");
    expect(html).toContain("code 130");
    expect(html).toContain("Rouvrir");
    expect(html).toContain("Fermer l&#x27;onglet");
    expect(html).toContain('data-tone="danger"');
  });

  it("reste neutre quand le processus est sorti proprement", () => {
    const html = renderToStaticMarkup(
      <TerminalEndedBar code={0} onClose={NOOP} onReopen={NOOP} />
    );

    expect(html).toContain('data-tone="neutral"');
  });
});

describe("la barre de statut", () => {
  it("dit où est la session, son dossier et sa taille", () => {
    noteStatus("t-status", { cols: 132, dir: "/home/dev/app", rows: 43 });

    const html = renderToStaticMarkup(
      <TerminalStatusBar
        id="t-status"
        kind="shell"
        project="flymate-api"
        state="idle"
      />
    );

    expect(html).toContain("flymate-api");
    expect(html).toContain("/home/dev/app");
    expect(html).toContain("132×43");
    expect(html).toContain("au repos");
  });

  it("nomme le serveur quand la session n'a pas de projet", () => {
    const html = renderToStaticMarkup(
      <TerminalStatusBar
        id="t-bare"
        kind="shell"
        project={null}
        state={undefined}
      />
    );

    expect(html).toContain("serveur");
    expect(html).not.toContain("×");
  });
});

describe("la recherche", () => {
  it("s'ouvre sur un champ et ses trois boutons", () => {
    const html = renderToStaticMarkup(
      <TerminalSearchBar id="t-search" onClose={NOOP} />
    );

    expect(html).toContain("<search");
    expect(html).toContain("Chercher…");
    expect(html).toContain("Occurrence suivante");
    expect(html).toContain("Occurrence précédente");
    expect(html).toContain("Fermer la recherche");
  });
});
