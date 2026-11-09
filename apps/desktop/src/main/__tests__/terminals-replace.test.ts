import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";
import type { OpenTerminal } from "../terminals";
import type { Transport } from "../tmux-attach";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-terminals-"));

interface FakeTransport {
  emitData: (data: string, replay?: boolean) => void;
  emitExit: (code: number) => void;
}

const spawned: FakeTransport[] = [];

mock.module("electron", () => electronStub(root));

function attach(): Transport {
  let onData: (data: string, replay: boolean) => void = () => undefined;
  let onExit: (code: number) => void = () => undefined;

  spawned.push({
    emitData: (data, replay = false) => onData(data, replay),
    emitExit: (code) => onExit(code),
  });

  return {
    clearHistory: () => undefined,
    kill: () => undefined,
    onData: (listener) => {
      onData = listener;
    },
    onExit: (listener) => {
      onExit = listener;
    },
    resize: () => undefined,
    write: () => undefined,
  };
}

const terminals = await import("../terminals");
const { closeAll, states } = terminals;

function open(request: OpenTerminal, recipient: WebContents): void {
  terminals.open(request, recipient, attach);
}

const sent: { channel: string; payload: unknown }[] = [];

const window = {
  isDestroyed: () => false,
  send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
} as unknown as WebContents;

const REQUEST = {
  cols: 80,
  history: 1000,
  id: "t1",
  kind: "shell" as const,
  project: null,
  rows: 24,
  serverId: "srv-1",
  tmux: "new-session -A -s shell-server-t1",
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

  it("does not take the screen redrawn at the attach for work the agent just did", async () => {
    open({ ...REQUEST, kind: "claude" }, window);
    spawned[0]?.emitData("x".repeat(5000), true);

    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(states().t1).toBe("idle");
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
