import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { developmentDataFolder } from "../dev-data-run";
import { LOCAL_PLATFORM_URL } from "../platform-client";

const APP_DATA = "/Users/dev/Library/Application Support";

describe("the data folder of a development build", () => {
  it("is its own, next to the installed app's", () => {
    expect(
      developmentDataFolder(APP_DATA, false, false, LOCAL_PLATFORM_URL)
    ).toBe(join(APP_DATA, "Pupitre Dev"));
  });

  it("changes with the targeted platform: an account on the hosted console never mixes with one on the local console", () => {
    expect(
      developmentDataFolder(
        APP_DATA,
        false,
        false,
        "https://app.pupitre.studio"
      )
    ).toBe(join(APP_DATA, "Pupitre Dev (app.pupitre.studio)"));
    expect(
      developmentDataFolder(APP_DATA, false, false, "http://127.0.0.1:3000")
    ).toBe(join(APP_DATA, "Pupitre Dev"));
  });

  it("stays put for the packaged app and under the harness", () => {
    expect(
      developmentDataFolder(APP_DATA, true, false, "https://app.pupitre.studio")
    ).toBeNull();
    expect(
      developmentDataFolder(APP_DATA, false, true, LOCAL_PLATFORM_URL)
    ).toBeNull();
  });
});
