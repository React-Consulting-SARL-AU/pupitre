import { beforeEach, describe, expect, it } from "bun:test";
import type { Navigation } from "@renderer/lib/memory";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { restoredTerminals, useNavigation } from "../navigation";

const KEY = "pupitre.navigation.v1";

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

/** What a previous run left on the disk, as this one will read it. */
function remembered(memory: Navigation & { terminals?: unknown[] }): void {
  held.clear();
  held.set(KEY, JSON.stringify(memory));
}

function where() {
  const { view, selection, cursor, history } = useNavigation.getState();

  return { cursor, length: history.length, selection, view };
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
      view: "dashboard",
    });
  });

  it("revient en arrière puis en avant sur les vues traversées", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.select("flymate-api");

    expect(where()).toMatchObject({ cursor: 2, length: 3, view: "project" });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ cursor: 1, view: "services" });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ cursor: 0, view: "dashboard" });

    useNavigation.getState().forward();
    useNavigation.getState().forward();

    expect(where()).toMatchObject({
      cursor: 2,
      selection: "flymate-api",
      view: "project",
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
    nav.select("flymate-api");
    nav.select("flymate-api");

    expect(where()).toMatchObject({ cursor: 2, length: 3 });
  });

  it("distingue deux projets mais pas deux fois le tableau de bord", () => {
    const nav = useNavigation.getState();

    nav.select("flymate-api");
    nav.select("atlas-web");
    nav.goTo("dashboard");

    expect(where()).toMatchObject({ cursor: 3, length: 4 });

    useNavigation.getState().back();

    expect(where()).toMatchObject({ selection: "atlas-web", view: "project" });
  });

  it("retire de l'historique un projet qui a quitté le registre", () => {
    const nav = useNavigation.getState();

    nav.select("flymate-api");
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
    useNavigation.getState().select("flymate-api");

    const before = useNavigation.getState();

    before.settle(["flymate-api", "atlas-web"]);

    expect(useNavigation.getState().history).toBe(before.history);
  });

  it("recommence sur un autre serveur", () => {
    const nav = useNavigation.getState();

    nav.goTo("services");
    nav.select("flymate-api");
    useNavigation.getState().reset();

    expect(where()).toEqual({
      cursor: 0,
      length: 1,
      selection: null,
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
      terminalTabs: { "@server:shell": "t2", "flymate-api:claude": "t1" },
      terminals: [
        tab({
          id: "t1",
          kind: "claude",
          project: "flymate-api",
          session: "claude-flymate-api",
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
      "claude-flymate-api",
      "shell-server-t2",
    ]);
    expect(state.activeTabs).toEqual({
      "@server:shell": "t2",
      "flymate-api:claude": "t1",
    });
    expect(state.activeTerminal).toBe("t2");
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
      terminalTabs: { "@server:shell": "t9" },
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

    const written = JSON.parse(held.get(KEY) ?? "{}") as Navigation;

    expect(written.terminals).toMatchObject([
      { kind: "shell", title: "Le build" },
    ]);
  });

  it("retire l'onglet remémoré d'un projet que le registre ne déclare plus", () => {
    remembered({
      terminalTabs: { "@server:shell": "t2", "flymate-api:claude": "t1" },
      terminals: [
        tab({ id: "t1", kind: "claude", project: "flymate-api" }),
        tab({ id: "t2" }),
      ],
    });

    useNavigation.setState(restoredTerminals());
    useNavigation.getState().settle(["atlas-web"]);

    const state = useNavigation.getState();

    expect(state.terminals.map((terminal) => terminal.id)).toEqual(["t2"]);
    expect(state.activeTabs).toEqual({ "@server:shell": "t2" });
  });

  it("garde l'onglet ouvert d'un projet disparu : c'est le travail du lecteur", () => {
    useNavigation.getState().openTerminal("flymate-api", "shell");
    useNavigation.getState().settle(["atlas-web"]);

    expect(useNavigation.getState().terminals).toHaveLength(1);
  });
});
