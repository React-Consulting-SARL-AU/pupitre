import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-terminals-"));

interface FakePty {
  emitData: (data: string) => void;
  emitExit: (code: number) => void;
}

const spawned: FakePty[] = [];

mock.module("electron", () => electronStub(root));

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

describe("a tab reopened under the same id", () => {
  it("receives neither the last bytes nor the end of the old shell", async () => {
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

  it("still reports the end of a shell closed with no replacement", () => {
    open(REQUEST, window);
    spawned[0]?.emitExit(0);

    expect(sent).toContainEqual({
      channel: "terminal-exit",
      payload: { code: 0, id: "t1" },
    });
  });
});
