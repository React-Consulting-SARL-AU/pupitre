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
      status: "verifying",
      updates: true,
      version: "0.2.0",
    });

    state = nextUpdateState(state, { kind: "verified", version: "0.2.0" }, NOW);
    expect(state).toEqual({
      checkedAt: NOW(),
      status: "ready",
      updates: true,
      version: "0.2.0",
    });
  });

  it("n'est jamais prête sur un téléchargement dont la signature n'a pas été vérifiée", () => {
    const downloaded = nextUpdateState(
      initialUpdateState(true),
      { kind: "downloaded", version: "0.2.0" },
      NOW
    );

    expect(downloaded.status).toBe("verifying");
    expect(
      nextUpdateState(downloaded, { kind: "refused", version: "0.2.0" }, NOW)
        .status
    ).toBe("error");
  });

  it("revient au repos quand rien n'est publié, en gardant la date", () => {
    const state = nextUpdateState(
      initialUpdateState(true),
      { kind: "not-available" },
      NOW
    );

    expect(state).toEqual({ checkedAt: NOW(), status: "idle", updates: true });
  });

  it("nomme la raison d'un échec plutôt que les mots de l'updater", () => {
    const failed = nextUpdateState(
      initialUpdateState(true),
      { kind: "error" },
      NOW
    );
    const refused = nextUpdateState(
      initialUpdateState(true),
      { kind: "refused", version: "0.2.0" },
      NOW
    );
    const ready = nextUpdateState(
      nextUpdateState(
        initialUpdateState(true),
        { kind: "downloaded", version: "0.2.0" },
        NOW
      ),
      { kind: "verified", version: "0.2.0" },
      NOW
    );
    const changed = nextUpdateState(ready, { kind: "changed" }, NOW);

    expect(failed).toEqual({
      failure: "failed",
      status: "error",
      updates: true,
    });
    expect(refused).toEqual({
      failure: "refused",
      status: "error",
      updates: true,
      version: "0.2.0",
    });
    expect(changed).toEqual({
      failure: "changed",
      status: "error",
      updates: true,
      version: "0.2.0",
    });
  });
});
