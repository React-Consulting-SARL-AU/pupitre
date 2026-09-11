import { beforeEach, describe, expect, it } from "bun:test";
import type { AppUpdateState } from "@shared/app-update";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useAppUpdate } from "../app-update";

const IDLE: AppUpdateState = { status: "idle", updates: true };

beforeEach(() => {
  useAppUpdate.setState({ about: null, state: null });
});

describe("la mise à jour de l'app", () => {
  it("lit la version, le canal et l'état de l'updater en une fois", async () => {
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

  it("garde ce que la recherche et l'installation rendent", async () => {
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

  it("suit ce que le processus principal diffuse, jusqu'à ce qu'on cesse d'écouter", () => {
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
