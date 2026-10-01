import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { noteStatus } from "../../lib/terminal-status";
import { TerminalEndedBar } from "../terminals/terminal-ended-bar";
import { TerminalNewButton } from "../terminals/terminal-new-button";
import { TerminalSearchBar } from "../terminals/terminal-search-bar";
import { TerminalStatusBar } from "../terminals/terminal-status-bar";
import { TerminalTab } from "../terminals/terminal-tab";

const NOOP = () => undefined;

describe("a session tab", () => {
  it("is a tab in the keyboard sense, and says what its session does", () => {
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
          project: "flyleaf-api",
          session: "claude-flyleaf-api",
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
    expect(html).toContain("Fermer l&#x27;onglet et arrêter la session (⌘W)");
  });

  it("hides the close button of a tab that is not in front", () => {
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

describe("the new session button", () => {
  it("opens a shell without asking when that is all the machine offers", () => {
    const html = renderToStaticMarkup(
      <TerminalNewButton chord="⌘" kinds={["shell"]} onNew={NOOP} />
    );

    expect(html).toContain('aria-label="Nouvelle session (⌘T)"');
    expect(html).not.toContain("aria-haspopup");
  });

  it("opens the list of installed agents when there are any", () => {
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

describe("the end of a session", () => {
  it("states the exit code and offers to reopen or close", () => {
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

  it("stays neutral when the process exited cleanly", () => {
    const html = renderToStaticMarkup(
      <TerminalEndedBar code={0} onClose={NOOP} onReopen={NOOP} />
    );

    expect(html).toContain('data-tone="neutral"');
  });
});

describe("the status bar", () => {
  it("says where the session is, its folder and its size", () => {
    noteStatus("t-status", { cols: 132, dir: "/home/dev/app", rows: 43 });

    const html = renderToStaticMarkup(
      <TerminalStatusBar
        id="t-status"
        kind="shell"
        project="flyleaf-api"
        state="idle"
      />
    );

    expect(html).toContain("flyleaf-api");
    expect(html).toContain("/home/dev/app");
    expect(html).toContain("132×43");
    expect(html).toContain("au repos");
  });

  it("names the server when the session has no project", () => {
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

describe("the search", () => {
  it("opens on a field and its three buttons", () => {
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
