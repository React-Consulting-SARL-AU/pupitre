import { describe, expect, it } from "bun:test";
import {
  CLOSED,
  canGoBack,
  type Event,
  type MachineState,
  ONBOARDING_STEPS,
  type OnboardingStep,
  plannedSteps,
  transition,
  walkedBefore,
} from "../onboarding-machine";

function walk(from: MachineState, ...events: Event[]): MachineState {
  return events.reduce((state, event) => transition(state, event).state, from);
}

function effectsOf(state: MachineState, event: Event): string[] {
  return transition(state, event).effects.map((one) => one.kind);
}

const OPENED = walk(CLOSED, { serverId: "srv-1", type: "begin" });

const PLAIN = { backups: false, restored: null };

describe("restarting from a backup", () => {
  const listed = walk(OPENED, { any: true, type: "backupsListed" });

  it("asks for the backup list on entering the inspection", () => {
    expect(effectsOf(CLOSED, { serverId: "srv-1", type: "begin" })).toContain(
      "listBackups"
    );
  });

  it("offers the step only when the organization has backups", () => {
    expect(walk(OPENED, { type: "inspected" }).step).toBe("catalog");
    expect(walk(listed, { type: "inspected" }).step).toBe("restore");
    expect(
      walk(listed, { type: "needsAgent" }, { type: "agentSent" }).step
    ).toBe("restore");
  });

  it("leads to the catalogue, whether the backup is taken or not", () => {
    const at = walk(listed, { type: "inspected" });

    expect(walk(at, { type: "restoreSkipped" })).toMatchObject({
      restored: null,
      step: "catalog",
    });
    expect(
      walk(at, { backupId: "20260919T031500Z-7f3a2c", type: "restored" })
    ).toMatchObject({ restored: "20260919T031500Z-7f3a2c", step: "catalog" });
  });

  it("takes a backup only from its own step", () => {
    expect(
      walk(OPENED, { backupId: "20260919T031500Z-7f3a2c", type: "restored" })
        .step
    ).toBe("inspection");
  });

  it("drops the backup taken when going back to choose it", () => {
    const taken = walk(
      listed,
      { type: "inspected" },
      { backupId: "20260919T031500Z-7f3a2c", type: "restored" }
    );
    const { state, effects } = transition(taken, { type: "back" });

    expect(state).toMatchObject({ restored: null, step: "restore" });
    expect(effects).toContainEqual({
      kind: "abortRestore",
      serverId: "srv-1",
    });
  });

  it("restores the data after hardening, then finishes", () => {
    const hardened = walk(
      listed,
      { type: "inspected" },
      { backupId: "20260919T031500Z-7f3a2c", type: "restored" },
      { type: "chosen" },
      { type: "configured" },
      { type: "installed" },
      { type: "hardened" }
    );

    expect(hardened.step).toBe("data");
    expect(effectsOf(hardened, { type: "dataRestored" })).toEqual(
      expect.arrayContaining(["platformSync", "reloadFleet"])
    );
    expect(walk(hardened, { type: "dataSkipped" }).step).toBe("done");
  });

  it("counts the backup steps only when they take place", () => {
    const steps = plannedSteps(
      { backups: true, restored: "b", step: "catalog", trail: ["restore"] },
      null
    );

    expect(steps).toContain("restore");
    expect(steps).toContain("data");
    expect(
      plannedSteps({ ...PLAIN, step: "catalog", trail: [] }, null)
    ).not.toContain("data");
  });
});

