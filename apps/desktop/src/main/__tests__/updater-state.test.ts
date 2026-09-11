import { describe, expect, it } from "bun:test";
import { initialUpdateState, nextUpdateState } from "../updater-state";

const NOW = () => "2026-09-11T10:00:00.000Z";

describe("l'état de la mise à jour de l'app", () => {
  it("part de rien, et dit si ce build se met à jour", () => {
    expect(initialUpdateState(false)).toEqual({
      status: "idle",
      updates: false,
    });
    expect(initialUpdateState(true)).toEqual({ status: "idle", updates: true });
  });

  it("suit le fil d'une mise à jour trouvée, téléchargée, prête", () => {
    let state = initialUpdateState(true);

    state = nextUpdateState(state, { kind: "checking" }, NOW);
    expect(state.status).toBe("checking");

    state = nextUpdateState(
      state,
      { kind: "available", version: "0.2.0" },
      NOW
    );
    expect(state).toEqual({
      checkedAt: NOW(),
      status: "available",
      updates: true,
      version: "0.2.0",
    });

    state = nextUpdateState(state, { kind: "progress", percent: 41.7 }, NOW);
    expect(state).toMatchObject({
      percent: 42,
      status: "downloading",
      version: "0.2.0",
    });

    state = nextUpdateState(
      state,
      { kind: "downloaded", version: "0.2.0" },
      NOW
    );
    expect(state).toEqual({
      checkedAt: NOW(),
      status: "ready",
      updates: true,
      version: "0.2.0",
    });
  });

  it("revient au repos quand rien n'est publié, en gardant la date", () => {
    const state = nextUpdateState(
      initialUpdateState(true),
      { kind: "not-available" },
      NOW
    );

    expect(state).toEqual({ checkedAt: NOW(), status: "idle", updates: true });
  });

  it("garde l'erreur dans les mots de l'updater, et une signature refusée", () => {
    const failed = nextUpdateState(
      initialUpdateState(true),
      { kind: "error", message: "net::ERR_INTERNET_DISCONNECTED" },
      NOW
    );
    const refused = nextUpdateState(
      initialUpdateState(true),
      { kind: "refused", version: "0.2.0" },
      NOW
    );

    expect(failed).toEqual({
      error: "net::ERR_INTERNET_DISCONNECTED",
      status: "error",
      updates: true,
    });
    expect(refused.status).toBe("error");
    expect(refused.version).toBe("0.2.0");
  });
});
