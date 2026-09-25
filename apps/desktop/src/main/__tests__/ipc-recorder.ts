import { mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trustPage } from "../ipc-guard";
import { enableTrace, type TraceEntry, tracesTo } from "../trace";
import { electronStub } from "./electron-stub";

type Listener = (event: unknown, ...args: unknown[]) => unknown;

const INDEX = "/Applications/Pupitre/index.html";

export const OWN_PAGE = {
  sender: { send: () => undefined },
  senderFrame: { parent: null, url: `file://${INDEX}` },
};

export const OTHER_PAGE = {
  ...OWN_PAGE,
  senderFrame: { parent: null, url: "https://evil.example/" },
};

const channels = new Map<string, Listener>();

function record(channel: string, listener: Listener): void {
  channels.set(channel, listener);
}

export function recordChannels(): string {
  const root = mkdtempSync(join(tmpdir(), "pupitre-ipc-"));

  mock.module("electron", () =>
    electronStub(root, { ipcMain: { handle: record, on: record } })
  );
  trustPage({ devUrl: undefined, indexFile: INDEX });

  return root;
}

/** Whether the guard turned the call away before its handler ran. */
export function refused(
  channel: string,
  event: typeof OWN_PAGE,
  ...args: unknown[]
): boolean {
  const listener = channels.get(channel);

  if (!listener) {
    throw new Error(`${channel} is not registered`);
  }

  const seen: TraceEntry[] = [];
  const debug = console.debug;

  console.debug = () => undefined;
  enableTrace(true);
  tracesTo((entry) => seen.push(entry));

  try {
    listener(event, ...args);
  } catch {
    // A handler that ran and threw is not a refusal: the trace tells them apart.
  } finally {
    tracesTo(null);
    enableTrace(false);
    console.debug = debug;
  }

  return seen.some(
    (entry) =>
      entry.scope === "ipc" &&
      entry.event === "refused" &&
      entry.detail?.channel === channel
  );
}
