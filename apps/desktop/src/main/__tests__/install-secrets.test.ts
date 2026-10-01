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

describe("what the screen knows about a secret", () => {
  it("returns only a mark: filled, generated, revealed", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_saisi_a_la_main");

    const state = marks(SERVER);

    expect(state).toEqual({
      "tool.github": {
        token: { filled: true, generated: false, revealed: false },
      },
    });
    expect(JSON.stringify(state)).not.toContain("ghp_saisi_a_la_main");
  });

  it("forgets a secret that is cleared", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");
    clearSecret(SERVER, "tool.github", "token");

    expect(marks(SERVER)).toEqual({});
    expect(readSecrets(SERVER)).toEqual({});
  });
});

describe("a generated secret", () => {
  it("is generated without going through the screen", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    expect(marks(SERVER)["db.postgres"]?.app_password).toEqual({
      filled: true,
      generated: true,
      revealed: false,
    });
  });

  it("is shown once, then never again", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    const first = revealSecret(SERVER, "db.postgres", "app_password");

    expect(typeof first).toBe("string");
    expect((first ?? "").length).toBeGreaterThanOrEqual(24);
    expect(revealSecret(SERVER, "db.postgres", "app_password")).toBeNull();
    expect(marks(SERVER)["db.postgres"]?.app_password?.revealed).toBe(true);
  });

  it("keeps the revealed value for the installation", () => {
    generateSecret(SERVER, "db.postgres", "app_password");

    const shown = revealSecret(SERVER, "db.postgres", "app_password");

    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: shown ?? "" },
    });
  });
});

describe("the secret stream line", () => {
  it("has the contract's shape: one object per module", () => {
    setSecret(SERVER, "db.postgres", "app_password", "pg-app");
    setSecret(SERVER, "db.postgres", "remote_password", "pg-remote");
    setSecret(SERVER, "tool.github", "token", "ghp_x");

    expect(readSecrets(SERVER)).toEqual({
      "db.postgres": { app_password: "pg-app", remote_password: "pg-remote" },
      "tool.github": { token: "ghp_x" },
    });
  });

  it("numbers the items of a list of secrets", () => {
    setSecret(SERVER, "ai.hermes", "providers.0", "clé-a");
    setSecret(SERVER, "ai.hermes", "providers.1", "clé-b");

    expect(readSecrets(SERVER)).toEqual({
      "ai.hermes": { "providers.0": "clé-a", "providers.1": "clé-b" },
    });
  });

  it("is reread as is until the agent has taken it", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");

    expect(readSecrets(SERVER)).toEqual(readSecrets(SERVER));
    expect(marks(SERVER)).not.toEqual({});
  });

  it("does not survive forgetting: nothing remains after the installation", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_x");
    forgetSecrets(SERVER);

    expect(readSecrets(SERVER)).toEqual({});
    expect(marks(SERVER)).toEqual({});
  });

  it("does not mix two servers", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_un");
    setSecret("srv-2", "tool.github", "token", "ghp_deux");

    expect(readSecrets(SERVER)).toEqual({ "tool.github": { token: "ghp_un" } });
    expect(readSecrets("srv-2")).toEqual({
      "tool.github": { token: "ghp_deux" },
    });
  });
});

describe("no secret in a log", () => {
  it("goes through no console, neither on write nor on read", () => {
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

  it("leaves nothing in what the mark serializes", () => {
    setSecret(SERVER, "tool.github", "token", "ghp_jamais_journalise");
    generateSecret(SERVER, "db.postgres", "app_password");

    expect(JSON.stringify(marks(SERVER))).not.toContain("ghp_");
  });
});
