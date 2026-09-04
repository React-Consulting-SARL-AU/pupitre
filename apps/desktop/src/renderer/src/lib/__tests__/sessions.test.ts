import { describe, expect, it } from "bun:test";
import type { Session } from "@pupitre/shared/agent-protocol/state";
import type { Terminal } from "@shared/terminals";
import { attachedSessions, isAttached } from "../sessions";

const TABS: Terminal[] = [
  {
    dir: null,
    id: "t1",
    kind: "claude",
    project: "flymate-api",
    title: "Claude",
  },
  { dir: null, id: "t2", kind: "shell", project: "flymate-api", title: "T" },
  { dir: null, id: "t3", kind: "codex", project: null, title: "Codex" },
];

function session(patch: Partial<Session>): Session {
  return {
    command: "claude",
    kind: "claude",
    pid: 10,
    ram_mb: 100,
    seconds: 10,
    ...patch,
  };
}

describe("attachedSessions", () => {
  it("ne retient que les agents ouverts sur un projet", () => {
    expect(attachedSessions(TABS)).toEqual(["claude:flymate-api"]);
  });
});

describe("isAttached", () => {
  it("reconnaît la session que l'onglet tient", () => {
    expect(
      isAttached(["claude:flymate-api"], session({ project: "flymate-api" }))
    ).toBe(true);
  });

  it("laisse traîner celle d'un autre projet ou d'un autre agent", () => {
    expect(
      isAttached(["claude:flymate-api"], session({ project: "atlas-web" }))
    ).toBe(false);
    expect(
      isAttached(
        ["claude:flymate-api"],
        session({ kind: "codex", project: "flymate-api" })
      )
    ).toBe(false);
  });

  it("ne parle jamais d'un shell ni d'un éditeur distant", () => {
    expect(
      isAttached(
        ["claude:flymate-api"],
        session({ kind: "shell", project: "flymate-api" })
      )
    ).toBe(false);
    expect(
      isAttached(
        ["claude:flymate-api"],
        session({ kind: "ide", project: "flymate-api" })
      )
    ).toBe(false);
  });
});
