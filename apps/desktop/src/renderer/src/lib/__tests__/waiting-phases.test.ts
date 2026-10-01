import { describe, expect, it } from "bun:test";
import { phasesAt } from "../waiting-phases";

const ORDER = ["reaching", "authorizing", "verifying"] as const;

const label = (id: string): string => id.toUpperCase();

describe("the steps of a wait", () => {
  it("files what comes before as done and what follows as waiting", () => {
    expect(phasesAt(ORDER, "authorizing", label)).toEqual([
      { id: "reaching", label: "REACHING", state: "done" },
      { id: "authorizing", label: "AUTHORIZING", state: "running" },
      { id: "verifying", label: "VERIFYING", state: "ahead" },
    ]);
  });

  it("invents no done step when the current step is unknown", () => {
    const phases = phasesAt(ORDER, "ailleurs" as (typeof ORDER)[number], label);

    expect(phases.map((phase) => phase.state)).toEqual([
      "ahead",
      "ahead",
      "ahead",
    ]);
  });
});
