import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";

/**
 * What this file proves: a tab reopened under the same identifier belongs to
 * its new shell. The old one, killed on the way, still speaks for a moment —
 * its last bytes and its exit are not the new tab's.
 */

const root = mkdtempSync(join(tmpdir(), "pupitre-terminals-"));

interface FakePty {
  emitData: (data: string) => void;
  emitExit: (code: number) => void;
}

const spawned: FakePty[] = [];

mock.module("electron", () => ({
  app: { getPath: () => root },
}));

mock.module("node-pty", () => ({
  spawn: () => {
    let onData: (data: string) => void = () => undefined;
    let onExit: (exit: { exitCode: number }) => void = () => undefined;

    spawned.push({
      emitData: (data) => onData(data),
      emitExit: (exitCode) => onExit({ exitCode }),
    });

    return {
      kill: () => undefined,
      onData: (listener: typeof onData) => {
        onData = listener;
      },
      onExit: (listener: typeof onExit) => {
        onExit = listener;
      },
      resize: () => undefined,
      write: () => undefined,
    };
  },
}));

const { closeAll, open, states } = await import("../terminals");

const sent: { channel: string; payload: unknown }[] = [];

const window = {
  isDestroyed: () => false,
  send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
} as unknown as WebContents;

const REQUEST = {
  cols: 80,
  command: "tmux new-session -A -s shell-server-t1",
  id: "t1",
  kind: "shell" as const,
  project: null,
  rows: 24,
  serverId: "srv-1",
};

afterEach(() => {
  closeAll();
  spawned.length = 0;
  sent.length = 0;
});

describe("un onglet rouvert sous le même identifiant", () => {
  it("ne reçoit ni les derniers octets ni la fin de l'ancien shell", async () => {
    open(REQUEST, window);
    open(REQUEST, window);

    const [old, fresh] = spawned;

    old?.emitData("ancien");
    old?.emitExit(0);
    fresh?.emitData("nouveau");

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(sent.filter((one) => one.channel === "terminal-exit")).toEqual([]);
    expect(
      sent
        .filter((one) => one.channel === "terminal-data")
        .map((one) => one.payload)
    ).toEqual([{ data: "nouveau", id: "t1" }]);
    expect(states().t1).not.toBe("finished");
  });

  it("dit encore la fin d'un shell fermé sans remplaçant", () => {
    open(REQUEST, window);
    spawned[0]?.emitExit(0);

    expect(sent).toContainEqual({
      channel: "terminal-exit",
      payload: { code: 0, id: "t1" },
    });
  });
});
