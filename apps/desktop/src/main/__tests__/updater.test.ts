import { describe, expect, it } from "bun:test";
import {
  type UpdaterEnvironment,
  updateBaseUrl,
  updaterPlan,
} from "../updater-run";

const UPDATE_BASE_URL = updateBaseUrl(undefined);

function environment(
  over: Partial<UpdaterEnvironment> = {}
): UpdaterEnvironment {
  return {
    appImage: undefined,
    channel: undefined,
    downloads: undefined,
    packaged: true,
    platform: "darwin",
    ...over,
  };
}

describe("la mise à jour de l'app", () => {
  it("lit le flux public du canal stable par défaut", () => {
    const plan = updaterPlan(environment());

    expect(plan).toEqual({
      channel: "stable",
      feed: { provider: "generic", url: `${UPDATE_BASE_URL}/stable` },
      updates: true,
    });
  });

  it("suit le canal que le build lui a donné", () => {
    const plan = updaterPlan(environment({ channel: "beta" }));

    expect(plan).toMatchObject({
      channel: "beta",
      feed: { url: `${UPDATE_BASE_URL}/beta` },
    });
  });

  it("lit le seau que le build lui a désigné", () => {
    const plan = updaterPlan(
      environment({ downloads: "https://dl.exemple.test/" })
    );

    expect(plan).toMatchObject({
      feed: { url: "https://dl.exemple.test/app/stable" },
    });
  });

  it("garde le seau de production quand le build n'en nomme aucun", () => {
    expect(updaterPlan(environment({ downloads: "  " }))).toMatchObject({
      feed: { url: "https://dl.pupitre.studio/app/stable" },
    });
  });

  it("ignore un canal qui n'en est pas un", () => {
    expect(updaterPlan(environment({ channel: "nightly" }))).toMatchObject({
      channel: "stable",
    });
  });

  it("ne cherche rien depuis un dossier de développement", () => {
    const plan = updaterPlan(environment({ packaged: false }));

    expect(plan).toEqual({ reason: "development", updates: false });
  });

  it("met à jour un AppImage et laisse le .deb à apt", () => {
    const appImage = updaterPlan(
      environment({ appImage: "/home/dev/Pupitre.AppImage", platform: "linux" })
    );
    const deb = updaterPlan(environment({ platform: "linux" }));

    expect(appImage.updates).toBe(true);
    expect(deb).toEqual({ reason: "unsupported", updates: false });
  });

  it("met à jour Windows comme macOS", () => {
    expect(updaterPlan(environment({ platform: "win32" })).updates).toBe(true);
  });
});
