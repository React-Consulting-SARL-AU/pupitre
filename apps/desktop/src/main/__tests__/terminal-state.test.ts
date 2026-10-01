import { describe, expect, it } from "bun:test";
import type { TerminalKind } from "@shared/terminals";
import {
  type Activity,
  freshActivity,
  noteKeystroke,
  noteOutput,
  stateOf,
} from "../terminal-state";

const START = 1_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** What tmux writes on its own when it refreshes its status line. */
const BANNER = 120;
const OUTPUT = 4000;

function opened(kind: TerminalKind = "shell"): Activity {
  return freshActivity(kind, START);
}

describe("what a session is doing", () => {
  it("works while output flows, then stops", () => {
    const session = opened();

    noteOutput(session, OUTPUT, START + SECOND);

    expect(stateOf(session, START + SECOND)).toBe("working");
    expect(stateOf(session, START + 3 * SECOND)).toBe("idle");
  });

  it("counts thin output as work as long as it continues", () => {
    const session = opened();

    for (let tick = 1; tick <= 4; tick += 1) {
      noteOutput(session, 60, START + tick * SECOND);
    }

    expect(stateOf(session, START + 4 * SECOND)).toBe("working");
  });

  it("does not take tmux's banner for work, and still goes idle", () => {
    const session = opened();
    let now = START;

    for (let tick = 1; tick <= 40; tick += 1) {
      now = START + tick * 15 * SECOND;
      noteOutput(session, BANNER, now);
    }

    expect(stateOf(session, now)).toBe("asleep");
  });

  it("stays awake under the reader's hand, with nothing being displayed", () => {
    const session = opened();
    const typed = START + 10 * MINUTE;

    noteKeystroke(session, typed);

    expect(stateOf(session, typed + 2 * SECOND)).toBe("idle");
  });
});

describe("what an agent asks for", () => {
  it("calls when it rang the bell", () => {
    const session = opened("claude");

    session.bell = true;

    expect(stateOf(session, START + 5 * SECOND)).toBe("attention");
  });

  it("calls when it wrote then went quiet, without ringing the bell", () => {
    const session = opened("claude");

    noteOutput(session, OUTPUT, START + SECOND);

    expect(stateOf(session, START + 5 * SECOND)).toBe("attention");
  });

  it("does not call for tmux's banner alone", () => {
    const session = opened("claude");

    noteOutput(session, BANNER, START + 15 * SECOND);
    noteOutput(session, BANNER, START + 30 * SECOND);

    expect(stateOf(session, START + 35 * SECOND)).toBe("idle");
  });

  it("goes quiet as soon as the reader has answered", () => {
    const session = opened("claude");

    noteOutput(session, OUTPUT, START + SECOND);
    noteKeystroke(session, START + 2 * SECOND);

    expect(stateOf(session, START + 5 * SECOND)).toBe("idle");
  });

  it("says the process is gone, whatever it wrote", () => {
    const session = opened("claude");

    session.finished = true;

    expect(stateOf(session, START)).toBe("finished");
  });
});
