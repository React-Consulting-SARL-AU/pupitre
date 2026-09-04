import { describe, expect, it } from "bun:test";
import {
  UPDATE_OWNER,
  UPDATE_REPO,
  type UpdaterEnvironment,
  updaterPlan,
} from "../updater-run";

function environment(
  over: Partial<UpdaterEnvironment> = {}
): UpdaterEnvironment {
  return {
    appImage: undefined,
    packaged: true,
    platform: "darwin",
    token: "jeton-de-release",
    ...over,
  };
}

describe("la mise à jour de l'app", () => {
  it("lit une release privée avec le jeton du build", () => {
    const plan = updaterPlan(environment());

    expect(plan).toEqual({
      feed: {
        owner: UPDATE_OWNER,
        private: true,
        provider: "github",
        repo: UPDATE_REPO,
        token: "jeton-de-release",
      },
      updates: true,
    });
  });

  it("ne cherche rien depuis un dossier de développement", () => {
    const plan = updaterPlan(environment({ packaged: false }));

    expect(plan).toEqual({ reason: "development", updates: false });
  });

  it("se tait quand le build n'a pas reçu de jeton", () => {
    const plan = updaterPlan(environment({ token: undefined }));

    expect(plan).toEqual({ reason: "no_token", updates: false });
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