describe("the order of the steps", () => {
  it("goes from the server to the project, the agent before the catalogue", () => {
    const steps = [
      { type: "open" } as const,
      { serverId: "srv-1", type: "serverChosen" } as const,
      { type: "needsAgent" } as const,
      { type: "agentSent" } as const,
      { type: "chosen" } as const,
      { type: "configured" } as const,
      { type: "installed" } as const,
      { type: "hardened" } as const,
    ];

    const seen = steps.reduce<{ state: MachineState; path: OnboardingStep[] }>(
      (carried, event) => {
        const state = transition(carried.state, event).state;

        return {
          path: [...carried.path, state.step as OnboardingStep],
          state,
        };
      },
      { path: [], state: CLOSED }
    );

    expect(seen.path).toEqual([
      "server",
      "inspection",
      "agent",
      "catalog",
      "config",
      "install",
      "harden",
      "done",
    ]);
  });

  // A managed machine already runs the agent, so no binary is sent.
  it("goes from the inspection to the catalogue when the agent is already there", () => {
    expect(walk(OPENED, { type: "inspected" }).step).toBe("catalog");
  });

  it("has no path to a step that no response justifies", () => {
    // Nothing chosen is not an install to run: only `configured` opens it.
    expect(walk(OPENED, { type: "installed" }).step).toBe("inspection");
    expect(walk(OPENED, { type: "hardened" }).step).toBe("inspection");
  });
});

describe("the way back", () => {
  it("is open as long as nothing is installed", () => {
    const state = walk(OPENED, { type: "inspected" });

    expect(canGoBack(state)).toBe(true);
    expect(walk(state, { type: "back" }).step).toBe("inspection");
  });

  it("closes as soon as a module has started", () => {
    const state = walk(
      OPENED,
      { type: "inspected" },
      { type: "chosen" },
      { type: "configured" },
      { type: "touched" }
    );

    expect(canGoBack(state)).toBe(false);
    expect(walk(state, { type: "back" }).step).toBe("install");
  });

  it("exists on neither the first screen nor the last", () => {
    expect(canGoBack(walk(CLOSED, { type: "open" }))).toBe(false);
    expect(canGoBack({ ...OPENED, step: "done" })).toBe(false);
  });

  it("does not replay what entering the step had triggered", () => {
    const onAgent = walk(OPENED, { type: "needsAgent" });
    const onCatalog = walk(onAgent, { type: "agentSent" });

    expect(effectsOf(onCatalog, { type: "back" })).toEqual(["persist"]);
    expect(effectsOf(onAgent, { type: "back" })).toEqual(["persist"]);
  });
});

describe("what a step triggers on entering it", () => {
  it("reads the machine, places the binary, installs, hardens", () => {
    expect(effectsOf(OPENED, { type: "needsAgent" })).toContain("sendAgent");
    expect(
      effectsOf({ ...OPENED, step: "config" }, { type: "configured" })
    ).toContain("startInstall");
    expect(
      effectsOf({ ...OPENED, step: "install" }, { type: "installed" })
    ).toContain("startHarden");
  });

  // Otherwise the console only learns what the machine runs on its next sync, minutes later.
  it("notifies the console after the installation and after hardening", () => {
    expect(
      effectsOf({ ...OPENED, step: "install" }, { type: "installed" })
    ).toContain("platformSync");
    expect(
      effectsOf({ ...OPENED, step: "harden" }, { type: "hardened" })
    ).toContain("platformSync");
  });

  it("reloads the fleet when the onboarding is finished", () => {
    expect(
      effectsOf({ ...OPENED, step: "harden" }, { type: "hardened" })
    ).toContain("reloadFleet");
  });

  it("forgets the draft when opening a new onboarding", () => {
    expect(effectsOf(OPENED, { serverId: "srv-2", type: "begin" })).toContain(
      "forget"
    );
  });
});

