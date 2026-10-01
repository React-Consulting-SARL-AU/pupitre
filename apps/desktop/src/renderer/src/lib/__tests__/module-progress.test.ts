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

describe("a step that closes", () => {
  it("closes the last one opened under that name, not the one before", () => {
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

  it("closes the one it opened when nothing lingers", () => {
    const after = withStep(
      [entry("store-key", "start")],
      entry("store-key", "ok", 12)
    );

    expect(after).toEqual([entry("store-key", "ok", 12)]);
  });
});

describe("a module the response catches up with", () => {
  const running: ModuleProgress = shaped("tool.neon", [
    entry("install-neonctl", "ok", 34_900),
    entry("link-neonctl", "skip"),
    entry("store-key", "start"),
  ]);

  it("no longer runs, and loses the step nobody closed", () => {
    const settled = settledBy(running, false);

    expect(running.status).toBe("running");
    expect(settled.status).toBe("ok");
    expect(settled.steps.map((step) => step.step)).toEqual([
      "install-neonctl",
      "link-neonctl",
    ]);
    expect(settled.ms).toBe(34_900);
  });

  it("takes the failure the response gives it", () => {
    expect(settledBy(running, true).status).toBe("fail");
  });

  it("keeps what its steps say when the response does not condemn it", () => {
    const skipped = shaped("tool.neon", [
      entry("store-key", "skip"),
      entry("export-key", "start"),
    ]);

    expect(settledBy(skipped, false).status).toBe("skip");
  });

  it("says yes for a module none of whose steps came back", () => {
    const silent = shaped("tool.neon", []);

    expect(settledBy(silent, false).status).toBe("ok");
  });
});
