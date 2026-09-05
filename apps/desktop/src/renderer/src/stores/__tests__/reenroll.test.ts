import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useReenroll } from "../reenroll";

/**
 * The store of the repair: it keeps the envelope the main process handed back
 * and nothing else. No token ever reaches it — the bridge does not carry one.
 */

const SERVER = "srv-1";

beforeEach(() => {
  useReenroll.getState().forget();
});

describe("la réparation d'un serveur restreint", () => {
  it("garde le droit que l'agent a annoncé au retour de l'échange", async () => {
    stubPupitre({
      reenrollServer: () =>
        Promise.resolve({
          ok: true,
          result: {
            enrolled: true,
            entitlement: "valid",
            synced_at: "2026-09-05T10:00:00Z",
          },
        }),
    });

    await useReenroll.getState().repair(SERVER);

    expect(useReenroll.getState().state).toEqual({
      result: {
        enrolled: true,
        entitlement: "valid",
        synced_at: "2026-09-05T10:00:00Z",
      },
      serverId: SERVER,
      status: "done",
    });
  });

  it("dit que l'échange est en cours tant qu'il ne l'est plus", async () => {
    let release: () => void = () => undefined;
    stubPupitre({
      reenrollServer: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              result: { enrolled: true, entitlement: "valid" },
            });
        }),
    });

    const running = useReenroll.getState().repair(SERVER);

    expect(useReenroll.getState().state).toEqual({
      serverId: SERVER,
      status: "running",
    });

    release();
    await running;

    expect(useReenroll.getState().state.status).toBe("done");
  });

  it("garde le refus et son remède tels quels", async () => {
    stubPupitre({
      reenrollServer: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "entitlement_required",
            fix: "Régularise l'abonnement dans la console : https://app.pupitre.test/dashboard",
            message: "Le droit d'usage de cette organisation est suspendu.",
          },
        }),
    });

    await useReenroll.getState().repair(SERVER);

    expect(useReenroll.getState().state).toMatchObject({
      error: {
        code: "entitlement_required",
        fix: "Régularise l'abonnement dans la console : https://app.pupitre.test/dashboard",
      },
      serverId: SERVER,
      status: "failed",
    });
  });
});
