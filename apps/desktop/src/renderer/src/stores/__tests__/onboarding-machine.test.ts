import { describe, expect, it } from "bun:test";
import {
  CLOSED,
  canGoBack,
  type Event,
  type MachineState,
  ONBOARDING_STEPS,
  type OnboardingStep,
  transition,
} from "../onboarding-machine";

/** The sequence, with nothing around it: no store, no screen, no server. */
function walk(from: MachineState, ...events: Event[]): MachineState {
  return events.reduce((state, event) => transition(state, event).state, from);
}

function effectsOf(state: MachineState, event: Event): string[] {
  return transition(state, event).effects.map((one) => one.kind);
}

const OPENED = walk(CLOSED, { serverId: "srv-1", type: "begin" });

describe("l'ordre des étapes", () => {
  it("va du serveur au projet, l'agent avant le catalogue", () => {
    const steps = [
      { type: "open" } as const,
      { serverId: "srv-1", type: "serverChosen" } as const,
      { type: "needsAgent" } as const,
      { type: "agentSent" } as const,
      { type: "chosen" } as const,
      { type: "configured" } as const,
      { type: "installed" } as const,
      { type: "hardened" } as const,
      { type: "projectDone" } as const,
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
      "project",
      "done",
    ]);
  });

  /** A bare machine has no catalogue to answer with; a managed one needs no binary. */
  it("passe de l'inspection au catalogue quand l'agent est déjà là", () => {
    expect(walk(OPENED, { type: "inspected" }).step).toBe("catalog");
  });

  it("n'a pas de chemin vers une étape qu'aucune réponse ne justifie", () => {
    // Nothing chosen is not an install to run: only `configured` opens it.
    expect(walk(OPENED, { type: "installed" }).step).toBe("inspection");
    expect(walk(OPENED, { type: "hardened" }).step).toBe("inspection");
  });
});

describe("le chemin du retour", () => {
  it("est ouvert tant que rien n'est installé", () => {
    const state = walk(OPENED, { type: "inspected" });

    expect(canGoBack(state)).toBe(true);
    expect(walk(state, { type: "back" }).step).toBe("inspection");
  });

  it("se ferme dès qu'un module a commencé", () => {
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

  it("n'existe ni au premier écran ni au dernier", () => {
    expect(canGoBack(walk(CLOSED, { type: "open" }))).toBe(false);
    expect(canGoBack({ ...OPENED, step: "done" })).toBe(false);
  });
});

describe("ce qu'une étape déclenche en y entrant", () => {
  it("lit la machine, pose le binaire, installe, durcit", () => {
    expect(effectsOf(OPENED, { type: "needsAgent" })).toContain("sendAgent");
    expect(
      effectsOf({ ...OPENED, step: "config" }, { type: "configured" })
    ).toContain("startInstall");
    expect(
      effectsOf({ ...OPENED, step: "install" }, { type: "installed" })
    ).toContain("startHarden");
  });

  /** The console learns what the machine runs rather than five minutes later. */
  it("prévient la console après l'installation et après le durcissement", () => {
    expect(
      effectsOf({ ...OPENED, step: "install" }, { type: "installed" })
    ).toContain("platformSync");
    expect(
      effectsOf({ ...OPENED, step: "harden" }, { type: "hardened" })
    ).toContain("platformSync");
  });

  it("recharge la flotte quand l'onboarding est fini", () => {
    expect(
      effectsOf({ ...OPENED, step: "project" }, { type: "projectDone" })
    ).toContain("reloadFleet");
  });

  /** A new onboarding starts on an empty shelf: nothing of the last one is inherited. */
  it("oublie le brouillon en ouvrant un nouvel onboarding", () => {
    expect(effectsOf(OPENED, { serverId: "srv-2", type: "begin" })).toContain(
      "forget"
    );
  });
});

describe("un droit d'usage que la console ne confirme plus", () => {
  it("gèle l'étape où elle est, sans la faire échouer", () => {
    const held = walk(OPENED, { type: "usageLost" });

    expect(held.frozen).toBe(true);
    expect(walk(held, { type: "inspected" }).step).toBe("inspection");
  });

  it("laisse toujours quitter l'assistant", () => {
    const held = walk(OPENED, { type: "usageLost" });

    expect(walk(held, { type: "close" }).step).toBe("closed");
  });

  it("reprend où elle en était une fois le droit revenu", () => {
    const back = walk(OPENED, { type: "usageLost" }, { type: "usageBack" });

    expect(back.frozen).toBe(false);
    expect(walk(back, { type: "inspected" }).step).toBe("catalog");
  });
});

describe("rejouer un module", () => {
  it("repasse par la configuration quand il portait un secret", () => {
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

  it("ne bouge pas quand il n'en portait pas", () => {
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

describe("une reprise", () => {
  it("revient à l'étape de l'étagère et relit la machine", () => {
    const { state, effects } = transition(CLOSED, {
      installed: false,
      serverId: "srv-1",
      step: "config",
      type: "resume",
    });

    expect(state.step).toBe("config");
    expect(effects.map((one) => one.kind)).toEqual(["inspect"]);
  });

  it("part sur ce qui manque, et rien d'autre", () => {
    const state = walk(
      { ...CLOSED, serverId: "srv-1", step: "config" },
      { remaining: ["db.postgres"], step: "install", type: "resumeAt" }
    );

    expect(state.step).toBe("install");
    expect(state.remaining).toEqual(["db.postgres"]);
  });
});

describe("les étapes déclarées", () => {
  it("sont celles que le rail compte", () => {
    expect(ONBOARDING_STEPS.length).toBe(9);
    expect(ONBOARDING_STEPS[0]).toBe("server");
    expect(ONBOARDING_STEPS.at(-1)).toBe("done");
  });
});
