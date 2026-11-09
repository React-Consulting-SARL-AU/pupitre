import { afterEach, describe, expect, it } from "bun:test";
import type { AgentError, AgentResponse } from "@shared/agent";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { REATTACH_MS, useProcessConsole } from "../process-console";

const TARGET = {
  id: "console-srv-1-flyleaf-web",
  process: "web",
  project: "flyleaf",
  serverId: "srv-1",
};

const NO_WINDOW: AgentError = {
  code: "project_not_found",
  fix: "Démarrez-le avec project.up : sa fenêtre s'ouvre au démarrage.",
  message: "flyleaf/web n'a pas de fenêtre ouverte",
};

const state = () => useProcessConsole.getState().consoles[TARGET.id];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Stubbed {
  attaches: number;
  follows: { lines: number; cancelled: boolean }[];
}

function stub(
  answers: AgentResponse<{ session: string }>[],
  journal: AgentResponse<{ lines: string[] }> = {
    ok: true,
    result: { lines: [] },
  }
): Stubbed {
  const seen: Stubbed = { attaches: 0, follows: [] };

  stubPupitre({
    followProjectJournal: (_server, _project, _process, lines) => {
      const follow = { cancelled: false, lines };

      seen.follows.push(follow);

      return {
        cancel: () => {
          follow.cancelled = true;
        },
        done: Promise.resolve(journal),
      };
    },
    openProcessConsole: () => {
      const answer = answers[Math.min(seen.attaches, answers.length - 1)];

      seen.attaches += 1;

      return Promise.resolve(answer as AgentResponse<{ session: string }>);
    },
  });

  return seen;
}

afterEach(() => {
  useProcessConsole.getState().close(TARGET.id);
});

describe("a process console", () => {
  it("watches the process's window live once the agent hands it over", async () => {
    stub([{ ok: true, result: { session: "pupitre-view-1a2b3c4d" } }]);

    await useProcessConsole.getState().open(TARGET);

    expect(state()).toEqual({ status: "live" });
  });

  it("falls back on the journal of a process with no window, and says why", async () => {
    const seen = stub([{ error: NO_WINDOW, ok: false }]);

    await useProcessConsole.getState().open(TARGET);

    expect(state()).toEqual({ status: "journal", why: NO_WINDOW });
    expect(seen.follows).toHaveLength(1);
  });

  it("falls back on the journal too when the agent predates the console", async () => {
    stub([
      {
        error: {
          code: "unknown_command",
          fix: "Mettez à jour l'agent depuis la page du serveur.",
          message: "L'agent 2.2.1 de ce serveur ne connaît pas project.attach.",
        },
        ok: false,
      },
    ]);

    await useProcessConsole.getState().open(TARGET);

    expect(state()?.status).toBe("journal");
  });

  it("says any other refusal as it came", async () => {
    stub([
      {
        error: { code: "internal", message: "tmux ne répond pas" },
        ok: false,
      },
    ]);

    await useProcessConsole.getState().open(TARGET);

    expect(state()).toEqual({
      error: { code: "internal", message: "tmux ne répond pas" },
      status: "failed",
    });
  });

  it("lets the journal go when the window comes back", async () => {
    const seen = stub([
      { error: NO_WINDOW, ok: false },
      { ok: true, result: { session: "pupitre-view-5e6f7a8b" } },
    ]);

    await useProcessConsole.getState().open(TARGET);
    await useProcessConsole.getState().open(TARGET);

    expect(state()).toEqual({ status: "live" });
    expect(seen.follows[0]?.cancelled).toBe(true);
  });

  it("reattaches after a restart, once the next window has had time to open", async () => {
    const seen = stub([
      { ok: true, result: { session: "pupitre-view-1a2b3c4d" } },
    ]);

    await useProcessConsole.getState().open(TARGET);
    useProcessConsole.getState().ended(TARGET);

    expect(seen.attaches).toBe(1);

    await wait(REATTACH_MS + 50);

    expect(seen.attaches).toBe(2);
    expect(state()).toEqual({ status: "live" });
  });

  it("never reattaches a console that was closed meanwhile", async () => {
    const seen = stub([
      { ok: true, result: { session: "pupitre-view-1a2b3c4d" } },
    ]);

    await useProcessConsole.getState().open(TARGET);
    useProcessConsole.getState().ended(TARGET);
    useProcessConsole.getState().close(TARGET.id);

    await wait(REATTACH_MS + 50);

    expect(seen.attaches).toBe(1);
    expect(state()).toBeUndefined();
  });
});
