import { beforeEach, describe, expect, it } from "bun:test";
import type { Navigation } from "@renderer/lib/memory";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { restoredTerminals, useNavigation } from "../navigation";
import { useServers } from "../servers";

const STORAGE_ENTRY = "pupitre.navigation.v1";

const held = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    removeItem: (key: string) => held.delete(key),
    setItem: (key: string, value: string) => held.set(key, value),
  },
});

function remembered(memory: Navigation & { terminals?: unknown[] }): void {
  held.clear();
  held.set(STORAGE_ENTRY, JSON.stringify(memory));
}

function where() {
  const { view, selection, service, cursor, history } =
    useNavigation.getState();

  return { cursor, length: history.length, selection, service, view };
}

function tab(patch: Record<string, unknown>) {
  return {
    dir: null,
    id: "t1",
    kind: "shell",
    project: null,
    session: "shell-server-t1",
    title: "Terminal",
    ...patch,
  };
}

beforeEach(() => {
  stubPupitre({});
  held.clear();
  useNavigation.getState().reset();
});

describe("the navigation history", () => {
  it("starts from the dashboard with nothing behind it", () => {
    expect(where()).toEqual({
      cursor: 0,
      length: 1,
      selection: null,
      service: null,
      view: "dashboard",
    });
  });

  it("goes back then forward over the views it passed through", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.select("flyleaf-api");

    expect(where()).toMatchObject({ cursor: 2, length: 3, view: "project" });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ cursor: 1, view: "services" });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ cursor: 0, view: "dashboard" });

    useNavigation.getState().forward();
    useNavigation.getState().forward();

    expect(where()).toMatchObject({
      cursor: 2,
      selection: "flyleaf-api",
      view: "project",
    });
  });

  it("counts a service's page as one page more than the list", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.openService("db.postgres");

    expect(where()).toMatchObject({
      cursor: 2,
      length: 3,
      service: "db.postgres",
      view: "services",
    });

    useNavigation.getState().back();

    expect(where()).toMatchObject({
      cursor: 1,
      service: null,
      view: "services",
    });

    useNavigation.getState().forward();

    expect(where()).toMatchObject({
      cursor: 2,
      service: "db.postgres",
      view: "services",
    });
  });

  it("returns to the service list by one more step, not a step back", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.openService("db.postgres");
    useNavigation.getState().goTo("services");

    expect(where()).toMatchObject({
      cursor: 3,
      length: 4,
      service: null,
      view: "services",
    });

    useNavigation.getState().back();

    expect(where().service).toBe("db.postgres");
  });

  it("opens the same service twice on a single page", () => {
    const nav = useNavigation.getState();

    nav.openService("db.postgres");
    useNavigation.getState().openService("db.postgres");

    expect(where()).toMatchObject({ cursor: 1, length: 2 });

    useNavigation.getState().openService("tool.github");

    expect(where()).toMatchObject({
      cursor: 2,
      length: 3,
      service: "tool.github",
    });
  });

  it("leaves a service's page when changing view", () => {
    const nav = useNavigation.getState();

    nav.openService("db.postgres");
    useNavigation.getState().goTo("activity");

    expect(where().service).toBeNull();

    useNavigation.getState().back();

    expect(where()).toMatchObject({
      service: "db.postgres",
      view: "services",
    });
  });

  it("goes past neither the start nor the end", () => {
    useNavigation.getState().back();

    expect(where().cursor).toBe(0);

    useNavigation.getState().goTo("shots");
    useNavigation.getState().forward();

    expect(where()).toMatchObject({ cursor: 1, view: "shots" });
  });

  it("forgets what was ahead when restarting from a point in the past", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.goTo("activity");
    useNavigation.getState().back();
    useNavigation.getState().goTo("shots");

    expect(where()).toMatchObject({ cursor: 2, length: 3, view: "shots" });

    useNavigation.getState().forward();

    expect(where().view).toBe("shots");
  });

  it("does not write the same page twice", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.goTo("services");
    nav.select("flyleaf-api");
    nav.select("flyleaf-api");

    expect(where()).toMatchObject({ cursor: 2, length: 3 });
  });

  it("tells two projects apart but not the dashboard twice", () => {
    const nav = useNavigation.getState();

    nav.select("flyleaf-api");
    nav.select("atlas-web");
    nav.goTo("dashboard");

    expect(where()).toMatchObject({ cursor: 3, length: 4 });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ selection: "atlas-web", view: "project" });
  });

  it("removes from the history a project that left the registry", () => {
    const nav = useNavigation.getState();

    nav.select("flyleaf-api");
    nav.select("atlas-web");
    nav.goTo("dashboard");
    useNavigation.getState().settle(["atlas-web"]);

    expect(where()).toMatchObject({ cursor: 2, length: 3, view: "dashboard" });

    useNavigation.getState().back();

    expect(where().selection).toBe("atlas-web");

    useNavigation.getState().back();

    expect(where().view).toBe("dashboard");
  });

  it("keeps the current selection when the open project is still there", () => {
    useNavigation.getState().select("flyleaf-api");

    const before = useNavigation.getState();

    before.settle(["flyleaf-api", "atlas-web"]);

    expect(useNavigation.getState().history).toBe(before.history);
  });

  it("starts over on another server", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.select("flyleaf-api");
    useNavigation.getState().reset();

    expect(where()).toEqual({
      cursor: 0,
      length: 1,
      selection: null,
      service: null,
      view: "dashboard",
    });
  });

  it("counts an open server terminal as a page", () => {
    useNavigation.getState().openTerminal(null, "shell");

    expect(where()).toMatchObject({ cursor: 1, view: "terminals" });

    useNavigation.getState().back();

    expect(where().view).toBe("dashboard");
  });
});

