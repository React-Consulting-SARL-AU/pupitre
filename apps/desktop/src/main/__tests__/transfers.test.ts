import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import type { AgentResponse } from "@shared/agent";
import type { TransferList } from "@shared/transfers";
import {
  backoffMs,
  capableRsync,
  createTransferQueue,
  MAX_ATTEMPTS,
  parseProgress,
  remoteRelative,
  rsyncArgs,
  scpArgs,
  TRANSFERS_VERSION,
  type TransferDeps,
  type TransferQueue,
} from "../transfers-run";

const SERVER = "srv-1";
const CONFIG = "/Users/jean/Library/Application Support/Pupitre/ssh/config";
const SSH = ["-F", CONFIG, "pupitre-srv-1"];
const ROOT = "/home/dev";
const DUMP = "/Users/jean/Downloads/shop.sql";
const DIGEST = "a".repeat(64);
const STORE = "/tmp/transfers.json";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: () => boolean;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    setTimeout(() => child.emit("exit", null), 0);

    return true;
  };

  return child;
}

interface Spawned {
  command: string;
  args: string[];
  child: FakeChild;
}

interface Harness {
  deps: TransferDeps;
  spawned: Spawned[];
  published: TransferList[];
  store: Map<string, string>;
  hashes: Map<string, string>;
  waited: number[];
  /** The transfers as spawned, without the probes. */
  moves: () => Spawned[];
}

interface Options {
  localRsync?: string;
  remoteRsync?: boolean;
  remoteDigest?: string;
  remoteKind?: "file" | "dir";
  remoteSize?: number;
  localFiles?: Record<string, { kind: "file" | "dir"; size: number }>;
  store?: string;
}

function harness(options: Options = {}): Harness {
  const spawned: Spawned[] = [];
  const published: TransferList[] = [];
  const store = new Map<string, string>();
  const hashes = new Map<string, string>([[DUMP, DIGEST]]);
  const waited: number[] = [];
  const files: Record<string, { kind: "file" | "dir"; size: number }> = {
    [DUMP]: { kind: "file", size: 200_000_000 },
    "/Users/jean/Downloads": { kind: "dir", size: 0 },
    "/Users/jean/site": { kind: "dir", size: 0 },
    ...options.localFiles,
  };

  if (options.store !== undefined) {
    store.set(STORE, options.store);
  }

  const localRsync =
    options.localRsync ?? "rsync  version 3.4.1  protocol version 32\n";
  const remoteRsync = options.remoteRsync ?? true;

  const spawn = (command: string, args: string[]): ChildProcess => {
    const child = fakeChild();

    spawned.push({ args, child, command });

    if (args[0] === "--version") {
      setTimeout(() => {
        if (localRsync.length > 0) {
          child.stdout.emit("data", localRsync);
          child.emit("exit", 0);
        } else {
          child.emit("error", new Error("ENOENT"));
        }
      }, 0);
    } else if (args.at(-1) === "command -v rsync") {
      setTimeout(() => child.emit("exit", remoteRsync ? 0 : 1), 0);
    }

    return child as unknown as ChildProcess;
  };

  const deps: TransferDeps = {
    local: {
      ensureDir: () => undefined,
      hash: (path) => Promise.resolve(hashes.get(path) ?? ""),
      readStore: (path) => store.get(path) ?? null,
      stat: (path) => files[path] ?? null,
      writeStore: (path, text) => {
        store.set(path, text);
      },
    },
    now: () => 1_700_000_000_000,
    platform: "darwin",
    publish: (list) => published.push(list),
    resolve: (serverId) => (serverId === SERVER ? SSH : null),
    root: () => Promise.resolve(ROOT),
    rsyncCandidates: ["rsync"],
    spawn,
    stat: (_serverId, path, hash): Promise<AgentResponse<FsStatResult>> =>
      Promise.resolve({
        ok: true,
        result: {
          kind: options.remoteKind ?? "file",
          mode: "0644",
          modified_at: "2026-09-01T10:00:00Z",
          path,
          size_bytes: options.remoteSize ?? 200_000_000,
          ...(hash ? { sha256: options.remoteDigest ?? DIGEST } : {}),
        },
      }),
    storePath: STORE,
    wait: (ms) => {
      waited.push(ms);

      return Promise.resolve();
    },
  };

  return {
    deps,
    hashes,
    moves: () =>
      spawned.filter(
        (one) =>
          one.args[0] !== "--version" && one.args.at(-1) !== "command -v rsync"
      ),
    published,
    spawned,
    store,
    waited,
  };
}

