import { describe, expect, it } from "bun:test";
import {
  type ModuleProgress,
  type StepEntry,
  settledBy,
  shaped,
  withStep,
} from "../module-progress";

function entry(step: string, status: StepEntry["status"], ms = 0): StepEntry {
  return { ms, status, step };
}

describe("une étape qui se referme", () => {
  it("ferme la dernière ouverte sous ce nom, pas celle d'avant", () => {
    const before = [
      entry("store-key", "start"),
      entry("install-neonctl", "skip"),
      entry("store-key", "start"),
    ];

    const after = withStep(before, entry("store-key", "skip"));

    expect(after).toHaveLength(3);
    expect(after[0]).toEqual(entry("store-key", "start"));
    expect(after[2]).toEqual(entry("store-key", "skip"));
  });

  it("ferme celle qu'elle a ouverte quand rien ne traîne", () => {
    const after = withStep(
      [entry("store-key", "start")],
      entry("store-key", "ok", 12)
    );

    expect(after).toEqual([entry("store-key", "ok", 12)]);
  });
});

describe("un module que la réponse rattrape", () => {
  const running: ModuleProgress = shaped("tool.neon", [
    entry("install-neonctl", "ok", 34_900),
    entry("link-neonctl", "skip"),
    entry("store-key", "start"),
  ]);

  it("ne tourne plus, et perd l'étape que personne n'a fermée", () => {
    const settled = settledBy(running, false);

    expect(running.status).toBe("running");
    expect(settled.status).toBe("ok");
    expect(settled.steps.map((step) => step.step)).toEqual([
      "install-neonctl",
      "link-neonctl",
    ]);
    expect(settled.ms).toBe(34_900);
  });

  it("prend l'échec que la réponse lui donne", () => {
    expect(settledBy(running, true).status).toBe("fail");
  });

  it("garde ce que ses étapes disent quand la réponse ne le condamne pas", () => {
    const skipped = shaped("tool.neon", [
      entry("store-key", "skip"),
      entry("export-key", "start"),
    ]);

    expect(settledBy(skipped, false).status).toBe("skip");
  });

  it("dit oui d'un module dont aucune étape n'est revenue", () => {
    const silent = shaped("tool.neon", []);

    expect(settledBy(silent, false).status).toBe("ok");
  });
});
