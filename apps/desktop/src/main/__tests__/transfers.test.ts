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

describe("la ligne rsync d'un transfert", () => {
  it("cite la configuration de l'app dans -e et reprend le partiel", () => {
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

  it("descend dans un dossier avec -r et copie son contenu", () => {
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

  it("laisse un hôte du système sans -F", () => {
    const args = rsyncArgs(
      { direction: "upload", kind: "file", localPath: DUMP },
      ["my-host"],
      "/home/dev/shop.sql"
    );

    expect(args[1]).toBe("ssh");
    expect(args.at(-1)).toBe("my-host:/home/dev/shop.sql");
  });
});

describe("la ligne scp de repli", () => {
  it("passe la même configuration, sans reprise", () => {
    expect(
      scpArgs(
        { direction: "download", kind: "file", localPath: DUMP },
        SSH,
        "/home/dev/dumps/shop.sql"
      )
    ).toEqual(["-F", CONFIG, "pupitre-srv-1:/home/dev/dumps/shop.sql", DUMP]);
  });

  it("dépose un dossier dans son parent, où scp -r le crée par son nom", () => {
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

describe("la lecture de progress2", () => {
  it("lit les octets, le pourcentage, le débit et le temps restant", () => {
    expect(
      parseProgress("     104,857,600  52%   12.34MB/s    0:00:07  ")
    ).toEqual({
      done: 104_857_600,
      percent: 52,
      rate: 12_340_000,
      remaining: 7,
    });
  });

  it("prend la dernière ligne d'un paquet coupé par des retours chariot", () => {
    const chunk =
      "\r      1,048,576   0%  512.00kB/s    0:06:30  \r     52,428,800  26%    8.00MB/s    0:00:18  ";

    expect(parseProgress(chunk)).toEqual({
      done: 52_428_800,
      percent: 26,
      rate: 8_000_000,
      remaining: 18,
    });
  });

  it("lit la ligne de fin comme un transfert entier, le temps devenant écoulé", () => {
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

  it("ne lit rien dans ce qui n'est pas une ligne de progression", () => {
    expect(parseProgress("sending incremental file list\n")).toBeNull();
  });
});

describe("le rsync de cet ordinateur", () => {
  it("reconnaît un rsync 3.1 ou plus, et pas openrsync", () => {
    expect(capableRsync("rsync  version 3.4.1  protocol version 32")).toBe(
      true
    );
    expect(capableRsync("rsync  version 3.0.9  protocol version 30")).toBe(
      false
    );
    expect(capableRsync("openrsync: protocol version 29")).toBe(false);
  });
});

describe("un chemin distant nommé par le renderer", () => {
  it("accepte un chemin relatif sous la racine, la racine comprise", () => {
    expect(remoteRelative("dumps/shop.sql")).toBe("dumps/shop.sql");
    expect(remoteRelative("")).toBe("");
    expect(remoteRelative("projects/site/")).toBe("projects/site");
  });

  it("refuse un chemin absolu, un .., un saut de ligne ou un NUL", () => {
    expect(remoteRelative("/etc/passwd")).toBeNull();
    expect(remoteRelative("dumps/../../root")).toBeNull();
    expect(remoteRelative("dumps/a\nb")).toBeNull();
    expect(remoteRelative("dumps/a\0b")).toBeNull();
    expect(remoteRelative(42)).toBeNull();
  });
});

describe("l'attente entre deux essais", () => {
  it("double à chaque fois et plafonne", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});

describe("la file des transferts", () => {
  it("lance un envoi par rsync sur la configuration de l'app", async () => {
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

  it("refuse un chemin distant absolu ou qui remonte", async () => {
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

  it("refuse un chemin local qu'aucune boîte de dialogue n'a désigné", async () => {
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

  it("ne désigne qu'un chemin absolu", () => {
    const queue = createTransferQueue(harness().deps);

    expect(queue.designate("Downloads/shop.sql")).toBeNull();
    expect(queue.designate("")).toBeNull();
    expect(queue.designate(DUMP)).toBe(DUMP);
  });

  it("ne reconnaît que les chemins qu'une boîte a rendus", () => {
    const queue = createTransferQueue(harness().deps);

    expect(queue.designated(DUMP)).toBe(false);

    queue.designate(DUMP);

    expect(queue.designated(DUMP)).toBe(true);
    expect(queue.designated(`${DUMP}.bak`)).toBe(false);
    expect(queue.designated(null)).toBe(false);
  });

  it("suit la progression et la relaie au plus quatre fois par seconde", async () => {
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

  it("marque le transfert fini quand rsync sort à zéro, l'état voyageant dans le dernier événement", async () => {
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

  it("n'en fait tourner que deux, les autres attendent", async () => {
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

  it("relance après un 255 avec un délai croissant, puis renonce avec le remède", async () => {
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

  it("dit ce qui s'est passé pendant l'attente d'un nouvel essai", async () => {
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

  it("échoue sans réessayer sur un autre code, avec son remède", async () => {
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

  it("annuler tue le processus et retire le transfert de ce qui est gardé", async () => {
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

  it("une pause tue, une reprise relance, et rsync reprend de lui-même", async () => {
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

  it("se replie sur scp quand le serveur n'a pas rsync, et vérifie le sha256", async () => {
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

  it("se replie sur scp quand cet ordinateur n'a qu'openrsync", async () => {
    const h = harness({ localRsync: "openrsync: protocol version 29\n" });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    expect(h.moves()[0]?.command).toBe("scp");
    expect(
      h.spawned.some((one) => one.args.at(-1) === "command -v rsync")
    ).toBe(false);
  });

  it("se replie sur scp quand rsync manque tout à fait ici", async () => {
    const h = harness({ localRsync: "" });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    expect(h.moves()[0]?.command).toBe("scp");
  });

  it("refuse un scp dont l'empreinte ne correspond pas", async () => {
    const h = harness({ remoteDigest: "b".repeat(64), remoteRsync: false });
    const queue = createTransferQueue(h.deps);

    await uploaded(queue);

    moved(h).emit("exit", 0);
    await tick();

    const failed = queue.list().transfers[0];

    expect(failed?.status).toBe("failed");
    expect(failed?.error?.phrase?.id).toBe("refusal.transfer.mismatch");
  });

  it("ne demande rsync au serveur qu'une fois par session", async () => {
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

  it("télécharge sous le nom distant dans le dossier désigné", async () => {
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

  it("écrit ce qui reste à faire avec sa révision, et le relit en pause au lancement", async () => {
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

  it("laisse intact un fichier écrit par une version plus récente", () => {
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

  it("refuse un serveur que la configuration ne connaît pas", async () => {
    const h = harness();
    const queue = createTransferQueue(h.deps);

    queue.designate(DUMP);

    const answer = await queue.upload("srv-2", "dumps", [DUMP]);

    expect(answer.ok).toBe(false);
    expect(h.spawned).toEqual([]);
  });

  it("oublie un transfert terminé quand on le lui demande, jamais un transfert en cours", async () => {
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
