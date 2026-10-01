import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useTerminals } from "../terminals";

const SERVER = "srv-1";

beforeEach(() => {
  useTerminals.getState().reset();
});

describe("opening a session", () => {
  it("retains the session the agent named", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({
          ok: true,
          result: { session: "claude-flyleaf-api" },
        }),
    });

    await useTerminals
      .getState()
      .start("t1", SERVER, "claude", "flyleaf-api", null);

    expect(useTerminals.getState().sessions.t1).toEqual({
      session: "claude-flyleaf-api",
      status: "open",
    });
  });

  it("keeps the refusal and its fix as they are", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({
          error: {
            code: "module_not_found",
            fix: "Ajoute le module ai.hermes depuis l'écran Services.",
            message: "Hermes n'est pas installé sur ce serveur.",
          },
          ok: false,
        }),
    });

    await useTerminals
      .getState()
      .start("t2", SERVER, "hermes", "flyleaf-api", null);

    expect(useTerminals.getState().sessions.t2).toMatchObject({
      error: { fix: "Ajoute le module ai.hermes depuis l'écran Services." },
      status: "failed",
    });
  });

  it("opens only one session, even if the tab is mounted twice", async () => {
    let asked = 0;

    stubPupitre({
      openTerminal: () => {
        asked += 1;

        return Promise.resolve({ ok: true, result: { session: null } });
      },
    });

    const store = useTerminals.getState();

    await Promise.all([
      store.start("t3", SERVER, "shell", null, null),
      store.start("t3", SERVER, "shell", null, null),
    ]);

    expect(asked).toBe(1);
  });
});

describe("an agent's login", () => {
  it("exposes only the page's host, never its address", () => {
    useTerminals.getState().noteLink("t1", "claude.ai");

    expect(useTerminals.getState().links).toEqual({
      t1: { host: "claude.ai", opened: false },
    });
  });

  it("opens it in the browser naming the session, and retains it", async () => {
    const asked: string[] = [];

    stubPupitre({
      openLogin: (id) => {
        asked.push(id);

        return Promise.resolve(true);
      },
    });

    useTerminals.getState().noteLink("t1", "claude.ai");
    await useTerminals.getState().openLogin("t1");

    expect(asked).toEqual(["t1"]);
    expect(useTerminals.getState().links.t1).toEqual({
      host: "claude.ai",
      opened: true,
    });
  });

  it("does not report itself open when the main process refused", async () => {
    stubPupitre({ openLogin: () => Promise.resolve(false) });

    useTerminals.getState().noteLink("t9", "claude.ai");
    await useTerminals.getState().openLogin("t9");

    expect(useTerminals.getState().links.t9?.opened).toBe(false);
  });

  it("starts over when the session prints a new address", async () => {
    stubPupitre({ openLogin: () => Promise.resolve(true) });

    useTerminals.getState().noteLink("t1", "claude.ai");
    await useTerminals.getState().openLogin("t1");
    useTerminals.getState().noteLink("t1", "claude.ai");

    expect(useTerminals.getState().links.t1?.opened).toBe(false);
  });

  it("forgets itself when dismissed", () => {
    useTerminals.getState().noteLink("t1", "claude.ai");
    useTerminals.getState().dismissLogin("t1");

    expect(useTerminals.getState().links.t1).toBeUndefined();
  });
});

describe("the end of a session", () => {
  it("keeps the tab with its exit code", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({ ok: true, result: { session: "claude-app" } }),
    });

    await useTerminals.getState().start("t4", SERVER, "claude", "app", null);
    useTerminals.getState().noteExit("t4", 130);

    expect(useTerminals.getState().sessions.t4).toEqual({
      code: 130,
      session: "claude-app",
      status: "ended",
    });
  });

  it("ignores an exit for a session that was not open", () => {
    useTerminals.getState().noteExit("t-ghost", 0);

    expect(useTerminals.getState().sessions["t-ghost"]).toBeUndefined();
  });

  it("reopens a fresh process in the same tab", async () => {
    let opened = 0;

    stubPupitre({
      openTerminal: () => {
        opened += 1;

        return Promise.resolve({ ok: true, result: { session: null } });
      },
    });

    await useTerminals.getState().start("t5", SERVER, "shell", null, null);
    useTerminals.getState().noteExit("t5", 0);
    await useTerminals.getState().restart("t5", SERVER, "shell", null, null);

    expect(opened).toBe(2);
    expect(useTerminals.getState().sessions.t5).toEqual({
      session: null,
      status: "open",
    });
  });
});

describe("searching within a session", () => {
  it("is open on only one session at a time, and closes with it", () => {
    useTerminals.getState().openSearch("t1");
    useTerminals.getState().openSearch("t2");

    expect(useTerminals.getState().search).toBe("t2");

    useTerminals.getState().forget("t2");

    expect(useTerminals.getState().search).toBeNull();
  });
});

describe("the opening size", () => {
  it("opens the PTY at the measured size, otherwise at the classic 80×24", async () => {
    const opened: { cols: number; rows: number }[] = [];

    stubPupitre({
      openTerminal: (
        _id: string,
        _serverId: string,
        _kind: string,
        _project: string | null,
        _session: string | null,
        cols: number,
        rows: number
      ) => {
        opened.push({ cols, rows });

        return Promise.resolve({ ok: true, result: { session: "s" } });
      },
    });

    await useTerminals
      .getState()
      .start("t1", SERVER, "shell", null, null, null, { cols: 132, rows: 40 });
    await useTerminals.getState().start("t2", SERVER, "shell", null, null);

    expect(opened).toEqual([
      { cols: 132, rows: 40 },
      { cols: 80, rows: 24 },
    ]);
  });
});