/** The transfer process spawned at that rank, the probes left out. */
function moved(h: Harness, at = 0): FakeChild {
  const one = h.moves().at(at);

  if (!one) {
    throw new Error(`no transfer spawned at ${at}`);
  }

  return one.child;
}

function tick(times = 6): Promise<void> {
  return times === 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() =>
        tick(times - 1)
      );
}

async function uploaded(
  queue: TransferQueue,
  path = DUMP,
  dir = "dumps"
): Promise<TransferList> {
  queue.designate(path);

  const answer = await queue.upload(SERVER, dir, [path]);

  await tick();

  return answer.ok ? answer.result : { revision: 0, transfers: [] };
}

describe("a transfer's rsync command line", () => {
  it("cites the app's configuration in -e and resumes the partial file", () => {
    const args = rsyncArgs(
      { direction: "upload", kind: "file", localPath: DUMP },
      SSH,
      "/home/dev/dumps/shop.sql"
    );

    expect(args).toEqual([
      "-e",
      `ssh -F "${CONFIG}"`,
      "--partial",
      "--append-verify",
      "--info=progress2",
      "--no-inc-recursive",
      DUMP,
      "pupitre-srv-1:/home/dev/dumps/shop.sql",
    ]);
  });

  it("descends into a folder with -r and copies its contents", () => {
    const args = rsyncArgs(
      { direction: "download", kind: "dir", localPath: "/Users/jean/site" },
      SSH,
      "/home/dev/projects/site"
    );

    expect(args.slice(-3)).toEqual([
      "-r",
      "pupitre-srv-1:/home/dev/projects/site/",
      "/Users/jean/site",
    ]);
  });

  it("leaves a system host without -F", () => {
    const args = rsyncArgs(
      { direction: "upload", kind: "file", localPath: DUMP },
      ["my-host"],
      "/home/dev/shop.sql"
    );

    expect(args[1]).toBe("ssh");
    expect(args.at(-1)).toBe("my-host:/home/dev/shop.sql");
  });
});

describe("the fallback scp command line", () => {
  it("passes the same configuration, without resuming", () => {
    expect(
      scpArgs(
        { direction: "download", kind: "file", localPath: DUMP },
        SSH,
        "/home/dev/dumps/shop.sql"
      )
    ).toEqual(["-F", CONFIG, "pupitre-srv-1:/home/dev/dumps/shop.sql", DUMP]);
  });

  it("drops a folder into its parent, where scp -r creates it by name", () => {
    expect(
      scpArgs(
        { direction: "upload", kind: "dir", localPath: "/Users/jean/site" },
        SSH,
        "/home/dev/projects/site"
      )
    ).toEqual([
      "-F",
      CONFIG,
      "-r",
      "/Users/jean/site",
      "pupitre-srv-1:/home/dev/projects",
    ]);
  });
});

describe("reading progress2", () => {
  it("reads the bytes, the percentage, the rate and the time left", () => {
    expect(
      parseProgress("     104,857,600  52%   12.34MB/s    0:00:07  ")
    ).toEqual({
      done: 104_857_600,
      percent: 52,
      rate: 12_340_000,
      remaining: 7,
    });
  });

  it("takes the last line of a chunk split by carriage returns", () => {
    const chunk =
      "\r      1,048,576   0%  512.00kB/s    0:06:30  \r     52,428,800  26%    8.00MB/s    0:00:18  ";

    expect(parseProgress(chunk)).toEqual({
      done: 52_428_800,
      percent: 26,
      rate: 8_000_000,
      remaining: 18,
    });
  });

  it("reads the final line as a complete transfer, the time becoming elapsed", () => {
    expect(
      parseProgress(
        "    200,000,000 100%   40.12MB/s    0:00:04 (xfr#1, to-chk=0/1)\n"
      )
    ).toEqual({
      done: 200_000_000,
      percent: 100,
      rate: 40_120_000,
      remaining: 0,
    });
  });

  it("reads nothing from what is not a progress line", () => {
    expect(parseProgress("sending incremental file list\n")).toBeNull();
  });
});

describe("this computer's rsync", () => {
  it("recognises rsync 3.1 or later, but not openrsync", () => {
    expect(capableRsync("rsync  version 3.4.1  protocol version 32")).toBe(
      true
    );
    expect(capableRsync("rsync  version 3.0.9  protocol version 30")).toBe(
      false
    );
    expect(capableRsync("openrsync: protocol version 29")).toBe(false);
  });
});