describe("a server that leaves the list", () => {
  it("returns to the choice, with no machine and no way back", () => {
    const state = walk(OPENED, { type: "serverLost" });

    expect(state.step).toBe("server");
    expect(state.serverId).toBeNull();
    expect(canGoBack(state)).toBe(false);
  });

  it("gives the choice its event back, refused at the previous step", () => {
    const lost = walk(OPENED, { type: "serverLost" });

    expect(walk(lost, { serverId: "srv-2", type: "serverChosen" }).step).toBe(
      "inspection"
    );
    expect(walk(OPENED, { serverId: "srv-2", type: "serverChosen" }).step).toBe(
      "inspection"
    );
  });

  it("clears the shelf, which spoke of a vanished machine", () => {
    expect(effectsOf(OPENED, { type: "serverLost" })).toContain("forget");
  });

  it("returns to the choice even once the machine has been touched", () => {
    const state = walk(
      { ...OPENED, installed: true, step: "install" },
      { type: "serverLost" }
    );

    expect(state.step).toBe("server");
    expect(state.installed).toBe(false);
  });

  it("closes an already finished sequence rather than restarting it", () => {
    const state = walk({ ...OPENED, step: "done" }, { type: "serverLost" });

    expect(state.step).toBe("closed");
  });

  // A finished sequence left on the shelf read as an install that stopped half-way.
  it("clears the shelf when leaving a finished sequence", () => {
    expect(effectsOf({ ...OPENED, step: "done" }, { type: "close" })).toContain(
      "forget"
    );
  });

  it("keeps the shelf when leaving a sequence in progress", () => {
    expect(
      effectsOf({ ...OPENED, step: "config" }, { type: "close" })
    ).not.toContain("forget");
  });

  it("does not move when the choice is already on screen", () => {
    const choosing = walk(CLOSED, { type: "open" });

    expect(walk(choosing, { type: "serverLost" }).step).toBe("server");
    expect(walk(CLOSED, { type: "serverLost" }).step).toBe("closed");
  });
});

describe("a licence the console no longer confirms", () => {
  it("freezes the step where it is, without making it fail", () => {
    const held = walk(OPENED, { type: "usageLost" });

    expect(held.frozen).toBe(true);
    expect(walk(held, { type: "inspected" }).step).toBe("inspection");
  });

  it("always lets the wizard be left", () => {
    const held = walk(OPENED, { type: "usageLost" });

    expect(walk(held, { type: "close" }).step).toBe("closed");
  });

  it("resumes where it was once the licence is back", () => {
    const back = walk(OPENED, { type: "usageLost" }, { type: "usageBack" });

    expect(back.frozen).toBe(false);
    expect(walk(back, { type: "inspected" }).step).toBe("catalog");
  });
});

describe("replaying a module", () => {
  it("goes back through the configuration when it carried a secret", () => {
    const state = walk(
      { ...OPENED, step: "install" },
      {
        carriesSecret: true,
        moduleId: "db.postgres",
        type: "replay",
      }
    );

    expect(state.step).toBe("config");
    expect(state.replaying).toBe("db.postgres");
  });

  it("does not move when it carried none", () => {
    const state = walk(
      { ...OPENED, step: "install" },
      {
        carriesSecret: false,
        moduleId: "runtime.node",
        type: "replay",
      }
    );

    expect(state.step).toBe("install");
    expect(state.replaying).toBeNull();
  });
});

describe("a resumption", () => {
  it("returns to the shelf's step and rereads the machine", () => {
    const { state, effects } = transition(CLOSED, {
      installed: false,
      serverId: "srv-1",
      step: "config",
      restored: null,
      type: "resume",
    });

    expect(state.step).toBe("config");
    expect(effects.map((one) => one.kind)).toEqual(["inspect", "listBackups"]);
  });

  it("starts on what is missing, and nothing else", () => {
    const state = walk(
      { ...CLOSED, serverId: "srv-1", step: "config" },
      { remaining: ["db.postgres"], step: "install", type: "resumeAt" }
    );

    expect(state.step).toBe("install");
    expect(state.remaining).toEqual(["db.postgres"]);
  });

  it("relaunches hardening when it lands on that step", () => {
    const { state, effects } = transition(CLOSED, {
      installed: true,
      serverId: "srv-1",
      step: "harden",
      restored: null,
      type: "resume",
    });

    expect(state.step).toBe("harden");
    expect(effects).toContainEqual({ kind: "startHarden", serverId: "srv-1" });
  });
});

