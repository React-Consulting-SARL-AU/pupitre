import { describe, expect, it } from "bun:test";
import { devDefaultsFrom } from "../dev-defaults-run";

/**
 * What the developer's environment fills in, and where it stops: a packaged
 * build answers nothing, whatever the environment says.
 */
const ENV = {
  PUPITRE_DEV_GIT_EMAIL: "ada@pupitre.studio",
  PUPITRE_DEV_GIT_NAME: "Ada Lovelace",
  PUPITRE_DEV_SERVER_HOST: "127.0.0.1",
  PUPITRE_DEV_SERVER_NAME: "Test",
  PUPITRE_DEV_SERVER_PASSWORD: "pupitre",
  PUPITRE_DEV_SERVER_PORT: "2222",
  PUPITRE_DEV_SERVER_USER: "root",
};

describe("les valeurs de développement", () => {
  it("viennent de l'environnement, sous les clés que le socle déclare", () => {
    expect(devDefaultsFrom(ENV, false)).toEqual({
      fields: {
        "core.system": {
          git_email: "ada@pupitre.studio",
          git_name: "Ada Lovelace",
        },
      },
      server: {
        host: "127.0.0.1",
        name: "Test",
        password: "pupitre",
        port: 2222,
        user: "root",
      },
    });
  });

  it("n'existent pas dans un build empaqueté", () => {
    expect(devDefaultsFrom(ENV, true)).toBeNull();
  });

  it("laissent vide ce qui n'est pas donné, et ignorent un port qui n'en est pas un", () => {
    const defaults = devDefaultsFrom(
      { PUPITRE_DEV_SERVER_PORT: "vingt-deux" },
      false
    );

    expect(defaults?.fields).toEqual({});
    expect(defaults?.server).toEqual({
      host: "",
      name: "",
      password: "",
      port: null,
      user: "",
    });
  });
});
