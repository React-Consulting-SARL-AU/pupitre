import { describe, expect, it } from "bun:test";
import { phasesAt } from "../waiting-phases";

const ORDER = ["reaching", "authorizing", "verifying"] as const;

const label = (id: string): string => id.toUpperCase();

describe("les étapes d'une attente", () => {
  it("range ce qui précède en fait et ce qui suit en attente", () => {
    expect(phasesAt(ORDER, "authorizing", label)).toEqual([
      { id: "reaching", label: "REACHING", state: "done" },
      { id: "authorizing", label: "AUTHORIZING", state: "running" },
      { id: "verifying", label: "VERIFYING", state: "ahead" },
    ]);
  });

  it("n'invente aucune étape faite quand l'étape en cours est inconnue", () => {
    const phases = phasesAt(ORDER, "ailleurs" as (typeof ORDER)[number], label);

    expect(phases.map((phase) => phase.state)).toEqual([
      "ahead",
      "ahead",
      "ahead",
    ]);
  });
});
