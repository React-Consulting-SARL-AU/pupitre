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

describe("l'historique de navigation", () => {
  it("part du tableau de bord sans rien derrière", () => {
    expect(where()).toEqual({
      cursor: 0,
      length: 1,
      selection: null,
      service: null,
      view: "dashboard",
    });
  });

  it("revient en arrière puis en avant sur les vues traversées", () => {
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

  it("compte la page d'un service comme une page de plus que la liste", () => {
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

  it("revient à la liste des services par un pas de plus, pas un pas en arrière", () => {
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

  it("ouvre le même service deux fois sur une seule page", () => {
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

  it("quitte la page d'un service en changeant de vue", () => {
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

  it("ne dépasse ni le début ni la fin", () => {
    useNavigation.getState().back();

    expect(where().cursor).toBe(0);

    useNavigation.getState().goTo("shots");
    useNavigation.getState().forward();

    expect(where()).toMatchObject({ cursor: 1, view: "shots" });
  });

  it("oublie ce qui était devant quand on repart d'un point du passé", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.goTo("activity");
    useNavigation.getState().back();
    useNavigation.getState().goTo("shots");

    expect(where()).toMatchObject({ cursor: 2, length: 3, view: "shots" });

    useNavigation.getState().forward();

    expect(where().view).toBe("shots");
  });

  it("n'écrit pas deux fois la même page", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.goTo("services");
    nav.select("flyleaf-api");
    nav.select("flyleaf-api");

    expect(where()).toMatchObject({ cursor: 2, length: 3 });
  });

  it("distingue deux projets mais pas deux fois le tableau de bord", () => {
    const nav = useNavigation.getState();

    nav.select("flyleaf-api");
    nav.select("atlas-web");
    nav.goTo("dashboard");

    expect(where()).toMatchObject({ cursor: 3, length: 4 });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ selection: "atlas-web", view: "project" });
  });

  it("retire de l'historique un projet qui a quitté le registre", () => {
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

  it("garde la sélection courante quand le projet ouvert est toujours là", () => {
    useNavigation.getState().select("flyleaf-api");

    const before = useNavigation.getState();

    before.settle(["flyleaf-api", "atlas-web"]);

    expect(useNavigation.getState().history).toBe(before.history);
  });

  it("recommence sur un autre serveur", () => {
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

  it("compte un terminal du serveur ouvert comme une page", () => {
    useNavigation.getState().openTerminal(null, "shell");

    expect(where()).toMatchObject({ cursor: 1, view: "terminals" });

    useNavigation.getState().back();

    expect(where().view).toBe("dashboard");
  });
});

describe("les onglets d'un lancement à l'autre", () => {
  it("relit les onglets, leurs titres, leur session et celui qui était devant", () => {
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

  it("oublie l'onglet devant d'un groupe qu'aucun onglet ne forme", () => {
    remembered({
      terminalTabs: { "@server": "t1", "flyleaf-api:claude": "t1" },
      terminals: [tab({})],
    });

    useNavigation.setState(restoredTerminals());

    expect(useNavigation.getState().activeTabs).toEqual({ "@server": "t1" });
  });

  it("oublie l'onglet devant d'une rangée où il ne siège pas", () => {
    remembered({
      terminalTabs: { "flyleaf-api": "t1" },
      terminals: [tab({ kind: "claude", project: "flyleaf-api" })],
    });

    useNavigation.setState(restoredTerminals());

    expect(useNavigation.getState().activeTabs).toEqual({});
  });

  it("les rend fermés, et c'est y revenir qui les rouvre", () => {
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

  it("laisse tomber ce qu'elle ne sait pas relire, sans perdre le reste", () => {
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

  it("écrit les onglets ouverts, pour le lancement suivant", () => {
    useNavigation.getState().openTerminal(null, "shell");
    useNavigation
      .getState()
      .renameTerminal(useNavigation.getState().terminals[0].id, "Le build");

    const written = JSON.parse(held.get(STORAGE_ENTRY) ?? "{}") as Navigation;

    expect(written.terminals).toMatchObject([
      { kind: "shell", title: "Le build" },
    ]);
  });

  it("retire l'onglet remémoré d'un projet que le registre ne déclare plus", () => {
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

  it("met les shells d'un projet dans une rangée et ses agents dans l'autre", () => {
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

  it("ferme l'onglet d'un agent qui a quitté, sans rien tuer sur la machine", () => {
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

  it("ferme sans demander un shell au repos, et demande avant d'arrêter un agent ou un shell qui travaille", () => {
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

  it("ferme sans demander un onglet dont la session est finie ou n'a jamais été nommée", () => {
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

  it("garde l'onglet d'un shell qui a quitté, et celui d'un agent dont la liaison a rompu", () => {
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

  it("n'ouvre un shell à l'arrivée que si la rangée des shells est vide, jamais un agent", () => {
    useNavigation.getState().openTerminal("flyleaf-api", "claude");
    useNavigation.getState().ensureTerminal("flyleaf-api");

    const kinds = useNavigation
      .getState()
      .terminals.map((terminal) => terminal.kind);

    expect(kinds).toEqual(["claude", "shell"]);

    useNavigation.getState().ensureTerminal("flyleaf-api");

    expect(useNavigation.getState().terminals).toHaveLength(2);
  });

  it("garde l'onglet ouvert d'un projet disparu : c'est le travail du lecteur", () => {
    useNavigation.getState().openTerminal("flyleaf-api", "shell");
    useNavigation.getState().settle(["atlas-web"]);

    expect(useNavigation.getState().terminals).toHaveLength(1);
  });

  it("ouvre le terminal du raccourci dans le projet affiché, sur son onglet des terminaux", () => {
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

  it("ouvre le terminal du raccourci sur le serveur hors d'un projet", () => {
    useNavigation.getState().goTo("services");
    useNavigation.getState().openTerminalHere();

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.project)).toEqual([null]);
    expect(where().view).toBe("terminals");
  });

  it("ouvre l'agent du raccourci dans le projet affiché, sur son onglet des agents, jamais sur le serveur", () => {
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