describe("tabs from one launch to the next", () => {
  it("rereads the tabs, their titles, their session and the one that was in front", () => {
    remembered({
      terminal: "t2",
      terminalTabs: { "@server": "t2", "flyleaf-api:agents": "t1" },
      terminals: [
        tab({
          id: "t1",
          kind: "claude",
          project: "flyleaf-api",
          session: "claude-flyleaf-api",
          title: "Claude",
        }),
        tab({ id: "t2", session: "shell-server-t2", title: "Le build" }),
      ],
    });

    useNavigation.setState(restoredTerminals());

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.title)).toEqual([
      "Claude",
      "Le build",
    ]);
    expect(state.terminals.map((terminal) => terminal.session)).toEqual([
      "claude-flyleaf-api",
      "shell-server-t2",
    ]);
    expect(state.activeTabs).toEqual({
      "@server": "t2",
      "flyleaf-api:agents": "t1",
    });
    expect(state.activeTerminal).toBe("t2");
  });

  it("forgets the front tab of a group that no tab forms", () => {
    remembered({
      terminalTabs: { "@server": "t1", "flyleaf-api:claude": "t1" },
      terminals: [tab({})],
    });

    useNavigation.setState(restoredTerminals());

    expect(useNavigation.getState().activeTabs).toEqual({ "@server": "t1" });
  });

  it("forgets the front tab of a row it does not belong to", () => {
    remembered({
      terminalTabs: { "flyleaf-api": "t1" },
      terminals: [tab({ kind: "claude", project: "flyleaf-api" })],
    });

    useNavigation.setState(restoredTerminals());

    expect(useNavigation.getState().activeTabs).toEqual({});
  });

  it("returns them closed, and going back to them is what reopens them", () => {
    remembered({ terminals: [tab({}), tab({ id: "t2" })] });

    useNavigation.setState(restoredTerminals());

    expect(
      useNavigation.getState().terminals.every((terminal) => terminal.dormant)
    ).toBe(true);

    useNavigation.getState().activateTerminal("t1");

    const opened = useNavigation.getState().terminals;

    expect(opened.find((terminal) => terminal.id === "t1")?.dormant).toBe(
      false
    );
    expect(opened.find((terminal) => terminal.id === "t2")?.dormant).toBe(true);
  });

  it("drops what it cannot reread, without losing the rest", () => {
    remembered({
      terminal: "t9",
      terminalTabs: { "@server": "t9" },
      terminals: [
        tab({ kind: "rm -rf /" }),
        { id: "t2" },
        tab({ id: "t3", title: "Tenu" }),
        "pas un onglet",
      ],
    });

    useNavigation.setState(restoredTerminals());

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.id)).toEqual(["t3"]);
    expect(state.activeTabs).toEqual({});
    expect(state.activeTerminal).toBeNull();
  });

  it("writes the open tabs, for the next launch", () => {
    useNavigation.getState().openTerminal(null, "shell");
    useNavigation
      .getState()
      .renameTerminal(useNavigation.getState().terminals[0].id, "Le build");

    const written = JSON.parse(held.get(STORAGE_ENTRY) ?? "{}") as Navigation;

    expect(written.terminals).toMatchObject([
      { kind: "shell", title: "Le build" },
    ]);
  });

  it("removes the remembered tab of a project the registry no longer declares", () => {
    remembered({
      terminalTabs: { "@server": "t2", "flyleaf-api:agents": "t1" },
      terminals: [
        tab({ id: "t1", kind: "claude", project: "flyleaf-api" }),
        tab({ id: "t2" }),
      ],
    });

    useNavigation.setState(restoredTerminals());
    useNavigation.getState().settle(["atlas-web"]);

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.id)).toEqual(["t2"]);
    expect(state.activeTabs).toEqual({ "@server": "t2" });
  });

  it("puts a project's shells in one row and its agents in the other", () => {
    const store = useNavigation.getState();
    const shell = store.openTerminal("flyleaf-api", "shell");
    const claude = store.openTerminal("flyleaf-api", "claude");
    const codex = store.openTerminal("flyleaf-api", "codex");
    const second = store.openTerminal("flyleaf-api", "claude");

    const state = useNavigation.getState();

    expect(
      state.terminals
        .filter((terminal) => terminal.project === "flyleaf-api")
        .map((terminal) => terminal.title)
    ).toEqual(["Terminal", "Claude", "Codex", "Claude 2"]);
    expect(state.activeTabs).toEqual({
      "flyleaf-api": shell,
      "flyleaf-api:agents": second,
    });

    useNavigation.getState().closeTerminal(second);

    expect(useNavigation.getState().activeTabs).toEqual({
      "flyleaf-api": shell,
      "flyleaf-api:agents": codex,
    });

    useNavigation.getState().activateTerminal(claude);
    useNavigation.getState().ensureTerminal("flyleaf-api");

    expect(useNavigation.getState().activeTabs).toEqual({
      "flyleaf-api": shell,
      "flyleaf-api:agents": claude,
    });
    expect(useNavigation.getState().terminals).toHaveLength(3);
  });

  it("closes the tab of an agent that exited, without killing anything on the machine", () => {
    const ends: unknown[] = [];

    stubPupitre({
      closeTerminal: (_id: string, end: unknown) => {
        ends.push(end);
      },
    });

    useServers.setState({ config: { active: "srv", servers: [] } });

    const claude = useNavigation
      .getState()
      .openTerminal("flyleaf-api", "claude");
    const codex = useNavigation.getState().openTerminal("flyleaf-api", "codex");

    useNavigation.getState().noteSession(claude, "claude-flyleaf-api");
    useNavigation.getState().noteSession(codex, "codex-flyleaf-api");
    useNavigation.getState().endTerminal(claude, 0);
    useNavigation.getState().closeTerminal(codex);

    expect(useNavigation.getState().terminals).toHaveLength(0);
    expect(ends).toEqual([
      null,
      { serverId: "srv", session: "codex-flyleaf-api" },
    ]);

    useServers.setState({ config: null });
  });

  it("closes an idle shell without asking, and asks before stopping an agent or a shell that is working", () => {
    const shell = useNavigation.getState().openTerminal(null, "shell");
    const busy = useNavigation.getState().openTerminal(null, "shell");
    const claude = useNavigation
      .getState()
      .openTerminal("flyleaf-api", "claude");

    for (const id of [shell, busy, claude]) {
      useNavigation.getState().noteSession(id, `session-${id}`);
    }

    useNavigation.getState().noteStates({
      [busy]: "working",
      [claude]: "idle",
      [shell]: "idle",
    });

    useNavigation.getState().askCloseTerminal(shell);

    expect(useNavigation.getState().closing).toBeNull();
    expect(
      useNavigation.getState().terminals.map((terminal) => terminal.id)
    ).toEqual([busy, claude]);

    useNavigation.getState().askCloseTerminal(busy);

    expect(useNavigation.getState().closing).toBe(busy);
    expect(useNavigation.getState().terminals).toHaveLength(2);

    useNavigation.getState().keepTerminal();

    expect(useNavigation.getState().closing).toBeNull();
    expect(useNavigation.getState().terminals).toHaveLength(2);

    useNavigation.getState().askCloseTerminal(claude);

    expect(useNavigation.getState().closing).toBe(claude);

    useNavigation.getState().closeTerminal(claude);

    expect(useNavigation.getState().closing).toBeNull();
    expect(
      useNavigation.getState().terminals.map((terminal) => terminal.id)
    ).toEqual([busy]);
  });

  it("closes without asking a tab whose session is over or was never named", () => {
    const claude = useNavigation
      .getState()
      .openTerminal("flyleaf-api", "claude");
    const codex = useNavigation.getState().openTerminal("flyleaf-api", "codex");

    useNavigation.getState().noteSession(claude, "claude-flyleaf-api");
    useNavigation.getState().noteStates({ [claude]: "finished" });

    useNavigation.getState().askCloseTerminal(claude);
    useNavigation.getState().askCloseTerminal(codex);

    expect(useNavigation.getState().closing).toBeNull();
    expect(useNavigation.getState().terminals).toHaveLength(0);
  });

  it("keeps the tab of a shell that exited, and that of an agent whose link broke", () => {
    const shell = useNavigation.getState().openTerminal("flyleaf-api", "shell");
    const claude = useNavigation
      .getState()
      .openTerminal("flyleaf-api", "claude");

    useNavigation.getState().endTerminal(shell, 0);
    useNavigation.getState().endTerminal(claude, 255);

    expect(
      useNavigation.getState().terminals.map((terminal) => terminal.id)
    ).toEqual([shell, claude]);
  });

  it("opens a shell on arrival only if the shell row is empty, never an agent", () => {
    useNavigation.getState().openTerminal("flyleaf-api", "claude");
    useNavigation.getState().ensureTerminal("flyleaf-api");

    const kinds = useNavigation
      .getState()
      .terminals.map((terminal) => terminal.kind);

    expect(kinds).toEqual(["claude", "shell"]);

    useNavigation.getState().ensureTerminal("flyleaf-api");

    expect(useNavigation.getState().terminals).toHaveLength(2);
  });

  it("keeps the open tab of a vanished project: that is the reader's job", () => {
    useNavigation.getState().openTerminal("flyleaf-api", "shell");
    useNavigation.getState().settle(["atlas-web"]);

    expect(useNavigation.getState().terminals).toHaveLength(1);
  });

  it("opens the shortcut's terminal in the displayed project, on its terminals tab", () => {
    useNavigation.getState().select("flyleaf-api");
    useNavigation.getState().setProjectTab("flyleaf-api", "files");
    useNavigation.getState().openTerminalHere();

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.project)).toEqual([
      "flyleaf-api",
    ]);
    expect(state.projectTabs["flyleaf-api"]).toBe("terminals");
    expect(where()).toMatchObject({
      selection: "flyleaf-api",
      view: "project",
    });
  });

  it("opens the shortcut's terminal on the server outside a project", () => {
    useNavigation.getState().goTo("services");
    useNavigation.getState().openTerminalHere();

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.project)).toEqual([null]);
    expect(where().view).toBe("terminals");
  });

  it("opens the shortcut's agent in the displayed project, on its agents tab, never on the server", () => {
    useNavigation.getState().select("flyleaf-api");
    useNavigation.getState().openTerminalHere("claude");

    expect(useNavigation.getState().projectTabs["flyleaf-api"]).toBe("agents");
    expect(
      useNavigation.getState().terminals.map((terminal) => terminal.kind)
    ).toEqual(["claude"]);

    useNavigation.getState().goTo("dashboard");
    useNavigation.getState().openTerminalHere("claude");

    expect(useNavigation.getState().terminals).toHaveLength(1);
    expect(where().view).toBe("dashboard");
  });
});
