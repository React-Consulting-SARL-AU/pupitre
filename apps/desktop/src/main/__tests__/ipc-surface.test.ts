import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bridge, checked as a whole rather than one call at a time.
 *
 * A channel the preload invokes and the main process never registered throws
 * inside the renderer, where it reads as a screen that turns for ever — the
 * kind of failure no screen test sees, because every harness answers the
 * channel the real build had forgotten. The two halves are read here as text:
 * what one side names, the other must answer.
 */

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

/** What the Playwright harness answers in place of the main process. */
const stubbed = new Set(all(harness, /answer\(\s*"([^"]+)"/g));

describe("la surface IPC", () => {
  it("répond à chaque canal que le preload appelle", () => {
    expect(streams.length).toBeGreaterThan(0);
    expect(missing(invoked, handled)).toEqual([]);
  });

  it("n'enregistre aucun canal que personne n'appelle", () => {
    expect(missing(handled, invoked)).toEqual([]);
  });

  it("émet chaque canal que le preload écoute", () => {
    expect(missing(listened, emitted)).toEqual([]);
  });

  it("écoute chaque canal que le preload pousse sans réponse", () => {
    expect(missing(pushed, heard)).toEqual([]);
  });

  /*
    A stub answers on a channel the main process may never have registered, and
    the scenario passes on a build where the real call throws. Every channel the
    harness replaces must be one that exists without it.
  */
  it("ne fait répondre au harnais que des canaux que le main enregistre", () => {
    expect(stubbed.size).toBeGreaterThan(0);
    expect(missing(stubbed, handled)).toEqual([]);
  });
});
