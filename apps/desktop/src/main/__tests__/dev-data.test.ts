import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { developmentDataFolder } from "../dev-data-run";
import { LOCAL_PLATFORM_URL } from "../platform-client";

const APP_DATA = "/Users/dev/Library/Application Support";

describe("le dossier de données d'un build de développement", () => {
  it("est le sien, à côté de celui de l'app installée", () => {
    expect(
      developmentDataFolder(APP_DATA, false, false, LOCAL_PLATFORM_URL)
    ).toBe(join(APP_DATA, "Pupitre Dev"));
  });

  it("change avec la plateforme visée : un compte de la console hébergée ne se mêle pas à celui de la console locale", () => {
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

  it("ne bouge ni pour l'app empaquetée ni sous le harnais", () => {
    expect(
      developmentDataFolder(APP_DATA, true, false, "https://app.pupitre.studio")
    ).toBeNull();
    expect(
      developmentDataFolder(APP_DATA, false, true, LOCAL_PLATFORM_URL)
    ).toBeNull();
  });
});
