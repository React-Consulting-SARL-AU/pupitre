import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { developmentDataFolder } from "../dev-data-run";

const APP_DATA = "/Users/dev/Library/Application Support";

describe("le dossier de données d'un build de développement", () => {
  it("est le sien, à côté de celui de l'app installée", () => {
    expect(developmentDataFolder(APP_DATA, false, false)).toBe(
      join(APP_DATA, "Pupitre Dev")
    );
  });

  it("ne bouge ni pour l'app empaquetée ni sous le harnais", () => {
    expect(developmentDataFolder(APP_DATA, true, false)).toBeNull();
    expect(developmentDataFolder(APP_DATA, false, true)).toBeNull();
  });
});
