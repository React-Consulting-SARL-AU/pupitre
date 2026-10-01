import { beforeEach, describe, expect, it } from "bun:test";
import type { Transfer, TransferList } from "@shared/transfers";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useServices } from "../services";
import { useTransfers } from "../transfers";

const SERVER = "srv-1";

function transfer(patch: Partial<Transfer> = {}): Transfer {
  return {
    attempt: 1,
    direction: "upload",
    done: 0,
    endedAt: null,
    error: null,
    id: "t1",
    kind: "file",
    localPath: "/Users/jean/Downloads/shop.sql",
    name: "shop.sql",
    rate: null,
    remaining: null,
    remotePath: "dumps/shop.sql",
    serverId: SERVER,
    startedAt: 0,
    status: "running",
    tool: "rsync",
    total: 200,
    ...patch,
  };
}

function list(revision: number, ...transfers: Transfer[]): TransferList {
  return { revision, transfers };
}

beforeEach(() => {
  useTransfers.getState().forget();
  useServices.getState().forget();
});

describe("the transfer list", () => {
  it("takes the list the main process publishes, and ignores a stale revision", async () => {
    let listener: ((list: TransferList) => void) | null = null;

    stubPupitre({
      onTransfers: (callback) => {
        listener = callback;

        return () => undefined;
      },
      transfers: () => Promise.resolve(list(1, transfer())),
    });

    const stop = useTransfers.getState().follow();

    await Promise.resolve();

    expect(useTransfers.getState().transfers).toHaveLength(1);

    (listener as unknown as (list: TransferList) => void)(
      list(3, transfer({ done: 150 }))
    );
    (listener as unknown as (list: TransferList) => void)(
      list(2, transfer({ done: 50 }))
    );

    expect(useTransfers.getState().transfers[0]?.done).toBe(150);
    expect(useTransfers.getState().revision).toBe(3);

    stop();
  });

  it("opens the dialog, then sends what was picked into the folder", async () => {
    const sent: unknown[] = [];

    stubPupitre({
      pickUploadPaths: () => Promise.resolve(["/Users/jean/a.sql"]),
      startUpload: (serverId, dir, paths) => {
        sent.push([serverId, dir, paths]);

        return Promise.resolve({ ok: true, result: list(1, transfer()) });
      },
    });

    const count = await useTransfers.getState().pickAndUpload(SERVER, "dumps");

    expect(count).toBe(1);
    expect(sent).toEqual([[SERVER, "dumps", ["/Users/jean/a.sql"]]]);
    expect(useTransfers.getState().transfers[0]?.id).toBe("t1");
  });

  it("sends nothing when the dialog is closed without a choice", async () => {
    let started = 0;

    stubPupitre({
      pickUploadPaths: () => Promise.resolve([]),
      startUpload: () => {
        started += 1;

        return Promise.resolve({ ok: true, result: list(1) });
      },
    });

    expect(await useTransfers.getState().pickAndUpload(SERVER, "dumps")).toBe(
      0
    );
    expect(started).toBe(0);
  });

  it("has the path of a dropped file read by the bridge, never by the page", async () => {
    const asked: string[] = [];

    stubPupitre({
      pathOfDroppedFile: (file) => {
        asked.push(file.name);

        return Promise.resolve(`/Users/jean/${file.name}`);
      },
      startUpload: (_serverId, _dir, paths) =>
        Promise.resolve({
          ok: true,
          result: list(
            1,
            ...paths.map((path, at) =>
              transfer({ id: `t${at}`, localPath: path })
            )
          ),
        }),
    });

    const files = [new File(["a"], "a.sql"), new File(["b"], "b.sql")];
    const count = await useTransfers
      .getState()
      .dropAndUpload(SERVER, "dumps", files);

    expect(asked).toEqual(["a.sql", "b.sql"]);
    expect(count).toBe(2);
  });

  it("asks where to save a file, and for a folder when it is a folder", async () => {
    const dialogs: string[] = [];
    const started: unknown[] = [];

    stubPupitre({
      pickFolder: () => {
        dialogs.push("folder");

        return Promise.resolve("/Users/jean/Downloads");
      },
      pickSavePath: (name) => {
        dialogs.push(`save:${name}`);

        return Promise.resolve(`/Users/jean/Downloads/${name}`);
      },
      startDownload: (serverId, remote, local) => {
        started.push([serverId, remote, local]);

        return Promise.resolve({
          ok: true,
          result: list(started.length, transfer({ id: `t${started.length}` })),
        });
      },
    });

    const store = useTransfers.getState();

    expect(await store.pickAndDownload(SERVER, "dumps/shop.sql", "file")).toBe(
      true
    );
    expect(await store.pickAndDownload(SERVER, "projects/site", "dir")).toBe(
      true
    );
    expect(dialogs).toEqual(["save:shop.sql", "folder"]);
    expect(started).toEqual([
      [SERVER, "dumps/shop.sql", "/Users/jean/Downloads/shop.sql"],
      [SERVER, "projects/site", "/Users/jean/Downloads"],
    ]);
  });

  it("keeps the main process's refusal for the screen", async () => {
    stubPupitre({
      pickSavePath: () => Promise.resolve("/Users/jean/Downloads/x"),
      startDownload: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "",
            phrase: { id: "refusal.transfer.remotePath" },
          },
          ok: false,
        }),
    });

    const done = await useTransfers
      .getState()
      .pickAndDownload(SERVER, "x", "file");

    expect(done).toBe(false);
    expect(useTransfers.getState().problem?.phrase?.id).toBe(
      "refusal.transfer.remotePath"
    );

    useTransfers.getState().dismissProblem();

    expect(useTransfers.getState().problem).toBeNull();
  });

  it("relays pause, resume and cancel, and takes the returned list", async () => {
    const gestures: string[] = [];
    let revision = 0;

    const answer = (gesture: string) => (id: string) => {
      gestures.push(`${gesture}:${id}`);
      revision += 1;

      return Promise.resolve(
        list(
          revision,
          transfer({ status: gesture === "pause" ? "paused" : "running" })
        )
      );
    };

    stubPupitre({
      cancelTransfer: answer("cancel"),
      pauseTransfer: answer("pause"),
      resumeTransfer: answer("resume"),
    });

    const store = useTransfers.getState();

    await store.pause("t1");

    expect(useTransfers.getState().transfers[0]?.status).toBe("paused");

    await store.resume("t1");
    await store.cancel("t1");

    expect(gestures).toEqual(["pause:t1", "resume:t1", "cancel:t1"]);
  });
});

