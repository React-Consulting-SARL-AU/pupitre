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

describe("ce qu'une session est en train de faire", () => {
  it("travaille tant que la sortie coule, puis s'arrête", () => {
    const session = opened();

    noteOutput(session, OUTPUT, START + SECOND);

    expect(stateOf(session, START + SECOND)).toBe("working");
    expect(stateOf(session, START + 3 * SECOND)).toBe("idle");
  });

  it("compte une sortie fine comme du travail tant qu'elle continue", () => {
    const session = opened();

    for (let tick = 1; tick <= 4; tick += 1) {
      noteOutput(session, 60, START + tick * SECOND);
    }

    expect(stateOf(session, START + 4 * SECOND)).toBe("working");
  });

  it("ne prend pas la bannière de tmux pour du travail, et s'endort quand même", () => {
    const session = opened();
    let now = START;

    for (let tick = 1; tick <= 40; tick += 1) {
      now = START + tick * 15 * SECOND;
      noteOutput(session, BANNER, now);
    }

    expect(stateOf(session, now)).toBe("asleep");
  });

  it("reste éveillée sous la main du lecteur, sans que rien ne s'affiche", () => {
    const session = opened();
    const typed = START + 10 * MINUTE;

    noteKeystroke(session, typed);

    expect(stateOf(session, typed + 2 * SECOND)).toBe("idle");
  });
});

describe("ce qu'un agent réclame", () => {
  it("appelle quand il a sonné", () => {
    const session = opened("claude");

    session.bell = true;

    expect(stateOf(session, START + 5 * SECOND)).toBe("attention");
  });

  it("appelle quand il a écrit puis s'est tu, sans avoir sonné", () => {
    const session = opened("claude");

    noteOutput(session, OUTPUT, START + SECOND);

    expect(stateOf(session, START + 5 * SECOND)).toBe("attention");
  });

  it("n'appelle pas pour la seule bannière de tmux", () => {
    const session = opened("claude");

    noteOutput(session, BANNER, START + 15 * SECOND);
    noteOutput(session, BANNER, START + 30 * SECOND);

    expect(stateOf(session, START + 35 * SECOND)).toBe("idle");
  });

  it("se tait dès que le lecteur a répondu", () => {
    const session = opened("claude");

    noteOutput(session, OUTPUT, START + SECOND);
    noteKeystroke(session, START + 2 * SECOND);

    expect(stateOf(session, START + 5 * SECOND)).toBe("idle");
  });

  it("dit que le processus est parti, quoi qu'il ait écrit", () => {
    const session = opened("claude");

    session.finished = true;

    expect(stateOf(session, START)).toBe("finished");
  });
});
