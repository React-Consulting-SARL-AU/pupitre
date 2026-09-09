import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useTerminals } from "../terminals";

const SERVER = "srv-1";

beforeEach(() => {
  useTerminals.getState().reset();
});

describe("l'ouverture d'une session", () => {
  it("retient la session que l'agent a nommée", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({
          ok: true,
          result: { session: "claude-flymate-api" },
        }),
    });

    await useTerminals.getState().start("t1", SERVER, "claude", "flymate-api");

    expect(useTerminals.getState().sessions.t1).toEqual({
      session: "claude-flymate-api",
      status: "open",
    });
  });

  it("garde le refus et son remède tels quels", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({
          error: {
            code: "module_not_found",
            fix: "Ajoute le module ai.hermes depuis l'écran Services.",
            message: "Hermes n'est pas installé sur ce serveur.",
          },
          ok: false,
        }),
    });

    await useTerminals.getState().start("t2", SERVER, "hermes", "flymate-api");

    expect(useTerminals.getState().sessions.t2).toMatchObject({
      error: { fix: "Ajoute le module ai.hermes depuis l'écran Services." },
      status: "failed",
    });
  });

  it("n'ouvre qu'une session, même si l'onglet est monté deux fois", async () => {
    let asked = 0;

    stubPupitre({
      openTerminal: () => {
        asked += 1;

        return Promise.resolve({ ok: true, result: { session: null } });
      },
    });

    const store = useTerminals.getState();

    await Promise.all([
      store.start("t3", SERVER, "shell", null),
      store.start("t3", SERVER, "shell", null),
    ]);

    expect(asked).toBe(1);
  });
});

describe("la connexion d'un agent", () => {
  it("n'expose que l'hôte de la page, jamais son adresse", () => {
    useTerminals.getState().noteLink("t1", "claude.ai");

    expect(useTerminals.getState().links).toEqual({ t1: "claude.ai" });
  });

  it("ouvre la page dans l'onglet et la referme quand le retour arrive", async () => {
    const asked: { id: string; bounds: unknown }[] = [];

    stubPupitre({
      openLogin: (id, bounds) => {
        asked.push({ bounds, id });

        return Promise.resolve(true);
      },
    });

    useTerminals.getState().noteLink("t1", "claude.ai");
    await useTerminals
      .getState()
      .openLogin("t1", { height: 400, width: 600, x: 10, y: 20 });

    expect(asked).toEqual([
      { bounds: { height: 400, width: 600, x: 10, y: 20 }, id: "t1" },
    ]);
    expect(useTerminals.getState().login).toBe("t1");

    useTerminals.getState().noteLoginClosed("t1");

    expect(useTerminals.getState().login).toBeNull();
    expect(useTerminals.getState().links.t1).toBeUndefined();
  });

  it("ne se dit pas ouverte quand le processus principal a refusé", async () => {
    stubPupitre({ openLogin: () => Promise.resolve(false) });

    await useTerminals
      .getState()
      .openLogin("t9", { height: 10, width: 10, x: 0, y: 0 });

    expect(useTerminals.getState().login).toBeNull();
  });
});

describe("la fin d'une session", () => {
  it("garde l'onglet avec son code de sortie", async () => {
    stubPupitre({
      openTerminal: () =>
        Promise.resolve({ ok: true, result: { session: "claude-app" } }),
    });

    await useTerminals.getState().start("t4", SERVER, "claude", "app");
    useTerminals.getState().noteExit("t4", 130);

    expect(useTerminals.getState().sessions.t4).toEqual({
      code: 130,
      session: "claude-app",
      status: "ended",
    });
  });

  it("ignore une sortie pour une session qui n'était pas ouverte", () => {
    useTerminals.getState().noteExit("t-ghost", 0);

    expect(useTerminals.getState().sessions["t-ghost"]).toBeUndefined();
  });

  it("rouvre un processus neuf dans le même onglet", async () => {
    let opened = 0;

    stubPupitre({
      openTerminal: () => {
        opened += 1;

        return Promise.resolve({ ok: true, result: { session: null } });
      },
    });

    await useTerminals.getState().start("t5", SERVER, "shell", null);
    useTerminals.getState().noteExit("t5", 0);
    await useTerminals.getState().restart("t5", SERVER, "shell", null);

    expect(opened).toBe(2);
    expect(useTerminals.getState().sessions.t5).toEqual({
      session: null,
      status: "open",
    });
  });
});

describe("la recherche dans une session", () => {
  it("n'est ouverte que sur une session à la fois, et se ferme avec elle", () => {
    useTerminals.getState().openSearch("t1");
    useTerminals.getState().openSearch("t2");

    expect(useTerminals.getState().search).toBe("t2");

    useTerminals.getState().forget("t2");

    expect(useTerminals.getState().search).toBeNull();
  });
});
