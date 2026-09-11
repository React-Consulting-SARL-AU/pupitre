import { beforeEach, describe, expect, it } from "bun:test";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { usePreferences } from "../preferences";

beforeEach(() => {
  usePreferences.setState({ notifications: null, startup: null });
});

describe("les préférences du processus principal", () => {
  it("ne dessine rien avant d'avoir lu, puis ce qui a été lu", async () => {
    stubPupitre({
      notificationsEnabled: () => Promise.resolve(false),
      startupState: () => Promise.resolve({ enabled: true, supported: true }),
    });

    expect(usePreferences.getState().notifications).toBeNull();

    await usePreferences.getState().read();

    expect(usePreferences.getState().notifications).toBe(false);
    expect(usePreferences.getState().startup).toEqual({
      enabled: true,
      supported: true,
    });
  });

  it("montre la valeur écrite, pas celle demandée", async () => {
    const asked: boolean[] = [];

    stubPupitre({
      setNotificationsEnabled: (enabled) => {
        asked.push(enabled);

        return Promise.resolve(enabled);
      },
      setStartupEnabled: () =>
        Promise.resolve({ enabled: false, supported: false }),
    });

    await usePreferences.getState().setNotifications(false);
    await usePreferences.getState().setStartup(true);

    expect(asked).toEqual([false]);
    expect(usePreferences.getState().notifications).toBe(false);
    expect(usePreferences.getState().startup).toEqual({
      enabled: false,
      supported: false,
    });
  });
});
