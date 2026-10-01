import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useReenroll } from "../reenroll";

// No token ever reaches this store: the bridge does not carry one.
const SERVER = "srv-1";

beforeEach(() => {
  useReenroll.getState().forget();
});

describe("repairing a restricted server", () => {
  it("keeps the licence the agent announced when the exchange returned", async () => {
    stubPupitre({
      reenrollServer: () =>
        Promise.resolve({
          ok: true,
          result: {
            enrolled: true,
            license: "valid",
            synced_at: "2026-09-05T10:00:00Z",
          },
        }),
    });

    await useReenroll.getState().repair(SERVER);

    expect(useReenroll.getState().state).toEqual({
      result: {
        enrolled: true,
        license: "valid",
        synced_at: "2026-09-05T10:00:00Z",
      },
      serverId: SERVER,
      status: "done",
    });
  });

  it("says the exchange is in progress until it no longer is", async () => {
    let release: () => void = () => undefined;

    stubPupitre({
      reenrollServer: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              result: { enrolled: true, license: "valid" },
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

  it("keeps the refusal and its fix as they are", async () => {
    stubPupitre({
      reenrollServer: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "license_required",
            fix: "Régularise la licence dans la console : https://app.pupitre.test/dashboard",
            message: "La licence de cette organisation est suspendue.",
          },
        }),
    });

    await useReenroll.getState().repair(SERVER);

    expect(useReenroll.getState().state).toMatchObject({
      error: {
        code: "license_required",
        fix: "Régularise la licence dans la console : https://app.pupitre.test/dashboard",
      },
      serverId: SERVER,
      status: "failed",
    });
  });
});
