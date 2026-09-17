import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  clearSecret,
  forgetSecrets,
  generateSecret,
  marks,
  readSecrets,
  revealSecret,
  setSecret,
} from "../install-secrets";

const SERVER = "srv-1";

beforeEach(() => {
  forgetSecrets(SERVER);
});

describe("ce que l'écran sait d'un secret", () => {
  it("ne rend qu'une marque : rempli, généré, révélé", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_saisi_a_la_main");

    const state = marks(SERVER);

    expect(state).toEqual({
      "tool.github": {
        token: { filled: true, generated: false, revealed: false },
      },
    });
    expect(JSON.stringify(state)).not.toContain("ghp_saisi_a_la_main");
  });

  it("oublie un secret qu'on vide", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");
    clearSecret(SERVER, "tool.github", "token");

    expect(marks(SERVER)).toEqual({});
    expect(readSecrets(SERVER)).toEqual({});
  });
});

describe("un secret généré", () => {
  it("se génère sans passer par l'écran", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    expect(marks(SERVER)["db.postgres"]?.app_password).toEqual({
      filled: true,
      generated: true,
      revealed: false,
    });
  });

  it("se montre une fois, puis plus jamais", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    const first = revealSecret(SERVER, "db.postgres", "app_password");

    expect(typeof first).toBe("string");
    expect((first ?? "").length).toBeGreaterThanOrEqual(24);
    expect(revealSecret(SERVER, "db.postgres", "app_password")).toBeNull();
    expect(marks(SERVER)["db.postgres"]?.app_password?.revealed).toBe(true);
  });

  it("garde la valeur révélée pour l'installation", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    const shown = revealSecret(SERVER, "db.postgres", "app_password");

    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: shown ?? "" },
    });
  });
});

describe("la ligne du flux secret", () => {
  it("a la forme du contrat : un objet par module", () => {
    setSecret(SERVER, "db.postgres", "app_password", "pg-app");
    setSecret(SERVER, "db.postgres", "remote_password", "pg-remote");
    setSecret(SERVER, "tool.github", "token", "ghp_x");

    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: "pg-app", remote_password: "pg-remote" },
      "tool.github": { token: "ghp_x" },
    });
  });

  it("numérote les éléments d'une liste de secrets", () => {
    setSecret(SERVER, "ai.hermes", "providers.0", "clé-a");
    setSecret(SERVER, "ai.hermes", "providers.1", "clé-b");

    expect(readSecrets(SERVER)).toEqual({
      "ai.hermes": { "providers.0": "clé-a", "providers.1": "clé-b" },
    });
  });

  it("se relit telle quelle tant que l'agent ne l'a pas prise", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");

    expect(readSecrets(SERVER)).toEqual(readSecrets(SERVER));
    expect(marks(SERVER)).not.toEqual({});
  });

  it("ne survit pas à l'oubli : rien ne reste après l'installation", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");
    forgetSecrets(SERVER);

    expect(readSecrets(SERVER)).toEqual({});
    expect(marks(SERVER)).toEqual({});
  });

  it("ne mélange pas deux serveurs", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_un");
    setSecret("srv-2", "tool.github", "token", "ghp_deux");

    expect(readSecrets(SERVER)).toEqual({ "tool.github": { token: "ghp_un" } });
    expect(readSecrets("srv-2")).toEqual({
      "tool.github": { token: "ghp_deux" },
    });
  });
});

describe("aucun secret dans un journal", () => {
  it("ne passe par aucune console, ni en écriture ni en lecture", () => {
    const watched = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = watched.map((level) =>
      spyOn(console, level).mockImplementation(() => undefined)
    );

    try {
      setSecret(SERVER, "tool.github", "token", "ghp_jamais_journalise");
      generateSecret(SERVER, "db.postgres", "app_password");
      revealSecret(SERVER, "db.postgres", "app_password");
      marks(SERVER);
      readSecrets(SERVER);

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });

  it("ne laisse rien dans ce que la marque sérialise", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_jamais_journalise");
    generateSecret(SERVER, "db.postgres", "app_password");

    expect(JSON.stringify(marks(SERVER))).not.toContain("ghp_");
  });
});