describe("a dump imported from this computer", () => {
  it("goes into dumps/, then db.import is requested by its name once it has arrived", async () => {
    const calls: unknown[] = [];
    let listener: ((list: TransferList) => void) | null = null;

    stubPupitre({
      agentCall: (_serverId, cmd, params) => {
        calls.push([cmd, params]);

        return Promise.resolve({
          ok: true,
          result: { imported: ["shop.sql"] },
        });
      },
      onTransfers: (callback) => {
        listener = callback;

        return () => undefined;
      },
      pickUploadPaths: () => Promise.resolve(["/Users/jean/shop.sql"]),
      startUpload: (_serverId, dir, paths) =>
        Promise.resolve({
          ok: true,
          result: list(
            1,
            transfer({
              localPath: paths[0] ?? "",
              remotePath: `${dir}/shop.sql`,
            })
          ),
        }),
      transfers: () => Promise.resolve(list(0)),
    });

    useTransfers.getState().follow();
    await useServices.getState().importFromComputer(SERVER, "db.postgres");

    expect(useServices.getState().pendingImports).toEqual([
      {
        moduleId: "db.postgres",
        name: "shop.sql",
        serverId: SERVER,
        transferId: "t1",
      },
    ]);
    expect(calls).toEqual([]);

    (listener as unknown as (list: TransferList) => void)(
      list(2, transfer({ status: "done" }))
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual([
      ["db.import", { engine: "postgres", name: "shop" }],
    ]);
    expect(useServices.getState().pendingImports).toEqual([]);
  });

  it("forgets the import of a cancelled transfer", async () => {
    let listener: ((list: TransferList) => void) | null = null;

    stubPupitre({
      onTransfers: (callback) => {
        listener = callback;

        return () => undefined;
      },
      pickUploadPaths: () => Promise.resolve(["/Users/jean/shop.sql"]),
      startUpload: () =>
        Promise.resolve({ ok: true, result: list(1, transfer()) }),
      transfers: () => Promise.resolve(list(0)),
    });

    useTransfers.getState().follow();
    await useServices.getState().importFromComputer(SERVER, "db.postgres");

    (listener as unknown as (list: TransferList) => void)(
      list(2, transfer({ status: "cancelled" }))
    );

    expect(useServices.getState().pendingImports).toEqual([]);
  });

  it("brings a dump's absolute path under the root before downloading it", async () => {
    const started: unknown[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { path: "/home/dev/dumps/shop-2026.sql.gz", size_bytes: 5 },
        }),
      completions: () =>
        Promise.resolve({
          ok: true,
          result: {
            command: "dev",
            path: "",
            paths: [],
            projects: [],
            root: "/home/dev/projects",
            sub: [],
          },
        }),
      pickSavePath: (name) => Promise.resolve(`/Users/jean/Downloads/${name}`),
      startDownload: (serverId, remote, local) => {
        started.push([serverId, remote, local]);

        return Promise.resolve({
          ok: true,
          result: list(1, transfer({ direction: "download" })),
        });
      },
    });

    await useServices.getState().dump(SERVER, "db.postgres");
    await useServices.getState().downloadDump(SERVER);

    expect(started).toEqual([
      [
        SERVER,
        "dumps/shop-2026.sql.gz",
        "/Users/jean/Downloads/shop-2026.sql.gz",
      ],
    ]);
  });

  it("refuses a dump written outside the root the agent holds", async () => {
    let started = 0;

    stubPupitre({
      agentCall: () =>
        Promise.resolve({
          ok: true,
          result: { path: "/var/backups/shop.sql", size_bytes: 5 },
        }),
      completions: () =>
        Promise.resolve({
          ok: true,
          result: {
            command: "dev",
            path: "",
            paths: [],
            projects: [],
            root: "/home/dev/projects",
            sub: [],
          },
        }),
      startDownload: () => {
        started += 1;

        return Promise.resolve({ ok: true, result: list(1) });
      },
    });

    await useServices.getState().dump(SERVER, "db.postgres");
    await useServices.getState().downloadDump(SERVER);

    expect(started).toBe(0);
    expect(useServices.getState().problem?.phrase?.id).toBe(
      "files.outsideRoot"
    );
  });
});
