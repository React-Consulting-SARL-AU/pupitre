import { describe, expect, it } from "bun:test";
import { initialUpdateState, nextUpdateState } from "../updater-state";

const NOW = () => "2026-09-11T10:00:00.000Z";

describe("the app update state", () => {
  it("starts from nothing, and says whether this build updates itself", () => {
    expect(initialUpdateState(false)).toEqual({
      status: "idle",
      updates: false,
    });
    expect(initialUpdateState(true)).toEqual({ status: "idle", updates: true });
  });

  it("follows the course of an update found, downloaded, ready", () => {
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

  it("is never ready on a download whose signature was not verified", () => {
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

  it("returns to idle when nothing is published, keeping the date", () => {
    const state = nextUpdateState(
      initialUpdateState(true),
      { kind: "not-available" },
      NOW
    );

    expect(state).toEqual({ checkedAt: NOW(), status: "idle", updates: true });
  });

  it("names the reason for a failure rather than the updater's own words", () => {
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
