import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// An unregistered channel reads as an endless spinner that no screen test sees: every harness answers it.

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = join(HERE, "..");
const PRELOAD = join(HERE, "../../preload/index.ts");
const HARNESS = join(HERE, "../../../e2e/harness");

function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourcesOf(path);
    }

    return entry.name.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
  });
}

function all(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] as string);
}

const preload = readFileSync(PRELOAD, "utf8");
const main = sourcesOf(MAIN).join("\n");
const harness = sourcesOf(HARNESS).join("\n");

/** `streamed(call, events, …)` and `streamedToEnd`: one channel starts the work, the other carries it. */
const STREAMED = /streamed(?:ToEnd)?<[\s\S]*?>\(\s*"([^"]+)",\s*"([^"]+)"/g;
/** `followed(call, events, cancel, …)`: the same, plus the channel that ends it. */
const FOLLOWED = /followed<[\s\S]*?>\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g;
const streams = [...preload.matchAll(STREAMED), ...preload.matchAll(FOLLOWED)];
const follows = [...preload.matchAll(FOLLOWED)];

const invoked = new Set([
  ...all(preload, /ipcRenderer\.invoke\(\s*"([^"]+)"/g),
  ...streams.map((match) => match[1] as string),
]);

const listened = new Set([
  ...all(preload, /ipcRenderer\.on\(\s*"([^"]+)"/g),
  ...all(preload, /subscribe<[^()]*?>\(\s*"([^"]+)"/g),
  ...streams.map((match) => match[2] as string),
]);

const pushed = new Set([
  ...all(preload, /ipcRenderer\.send\(\s*"([^"]+)"/g),
  ...follows.map((match) => match[3] as string),
]);

/** `ipcMain.handle` and `ipc.ts`'s `handle`, which guards the same channel. */
const handled = new Set(
  all(main, /(?:ipcMain\.|\b)handle\(\s*\n?\s*"([^"]+)"/g)
);
const heard = new Set(
  all(main, /(?:ipcMain\.on|\blisten)\(\s*\n?\s*"([^"]+)"/g)
);
const emitted = new Set([
  ...all(main, /\.send\(\s*\n?\s*"([^"]+)"/g),
  ...all(main, /broadcast\(\s*\n?\s*"([^"]+)"/g),
  ...all(main, /relayTo<[\s\S]*?>\(\s*[^,]+,\s*[^,]+,\s*\n?\s*"([^"]+)"/g),
]);

function missing(named: Set<string>, answered: Set<string>): string[] {
  return [...named].filter((channel) => !answered.has(channel)).sort();
}

const stubbed = new Set(all(harness, /answer\(\s*"([^"]+)"/g));

describe("the IPC surface", () => {
  it("answers every channel the preload calls", () => {
    expect(streams.length).toBeGreaterThan(0);
    expect(missing(invoked, handled)).toEqual([]);
  });

  it("registers no channel nobody calls", () => {
    expect(missing(handled, invoked)).toEqual([]);
  });

  it("emits every channel the preload listens to", () => {
    expect(missing(listened, emitted)).toEqual([]);
  });

  it("listens to every channel the preload pushes without a reply", () => {
    expect(missing(pushed, heard)).toEqual([]);
  });

  // A stub on an unregistered channel lets the scenario pass on a build where the real call throws.
  it("makes the harness answer only channels the main process registers", () => {
    expect(stubbed.size).toBeGreaterThan(0);
    expect(missing(stubbed, handled)).toEqual([]);
  });
});
