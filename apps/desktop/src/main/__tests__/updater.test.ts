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

describe("the app update", () => {
  it("reads the public feed of the stable channel by default", () => {
    const plan = updaterPlan(environment());

    expect(plan).toEqual({
      channel: "stable",
      feed: { provider: "generic", url: `${UPDATE_BASE_URL}/stable` },
      updates: true,
    });
  });

  it("follows the channel the build gave it", () => {
    const plan = updaterPlan(environment({ channel: "beta" }));

    expect(plan).toMatchObject({
      channel: "beta",
      feed: { url: `${UPDATE_BASE_URL}/beta` },
    });
  });

  it("reads the bucket the build designated", () => {
    const plan = updaterPlan(
      environment({ downloads: "https://dl.exemple.test/" })
    );

    expect(plan).toMatchObject({
      feed: { url: "https://dl.exemple.test/app/stable" },
    });
  });

  it("keeps the production bucket when the build names none", () => {
    expect(updaterPlan(environment({ downloads: "  " }))).toMatchObject({
      feed: { url: "https://dl.pupitre.studio/app/stable" },
    });
  });

  it("ignores a channel that is not one", () => {
    expect(updaterPlan(environment({ channel: "nightly" }))).toMatchObject({
      channel: "stable",
    });
  });

  it("looks for nothing from a development folder", () => {
    const plan = updaterPlan(environment({ packaged: false }));

    expect(plan).toEqual({ reason: "development", updates: false });
  });

  it("updates an AppImage and leaves the .deb to apt", () => {
    const appImage = updaterPlan(
      environment({ appImage: "/home/dev/Pupitre.AppImage", platform: "linux" })
    );
    const deb = updaterPlan(environment({ platform: "linux" }));

    expect(appImage.updates).toBe(true);
    expect(deb).toEqual({ reason: "unsupported", updates: false });
  });

  it("updates Windows like macOS", () => {
    expect(updaterPlan(environment({ platform: "win32" })).updates).toBe(true);
  });
});
