import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useTerminals } from "../terminals";

/**
 * What the tab knows of its session, and of the connection it is waiting on.
 *
 * The store keeps the envelope the main process answered: a refusal stays a
 * refusal, with the remedy the agent wrote, and the address of a login never
 * enters here — only the host it leads to.
 */

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
