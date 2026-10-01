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

describe("repartir d'une sauvegarde", () => {
  const listed = walk(OPENED, { any: true, type: "backupsListed" });

  it("demande la liste des sauvegardes en entrant dans l'inspection", () => {
    expect(effectsOf(CLOSED, { serverId: "srv-1", type: "begin" })).toContain(
      "listBackups"
    );
  });

  it("propose l'étape seulement quand l'organisation a des sauvegardes", () => {
    expect(walk(OPENED, { type: "inspected" }).step).toBe("catalog");
    expect(walk(listed, { type: "inspected" }).step).toBe("restore");
    expect(
      walk(listed, { type: "needsAgent" }, { type: "agentSent" }).step
    ).toBe("restore");
  });

  it("mène au catalogue, que la sauvegarde soit prise ou non", () => {
    const at = walk(listed, { type: "inspected" });

    expect(walk(at, { type: "restoreSkipped" })).toMatchObject({
      restored: null,
      step: "catalog",
    });
    expect(
      walk(at, { backupId: "20260919T031500Z-7f3a2c", type: "restored" })
    ).toMatchObject({ restored: "20260919T031500Z-7f3a2c", step: "catalog" });
  });

  it("ne prend une sauvegarde que depuis son étape", () => {
    expect(
      walk(OPENED, { backupId: "20260919T031500Z-7f3a2c", type: "restored" })
        .step
    ).toBe("inspection");
  });

  it("lâche la sauvegarde prise quand on revient la choisir", () => {
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

  it("ramène les données après le durcissement, puis finit", () => {
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

  it("compte les étapes de sauvegarde seulement quand elles ont lieu", () => {
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

  it("ne rejoue pas ce qu'entrer dans l'étape avait déclenché", () => {
    const onAgent = walk(OPENED, { type: "needsAgent" });
    const onCatalog = walk(onAgent, { type: "agentSent" });

    expect(effectsOf(onCatalog, { type: "back" })).toEqual(["persist"]);
    expect(effectsOf(onAgent, { type: "back" })).toEqual(["persist"]);
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

  // Otherwise the console only learns what the machine runs on its next sync, minutes later.
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
      effectsOf({ ...OPENED, step: "harden" }, { type: "hardened" })
    ).toContain("reloadFleet");
  });

  it("oublie le brouillon en ouvrant un nouvel onboarding", () => {
    expect(effectsOf(OPENED, { serverId: "srv-2", type: "begin" })).toContain(
      "forget"
    );
  });
});

describe("un serveur qui quitte la liste", () => {
  it("ramène au choix, sans machine et sans chemin de retour", () => {
    const state = walk(OPENED, { type: "serverLost" });

    expect(state.step).toBe("server");
    expect(state.serverId).toBeNull();
    expect(canGoBack(state)).toBe(false);
  });

  it("rend au choix son événement, refusé à l'étape d'avant", () => {
    const lost = walk(OPENED, { type: "serverLost" });

    expect(walk(lost, { serverId: "srv-2", type: "serverChosen" }).step).toBe(
      "inspection"
    );
    expect(walk(OPENED, { serverId: "srv-2", type: "serverChosen" }).step).toBe(
      "inspection"
    );
  });

  it("efface l'étagère, qui parlait d'une machine disparue", () => {
    expect(effectsOf(OPENED, { type: "serverLost" })).toContain("forget");
  });

  it("ramène au choix même une fois la machine touchée", () => {
    const state = walk(
      { ...OPENED, installed: true, step: "install" },
      { type: "serverLost" }
    );

    expect(state.step).toBe("server");
    expect(state.installed).toBe(false);
  });

  it("ferme une séquence déjà finie plutôt que de la recommencer", () => {
    const state = walk({ ...OPENED, step: "done" }, { type: "serverLost" });

    expect(state.step).toBe("closed");
  });

  // A finished sequence left on the shelf read as an install that stopped half-way.
  it("efface l'étagère en quittant une séquence finie", () => {
    expect(effectsOf({ ...OPENED, step: "done" }, { type: "close" })).toContain(
      "forget"
    );
  });

  it("garde l'étagère en quittant une séquence en cours", () => {
    expect(
      effectsOf({ ...OPENED, step: "config" }, { type: "close" })
    ).not.toContain("forget");
  });

  it("ne bouge pas quand le choix est déjà à l'écran", () => {
    const choosing = walk(CLOSED, { type: "open" });

    expect(walk(choosing, { type: "serverLost" }).step).toBe("server");
    expect(walk(CLOSED, { type: "serverLost" }).step).toBe("closed");
  });
});

describe("une licence que la console ne confirme plus", () => {
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
      restored: null,
      type: "resume",
    });

    expect(state.step).toBe("config");
    expect(effects.map((one) => one.kind)).toEqual(["inspect", "listBackups"]);
  });

  it("part sur ce qui manque, et rien d'autre", () => {
    const state = walk(
      { ...CLOSED, serverId: "srv-1", step: "config" },
      { remaining: ["db.postgres"], step: "install", type: "resumeAt" }
    );

    expect(state.step).toBe("install");
    expect(state.remaining).toEqual(["db.postgres"]);
  });

  it("relance le durcissement quand elle tombe sur cette étape", () => {
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

describe("les étapes déclarées", () => {
  it("sont celles que le rail compte", () => {
    expect(ONBOARDING_STEPS.length).toBe(10);
    expect(ONBOARDING_STEPS[0]).toBe("server");
    expect(ONBOARDING_STEPS.at(-1)).toBe("done");
  });
});

describe("les étapes qu'une séquence parcourt", () => {
  it("compte l'agent tant que rien ne dit qu'il est déjà là", () => {
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

  it("retire l'agent d'une machine gérée et à jour, avant même d'y entrer", () => {
    const steps = plannedSteps(
      { ...PLAIN, step: "inspection", trail: ["server"] },
      { kind: "managed", up_to_date: true }
    );

    expect(steps).not.toContain("agent");
    expect(steps.length).toBe(7);
  });

  it("garde l'agent d'une machine gérée en retard : le lecteur décide", () => {
    expect(
      plannedSteps(
        { ...PLAIN, step: "inspection", trail: ["server"] },
        { kind: "managed", up_to_date: false }
      )
    ).toContain("agent");
  });

  it("suit la trace une fois l'inspection passée, quoi que dise le verdict", () => {
    const skipped = walk(OPENED, { type: "inspected" });
    const walked = walk(OPENED, { type: "needsAgent" }, { type: "agentSent" });

    expect(plannedSteps(skipped, { kind: "bare" })).not.toContain("agent");
    expect(
      plannedSteps(walked, { kind: "managed", up_to_date: true })
    ).toContain("agent");
    expect(plannedSteps(skipped, null).indexOf("catalog")).toBe(2);
  });
});

describe("la trace d'une reprise", () => {
  it("est reconstituée jusqu'à l'étape reprise, l'agent mis à part", () => {
    expect(walkedBefore("config")).toEqual(["server", "inspection", "catalog"]);
    expect(walkedBefore("agent")).toEqual(["server", "inspection"]);
    expect(walkedBefore("server")).toEqual([]);
  });

  it("rend le bouton Retour à une reprise avant l'installation", () => {
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

  it("suit l'étape que la machine relue impose", () => {
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

  it("ne rend pas le Retour à une reprise après l'installation", () => {
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

describe("relancer la sécurisation d'un serveur installé", () => {
  const secure: Event = { serverId: "srv-1", type: "secure" };

  it("ouvre directement l'étape de sécurité et la lance", () => {
    const { state, effects } = transition(CLOSED, secure);

    expect(state).toMatchObject({
      installed: true,
      serverId: "srv-1",
      step: "harden",
    });
    expect(effects).toContainEqual({ kind: "startHarden", serverId: "srv-1" });
    expect(canGoBack(state)).toBe(false);
  });

  it("se relance depuis la fin d'un onboarding où root est resté ouvert", () => {
    const done = walk(transition(CLOSED, secure).state, { type: "hardened" });

    expect(done.step).toBe("done");
    expect(effectsOf(done, secure)).toContain("startHarden");
    expect(walk(done, secure).step).toBe("harden");
  });
});
