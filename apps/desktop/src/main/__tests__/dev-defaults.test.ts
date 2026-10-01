import { describe, expect, it } from "bun:test";
import { devDefaultsFrom } from "../dev-defaults-run";

const ENV = {
  PUPITRE_DEV_GIT_EMAIL: "ada@pupitre.studio",
  PUPITRE_DEV_GIT_NAME: "Ada Lovelace",
  PUPITRE_DEV_SERVER_HOST: "127.0.0.1",
  PUPITRE_DEV_SERVER_NAME: "Test",
  PUPITRE_DEV_SERVER_PASSWORD: "pupitre",
  PUPITRE_DEV_SERVER_PORT: "2222",
  PUPITRE_DEV_SERVER_USER: "root",
};

describe("the development values", () => {
  it("come from the environment, under the keys the base declares", () => {
    expect(devDefaultsFrom(ENV, "development")).toEqual({
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

  it("do not exist outside a development build on the local console", () => {
    expect(devDefaultsFrom(ENV, "production")).toBeNull();
  });

  it("leave empty whatever is not given, and ignore a port that is not one", () => {
    const defaults = devDefaultsFrom(
      { PUPITRE_DEV_SERVER_PORT: "vingt-deux" },
      "development"
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