describe("the declared steps", () => {
  it("are the ones the rail counts", () => {
    expect(ONBOARDING_STEPS.length).toBe(10);
    expect(ONBOARDING_STEPS[0]).toBe("server");
    expect(ONBOARDING_STEPS.at(-1)).toBe("done");
  });
});

describe("the steps a sequence goes through", () => {
  it("counts the agent as long as nothing says it is already there", () => {
    expect(plannedSteps({ ...PLAIN, step: "server", trail: [] }, null)).toEqual(
      ONBOARDING_STEPS.filter((step) => step !== "restore" && step !== "data")
    );
    expect(
      plannedSteps(
        { ...PLAIN, step: "inspection", trail: ["server"] },
        { kind: "bare" }
      )
    ).toContain("agent");
  });

  it("removes the agent from a managed, up-to-date machine, even before entering it", () => {
    const steps = plannedSteps(
      { ...PLAIN, step: "inspection", trail: ["server"] },
      { kind: "managed", up_to_date: true }
    );

    expect(steps).not.toContain("agent");
    expect(steps.length).toBe(7);
  });

  it("keeps the agent of a managed machine that is behind: the reader decides", () => {
    expect(
      plannedSteps(
        { ...PLAIN, step: "inspection", trail: ["server"] },
        { kind: "managed", up_to_date: false }
      )
    ).toContain("agent");
  });

  it("follows the trace once the inspection has passed, whatever the verdict says", () => {
    const skipped = walk(OPENED, { type: "inspected" });
    const walked = walk(OPENED, { type: "needsAgent" }, { type: "agentSent" });

    expect(plannedSteps(skipped, { kind: "bare" })).not.toContain("agent");
    expect(
      plannedSteps(walked, { kind: "managed", up_to_date: true })
    ).toContain("agent");
    expect(plannedSteps(skipped, null).indexOf("catalog")).toBe(2);
  });
});

describe("the trace of a resumption", () => {
  it("is rebuilt up to the resumed step, the agent aside", () => {
    expect(walkedBefore("config")).toEqual(["server", "inspection", "catalog"]);
    expect(walkedBefore("agent")).toEqual(["server", "inspection"]);
    expect(walkedBefore("server")).toEqual([]);
  });

  it("gives a resumption the Back button before the installation", () => {
    const state = transition(CLOSED, {
      installed: false,
      serverId: "srv-1",
      step: "config",
      restored: null,
      type: "resume",
    }).state;

    expect(canGoBack(state)).toBe(true);

    const back = walk(state, { type: "back" });

    expect(back.step).toBe("catalog");
    expect(back.trail).toEqual(["server", "inspection"]);
  });

  it("follows the step the reread machine imposes", () => {
    const state = walk(
      transition(CLOSED, {
        installed: false,
        serverId: "srv-1",
        step: "config",
        restored: null,
        type: "resume",
      }).state,
      { remaining: [], step: "agent", type: "resumeAt" }
    );

    expect(state.step).toBe("agent");
    expect(state.trail).toEqual(["server", "inspection"]);
  });

  it("does not give a resumption the Back button after the installation", () => {
    const state = transition(CLOSED, {
      installed: true,
      serverId: "srv-1",
      step: "harden",
      restored: null,
      type: "resume",
    }).state;

    expect(canGoBack(state)).toBe(false);
  });
});

describe("relaunching the hardening of an installed server", () => {
  const secure: Event = { serverId: "srv-1", type: "secure" };

  it("opens the security step directly and launches it", () => {
    const { state, effects } = transition(CLOSED, secure);

    expect(state).toMatchObject({
      installed: true,
      serverId: "srv-1",
      step: "harden",
    });
    expect(effects).toContainEqual({ kind: "startHarden", serverId: "srv-1" });
    expect(canGoBack(state)).toBe(false);
  });

  it("relaunches from the end of an onboarding where root was left open", () => {
    const done = walk(transition(CLOSED, secure).state, { type: "hardened" });

    expect(done.step).toBe("done");
    expect(effectsOf(done, secure)).toContain("startHarden");
    expect(walk(done, secure).step).toBe("harden");
  });
});
