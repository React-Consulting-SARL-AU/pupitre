import { beforeEach, describe, expect, it } from "bun:test";
import type { AppUpdateState } from "@shared/app-update";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useAppUpdate } from "../app-update";

const IDLE: AppUpdateState = { status: "idle", updates: true };

beforeEach(() => {
  useAppUpdate.setState({ about: null, state: null });
});

describe("the app update", () => {
  it("reads the version, the channel and the updater state at once", async () => {
    stubPupitre({
      appAbout: () => Promise.resolve({ channel: "stable", version: "0.4.2" }),
      appUpdateState: () => Promise.resolve(IDLE),
    });

    await useAppUpdate.getState().read();

    expect(useAppUpdate.getState().about).toEqual({
      channel: "stable",
      version: "0.4.2",
    });
    expect(useAppUpdate.getState().state).toEqual(IDLE);
  });

  it("keeps what the check and the install return", async () => {
    const checking: AppUpdateState = { status: "checking", updates: true };
    const ready: AppUpdateState = {
      status: "ready",
      updates: true,
      version: "0.5.0",
    };

    stubPupitre({
      checkAppUpdate: () => Promise.resolve(checking),
      installAppUpdate: () => Promise.resolve(ready),
    });

    await useAppUpdate.getState().check();

    expect(useAppUpdate.getState().state).toEqual(checking);

    await useAppUpdate.getState().install();

    expect(useAppUpdate.getState().state).toEqual(ready);
  });

  it("follows what the main process broadcasts, until listening stops", () => {
    const listeners: ((state: AppUpdateState) => void)[] = [];
    let stopped = false;

    stubPupitre({
      onAppUpdate: (listener) => {
        listeners.push(listener);

        return () => {
          stopped = true;
        };
      },
    });

    const stop = useAppUpdate.getState().listen();

    for (const push of listeners) {
      push({ percent: 40, status: "downloading", updates: true });
    }

    expect(useAppUpdate.getState().state).toEqual({
      percent: 40,
      status: "downloading",
      updates: true,
    });

    stop();

    expect(stopped).toBe(true);
  });
});