describe("a remote path named by the renderer", () => {
  it("accepts a relative path under the root, the root included", () => {
    expect(remoteRelative("dumps/shop.sql")).toBe("dumps/shop.sql");
    expect(remoteRelative("")).toBe("");
    expect(remoteRelative("projects/site/")).toBe("projects/site");
  });

  it("refuses an absolute path, a .., a line break or a NUL", () => {
    expect(remoteRelative("/etc/passwd")).toBeNull();
    expect(remoteRelative("dumps/../../root")).toBeNull();
    expect(remoteRelative("dumps/a\nb")).toBeNull();
    expect(remoteRelative("dumps/a\0b")).toBeNull();
    expect(remoteRelative(42)).toBeNull();
  });
});

describe("the wait between two attempts", () => {
  it("doubles each time and caps out", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});

describe("the transfer queue", () => {
  it("starts an upload through rsync on the app's configuration", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    const list = await uploaded(queue);

    expect(list.transfers[0]?.remotePath).toBe("dumps/shop.sql");
    expect(h.spawned[0]?.args).toEqual(["--version"]);
    expect(h.spawned[1]?.command).toBe("ssh");
    expect(h.spawned[1]?.args).toEqual([
      "-o",
      "BatchMode=yes",
      ...SSH,
      "command -v rsync",
    ]);

    const move = h.moves()[0];

    expect(move?.command).toBe("rsync");
    expect(move?.args).toEqual([
      "-e",
      `ssh -F "${CONFIG}"`,
      "--partial",
      "--append-verify",
      "--info=progress2",
      "--no-inc-recursive",
      DUMP,
      "pupitre-srv-1:/home/dev/dumps/shop.sql",
    ]);
    expect(queue.list().transfers[0]?.status).toBe("running");
    expect(queue.list().transfers[0]?.tool).toBe("rsync");
  });

  it("refuses a remote path that is absolute or climbs up", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    queue.designate(DUMP);

    const absolute = await queue.upload(SERVER, "/etc", [DUMP]);
    const climbing = await queue.upload(SERVER, "dumps/..", [DUMP]);
    const download = await queue.download(SERVER, "../root/.ssh", DUMP);

    expect(absolute.ok).toBe(false);
    expect(climbing.ok).toBe(false);
    expect(download.ok).toBe(false);
    expect(!absolute.ok && absolute.error.phrase?.id).toBe(
      "refusal.transfer.remotePath"
    );
    expect(h.moves()).toEqual([]);
  });

  it("refuses a local path that no dialog box designated", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    const upload = await queue.upload(SERVER, "dumps", [DUMP]);
    const download = await queue.download(SERVER, "dumps/shop.sql", DUMP);

    expect(upload.ok).toBe(false);
    expect(!upload.ok && upload.error.phrase?.id).toBe(
      "refusal.transfer.localPath"
    );
    expect(download.ok).toBe(false);
    expect(h.moves()).toEqual([]);
  });

  it("designates only an absolute path", () => {
    const queue = createTransferQueue(harness().deps);

    expect(queue.designate("Downloads/shop.sql")).toBeNull();
    expect(queue.designate("")).toBeNull();
    expect(queue.designate(DUMP)).toBe(DUMP);
  });

  it("recognises only the paths a dialog box returned", () => {
    const queue = createTransferQueue(harness().deps);

    expect(queue.designated(DUMP)).toBe(false);

    queue.designate(DUMP);

    expect(queue.designated(DUMP)).toBe(true);
    expect(queue.designated(`${DUMP}.bak`)).toBe(false);
    expect(queue.designated(null)).toBe(false);
  });

  it("tracks progress and relays it at most four times per second", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    const before = h.published.length;
    const child = moved(h);

    child.stdout.emit(
      "data",
      "\r     52,428,800  26%    8.00MB/s    0:00:18  "
    );
    child.stdout.emit(
      "data",
      "\r    104,857,600  52%   12.34MB/s    0:00:07  "
    );

    expect(h.published.length).toBe(before);

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(h.published.length).toBe(before + 1);

    const shown = h.published.at(-1)?.transfers[0];

    expect(shown?.done).toBe(104_857_600);
    expect(shown?.total).toBe(200_000_000);
    expect(shown?.rate).toBe(12_340_000);
    expect(shown?.remaining).toBe(7);
    expect(h.published.at(-1)?.revision).toBeGreaterThan(
      h.published[before - 1]?.revision ?? 0
    );
  });

  it("marks the transfer done when rsync exits with zero, the state travelling in the last event", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    const child = moved(h);

    child.emit("exit", 0);
    await tick();

    const last = h.published.at(-1)?.transfers[0];

    expect(last?.status).toBe("done");
    expect(last?.done).toBe(200_000_000);
    expect(queue.list().transfers[0]?.status).toBe("done");
    expect(h.store.get(STORE)).toContain('"transfers": []');
  });

  it("runs only two at a time, the others wait", async () => {
    const h = harness({
      localFiles: {
        "/a.sql": { kind: "file", size: 1 },
        "/b.sql": { kind: "file", size: 1 },
        "/c.sql": { kind: "file", size: 1 },
      },
    });
    const queue = createTransferQueue(h.deps);

    for (const path of ["/a.sql", "/b.sql", "/c.sql"]) {
      queue.designate(path);
    }

    await queue.upload(SERVER, "dumps", ["/a.sql", "/b.sql", "/c.sql"]);
    await tick();

    expect(queue.list().transfers.map((one) => one.status)).toEqual([
      "running",
      "running",
      "queued",
    ]);
    expect(h.moves()).toHaveLength(2);

    moved(h).emit("exit", 0);
    await tick();

    expect(queue.list().transfers.map((one) => one.status)).toEqual([
      "done",
      "running",
      "running",
    ]);
    expect(h.moves()).toHaveLength(3);
  });

  it("retries after a 255 with a growing delay, then gives up with the fix", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      const child = moved(h, -1);

      child.stderr.emit("data", "ssh: connect to host: Connection refused\n");
      child.emit("exit", 255);
      await tick();

      expect(queue.list().transfers[0]?.status).toBe("running");
      expect(queue.list().transfers[0]?.attempt).toBe(attempt + 1);
    }

    expect(h.waited).toEqual([1000, 2000, 4000, 8000]);
    expect(h.moves()).toHaveLength(MAX_ATTEMPTS);

    moved(h, -1).emit("exit", 255);
    await tick();

    const failed = queue.list().transfers[0];

    expect(failed?.status).toBe("failed");
    expect(failed?.error?.phrase?.id).toBe("refusal.transfer.network");
    expect(failed?.error?.phrase?.values).toEqual({ max: MAX_ATTEMPTS });
  });

  it("says what happened while waiting for a new attempt", async () => {
    const h = harness();
    let queued: TransferList | undefined;
    const queue = createTransferQueue({
      ...h.deps,
      wait: () => {
        queued = queue.list();

        return Promise.resolve();
      },
    });

    await uploaded(queue);

    moved(h).emit("exit", 12);
    await tick();

    expect(queued?.transfers[0]?.status).toBe("queued");
    expect(queued?.transfers[0]?.error?.phrase?.id).toBe(
      "refusal.transfer.retrying"
    );
  });

  it("fails without retrying on any other code, with its fix", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    moved(h).emit("exit", 23);
    await tick();

    const failed = queue.list().transfers[0];

    expect(failed?.status).toBe("failed");
    expect(failed?.error?.phrase?.id).toBe("refusal.transfer.partial");
    expect(h.moves()).toHaveLength(1);
  });

  it("cancelling kills the process and removes the transfer from what is kept", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    const list = await uploaded(queue);
    const id = list.transfers[0]?.id ?? "";

    queue.cancel(id);
    await tick();

    expect(moved(h).killed).toBe(true);
    expect(queue.list().transfers[0]?.status).toBe("cancelled");
    expect(h.store.get(STORE)).toContain('"transfers": []');
    expect(h.moves()).toHaveLength(1);
  });

  it("a pause kills, a resume restarts, and rsync picks up by itself", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    const list = await uploaded(queue);
    const id = list.transfers[0]?.id ?? "";
    const first = moved(h);

    first.stdout.emit(
      "data",
      "\r    104,857,600  52%   12.34MB/s    0:00:07  "
    );
    queue.pause(id);
    await tick();

    expect(first.killed).toBe(true);
    expect(queue.list().transfers[0]?.status).toBe("paused");
    expect(queue.list().transfers[0]?.done).toBe(104_857_600);
    expect(h.store.get(STORE)).toContain('"status": "paused"');

    queue.resume(id);
    await tick();

    expect(queue.list().transfers[0]?.status).toBe("running");
    expect(h.moves()).toHaveLength(2);
    expect(h.moves()[1]?.args).toContain("--append-verify");
  });

  it("falls back to scp when the server has no rsync, and verifies the sha256", async () => {
    const h = harness({ remoteRsync: false });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    const move = h.moves()[0];

    expect(move?.command).toBe("scp");
    expect(move?.args).toEqual([
      "-F",
      CONFIG,
      DUMP,
      "pupitre-srv-1:/home/dev/dumps/shop.sql",
    ]);
    expect(queue.list().transfers[0]?.tool).toBe("scp");

    moved(h).emit("exit", 0);
    await tick();

    expect(queue.list().transfers[0]?.status).toBe("done");
  });

  it("falls back to scp when this computer only has openrsync", async () => {
    const h = harness({ localRsync: "openrsync: protocol version 29\n" });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    expect(h.moves()[0]?.command).toBe("scp");
    expect(
      h.spawned.some((one) => one.args.at(-1) === "command -v rsync")
    ).toBe(false);
  });

  it("falls back to scp when rsync is missing altogether here", async () => {
    const h = harness({ localRsync: "" });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    expect(h.moves()[0]?.command).toBe("scp");
  });

  it("refuses an scp whose fingerprint does not match", async () => {
    const h = harness({ remoteDigest: "b".repeat(64), remoteRsync: false });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    moved(h).emit("exit", 0);
    await tick();

    const failed = queue.list().transfers[0];

    expect(failed?.status).toBe("failed");
    expect(failed?.error?.phrase?.id).toBe("refusal.transfer.mismatch");
  });

  it("asks the server for rsync only once per session", async () => {
    const h = harness({
      localFiles: { "/a.sql": { kind: "file", size: 1 } },
    });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);
    await uploaded(queue, "/a.sql");

    expect(
      h.spawned.filter((one) => one.args.at(-1) === "command -v rsync")
    ).toHaveLength(1);
    expect(h.spawned.filter((one) => one.args[0] === "--version")).toHaveLength(
      1
    );
  });

  it("downloads under the remote name into the designated folder", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    queue.designate("/Users/jean/Downloads");

    const answer = await queue.download(
      SERVER,
      "dumps/shop.sql",
      "/Users/jean/Downloads"
    );

    await tick();

    expect(answer.ok && answer.result.transfers[0]?.localPath).toBe(
      "/Users/jean/Downloads/shop.sql"
    );
    expect(answer.ok && answer.result.transfers[0]?.total).toBe(200_000_000);
    expect(h.moves()[0]?.args.slice(-2)).toEqual([
      "pupitre-srv-1:/home/dev/dumps/shop.sql",
      "/Users/jean/Downloads/shop.sql",
    ]);
  });

  it("writes what is left to do with its revision, and reads it back paused at launch", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);
    moved(h).stdout.emit(
      "data",
      "\r     52,428,800  26%    8.00MB/s    0:00:18  "
    );
    queue.shutdown();

    const written = JSON.parse(h.store.get(STORE) ?? "{}") as {
      version: number;
      transfers: { status: string; done: number }[];
    };

    expect(written.version).toBe(TRANSFERS_VERSION);
    expect(written.transfers[0]?.status).toBe("paused");
    expect(written.transfers[0]?.done).toBe(52_428_800);

    const again = harness({ store: h.store.get(STORE) });
    const restored = createTransferQueue(again.deps);

    const list = restored.restore();

    expect(list.transfers).toHaveLength(1);
    expect(list.transfers[0]?.status).toBe("paused");
    expect(list.transfers[0]?.remotePath).toBe("dumps/shop.sql");
    expect(list.transfers[0]?.done).toBe(52_428_800);
    expect(again.moves()).toEqual([]);

    restored.resume(list.transfers[0]?.id ?? "");
    await tick();

    expect(again.moves()).toHaveLength(1);
  });

  it("leaves a file written by a newer version intact", () => {
    const newer = JSON.stringify({
      transfers: [{ id: "x", shape: "unknown" }],
      version: TRANSFERS_VERSION + 1,
    });
    const h = harness({ store: newer });
    const queue = createTransferQueue(h.deps);

    queue.restore();
    queue.shutdown();

    expect(h.store.get(STORE)).toBe(newer);
    expect(queue.list().transfers).toEqual([]);
  });

  it("refuses a server the configuration does not know", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    queue.designate(DUMP);

    const answer = await queue.upload("srv-2", "dumps", [DUMP]);

    expect(answer.ok).toBe(false);
    expect(h.spawned).toEqual([]);
  });

  it("forgets a finished transfer when asked, never a running one", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    const list = await uploaded(queue);
    const id = list.transfers[0]?.id ?? "";

    expect(queue.dismiss(id).transfers).toHaveLength(1);

    moved(h).emit("exit", 0);
    await tick();

    expect(queue.dismiss(id).transfers).toEqual([]);
  });
});
