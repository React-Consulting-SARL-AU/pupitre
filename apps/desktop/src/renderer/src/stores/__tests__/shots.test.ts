import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  Shot,
  ShotsReadResult,
} from "@pupitre/shared/agent-protocol/processes";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import {
  ALL_SHOTS,
  folderOf,
  publicAddress,
  shotDay,
  shotFolders,
  shotsByDay,
  shotsIn,
  UNFILED,
  useShots,
} from "../shots";

const SERVER = "srv-1";

const SHOTS = [
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "/var/lib/pupitre/shots/accueil.png",
    size_bytes: 240_000,
  },
];

const TWO_DAYS: Shot[] = [
  {
    created_at: "2026-09-05T10:00:00Z",
    name: "panier.png",
    path: "2026-09-05/panier.png",
    size_bytes: 10,
  },
  {
    created_at: "2026-09-05T11:00:00Z",
    name: "paiement.png",
    path: "2026-09-05/paiement.png",
    size_bytes: 10,
  },
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "2026-09-04/accueil.png",
    size_bytes: 10,
  },
];

function agent(answers: Partial<Record<CommandName, unknown>>): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) => {
      const answer = answers[cmd];

      return Promise.resolve(
        answer === undefined
          ? { error: { code: "internal", message: "rien" }, ok: false }
          : { ok: true, result: answer }
      );
    },
    openUrl: () => Promise.resolve(),
  });
}

beforeEach(() => {
  useShots.getState().forget();
});

describe("the gallery", () => {
  it("lists the captures the server named", async () => {
    agent({ "shots.list": { shots: SHOTS } });

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({
      shots: [{ name: "accueil.png", size_bytes: 240_000 }],
      status: "read",
    });
  });

  it("keeps the agent's refusal, without emptying what is displayed", async () => {
    agent({});

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({ status: "failed" });
  });

  it("says how many the cleanup deleted, then rereads", async () => {
    agent({
      "shots.clean": { removed: 12 },
      "shots.list": { shots: [] },
    });

    await useShots.getState().clean(SERVER);

    expect(useShots.getState().removed).toBe(12);
    expect(useShots.getState().state).toMatchObject({
      shots: [],
      status: "read",
    });
  });

  it("deletes a capture by its path, then rereads the list", async () => {
    const asked: unknown[] = [];

    stubPupitre({
      agentCall: (_serverId: string, cmd: CommandName, params?: unknown) => {
        asked.push([cmd, params]);

        return Promise.resolve(
          cmd === "shots.clean"
            ? { ok: true, result: { removed: 1 } }
            : { ok: true, result: { shots: [] } }
        );
      },
    });

    await useShots.getState().remove(SERVER, SHOTS[0]?.path ?? "");

    expect(asked).toContainEqual([
      "shots.clean",
      { path: "/var/lib/pupitre/shots/accueil.png" },
    ]);
    expect(useShots.getState().removing).toBeNull();
    expect(useShots.getState().removed).toBe(1);
    expect(useShots.getState().state).toMatchObject({
      shots: [],
      status: "read",
    });
  });

  it("keeps a deletion's refusal on the capture, and the list as it was", async () => {
    agent({ "shots.list": { shots: SHOTS } });

    await useShots.getState().read(SERVER);

    stubPupitre({
      agentCall: (_serverId: string, cmd: CommandName) =>
        Promise.resolve(
          cmd === "shots.clean"
            ? {
                error: { code: "bad_request", message: "pas de ce nom" },
                ok: false,
              }
            : { ok: true, result: { shots: SHOTS } }
        ),
    });

    await useShots.getState().remove(SERVER, "2026-09-04/ailleurs.png");

    expect(useShots.getState().problem).toMatchObject({ code: "bad_request" });
    expect(useShots.getState().state).toMatchObject({
      shots: [{ name: "accueil.png" }],
      status: "read",
    });
  });

  it("groups the captures by the day of their folder, in list order", () => {
    const days = shotsByDay(TWO_DAYS);

    expect(days.map((group) => group.day)).toEqual([
      "2026-09-05",
      "2026-09-04",
    ]);
    expect(days[0]?.shots.map((shot) => shot.name)).toEqual([
      "panier.png",
      "paiement.png",
    ]);
  });

  it("opens only the public address the server gives", async () => {
    const opened: string[] = [];

    for (const exposed of [false, true]) {
      stubPupitre({
        agentCall: (_serverId: string, cmd: CommandName) =>
          Promise.resolve({
            ok: true,
            result:
              cmd === "shots.url"
                ? { exposed, url: `https://shots.exemple/${exposed}` }
                : { shots: SHOTS },
          }),
        openUrl: (url: string) => {
          opened.push(url);

          return Promise.resolve();
        },
      });

      await useShots.getState().read(SERVER);
      await useShots.getState().openGallery();
    }

    expect(opened).toEqual(["https://shots.exemple/true"]);
  });
});

const SORTED: Shot[] = [
  {
    created_at: "2026-09-05T10:00:00Z",
    name: "panier.png",
    path: "boutique/2026-09-05/panier.png",
    project: "boutique",
    size_bytes: 10,
  },
  {
    created_at: "2026-09-05T09:00:00Z",
    name: "graphe.png",
    path: "_unfiled/2026-09-05/graphe.png",
    project: null,
    size_bytes: 10,
  },
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "boutique/2026-09-04/accueil.png",
    project: "boutique",
    size_bytes: 10,
  },
  {
    created_at: "2026-09-04T09:00:00Z",
    name: "login.png",
    path: "admin/2026-09-04/login.png",
    project: "admin",
    size_bytes: 10,
  },
];

function sortedAgent(shown: string[], removed: string[] = []): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName, params?: unknown) => {
      if (cmd === "shots.clean") {
        removed.push((params as { path: string }).path);

        return Promise.resolve({ ok: true, result: { removed: 1 } });
      }

      return Promise.resolve({
        ok: true,
        result:
          cmd === "shots.url"
            ? { exposed: true, url: "https://shots.exemple/jeton" }
            : { shots: SORTED.filter((shot) => !removed.includes(shot.path)) },
      });
    },
    agentStream: (_serverId: string, _cmd: CommandName, params: unknown) => {
      shown.push((params as { path: string }).path);

      return Promise.resolve({
        error: { code: "internal", message: "pas d'octets ici" },
        ok: false,
      });
    },
  });
}

describe("the gallery's folders", () => {
  it("arranges the captures by project, no project last", () => {
    expect(shotFolders(SORTED)).toEqual([
      { count: 1, folder: "admin" },
      { count: 2, folder: "boutique" },
      { count: 1, folder: UNFILED },
    ]);
    expect(shotsIn(SORTED, "boutique").map((shot) => shot.name)).toEqual([
      "panier.png",
      "accueil.png",
    ]);
    expect(shotsIn(SORTED, ALL_SHOTS)).toHaveLength(4);
  });

  it("treats a capture from an agent without folders as a capture without a project", () => {
    expect(folderOf(SHOTS[0] as Shot)).toBe(UNFILED);
  });

  it("reads the day from the project folder", () => {
    expect(shotDay(SORTED[0] as Shot)).toBe("2026-09-05");
  });

  it("gives a capture's public address, and nothing for a local gallery", () => {
    const shot = {
      ...(SORTED[0] as Shot),
      path: "boutique/2026-09-05/un panier.png",
    };

    expect(
      publicAddress({ exposed: true, url: "https://shots.exemple/jeton" }, shot)
    ).toBe("https://shots.exemple/jeton/boutique/2026-09-05/un%20panier.png");
    expect(
      publicAddress({ exposed: false, url: "http://127.0.0.1:8099" }, shot)
    ).toBeNull();
    expect(publicAddress(null, shot)).toBeNull();
  });

  it("walks the chosen folder, not the whole gallery", async () => {
    const shown: string[] = [];
    sortedAgent(shown);

    await useShots.getState().read(SERVER);
    useShots.getState().choose("boutique");
    await useShots.getState().show(SERVER, SORTED[0] as Shot);
    await useShots.getState().step(SERVER, 1);
    await useShots.getState().step(SERVER, 1);

    expect(shown).toEqual([
      "boutique/2026-09-05/panier.png",
      "boutique/2026-09-04/accueil.png",
    ]);
    expect(useShots.getState().address).toEqual({
      exposed: true,
      url: "https://shots.exemple/jeton",
    });
  });

  it("shows the neighbour of a capture deleted from the viewer", async () => {
    const shown: string[] = [];
    const removed: string[] = [];
    sortedAgent(shown, removed);

    await useShots.getState().read(SERVER);
    useShots.getState().choose("boutique");
    await useShots.getState().show(SERVER, SORTED[0] as Shot);
    await useShots.getState().remove(SERVER, "boutique/2026-09-05/panier.png");

    expect(removed).toEqual(["boutique/2026-09-05/panier.png"]);
    expect(useShots.getState().view).toMatchObject({
      shot: { path: "boutique/2026-09-04/accueil.png" },
    });

    await useShots.getState().remove(SERVER, "boutique/2026-09-04/accueil.png");

    expect(useShots.getState().view).toEqual({ status: "idle" });
    expect(useShots.getState().folder).toBe(ALL_SHOTS);
  });
});

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

const SHOT = SHOTS[0] as Shot;

type Bytes = Uint8Array<ArrayBuffer>;

function base64(bytes: Bytes): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function digest(bytes: Bytes): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pieces(bytes: Bytes, size: number): string[] {
  const cut: string[] = [];

  for (let at = 0; at < bytes.length; at += size) {
    cut.push(base64(bytes.slice(at, at + size)));
  }

  return cut;
}

interface Chunk {
  seq: number;
  bytes: string;
}

function numbered(bytes: Bytes, size: number): Chunk[] {
  return pieces(bytes, size).map((piece, seq) => ({ bytes: piece, seq }));
}

// `shots.read` answers with the chunks first, then what proves them.
function reader(
  chunks: readonly Chunk[],
  ack: Partial<ShotsReadResult>,
  order: "ordered" | "reversed" = "ordered"
): { opened: string[] } {
  const opened: string[] = [];

  stubPupitre({
    agentCall: () => Promise.resolve({ ok: true, result: { shots: SHOTS } }),
    agentStream: async (
      _serverId: string,
      _cmd: CommandName,
      _params: unknown,
      onEvent: (event: Event) => void
    ) => {
      const sent = order === "reversed" ? [...chunks].reverse() : chunks;

      for (const chunk of sent) {
        onEvent({ ...chunk, event: "shot", id: 2 });
      }

      return {
        ok: true,
        result: {
          chunks: chunks.length,
          media_type: "image/png",
          path: SHOT.path,
          sha256: await digest(PNG),
          size_bytes: PNG.length,
          ...ack,
        },
      };
    },
    openUrl: (url: string) => {
      opened.push(url);

      return Promise.resolve();
    },
  });

  return { opened };
}

describe("a capture displayed in the app", () => {
  it("glues the chunks back together and returns an image, without a browser", async () => {
    const { opened } = reader(numbered(PNG, 12), {});

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("shown");
    expect(view.status === "shown" && view.mediaType).toBe("image/png");
    expect(view.status === "shown" && view.url.startsWith("blob:")).toBe(true);
    expect(opened).toEqual([]);
  });

  it("returns the server's bytes, not those of arrival order", async () => {
    reader(numbered(PNG, 12), {}, "reversed");

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("shown");

    if (view.status === "shown") {
      const back = new Uint8Array(await (await fetch(view.url)).arrayBuffer());

      expect([...back]).toEqual([...PNG]);
    }
  });

  it("fails rather than showing a truncated image: fingerprint", async () => {
    reader(numbered(PNG, 12), { sha256: "0".repeat(64) });

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("failed");
    expect(view.status === "failed" && view.error.fix).toBeTruthy();
  });

  it("fails rather than showing a truncated image: count", async () => {
    reader(numbered(PNG, 12), { chunks: 9 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("fails when more chunks arrive than the acknowledgement counts", async () => {
    reader(numbered(PNG, 12), { chunks: 1 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("fails when a chunk is missing in the middle", async () => {
    const cut = numbered(PNG, 12);

    reader([cut[0] as Chunk, cut[2] as Chunk], { chunks: 3 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("keeps the agent's refusal as is", async () => {
    stubPupitre({
      agentStream: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            fix: "Choisis une capture de la liste.",
            message: "Ce chemin n'est pas dans la galerie.",
          },
          ok: false,
        }),
    });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view).toMatchObject({
      error: { fix: "Choisis une capture de la liste." },
      status: "failed",
    });
  });

  it("forgets the image when the view closes", async () => {
    reader(numbered(PNG, 12), {});

    await useShots.getState().show(SERVER, SHOT);
    useShots.getState().hide();

    expect(useShots.getState().view).toEqual({ status: "idle" });
  });
});

describe("thumbnails and the viewer", () => {
  it("reads a thumbnail once, and keeps it for the viewer", async () => {
    let reads = 0;

    stubPupitre({
      agentCall: () => Promise.resolve({ ok: true, result: { shots: SHOTS } }),
      agentStream: async (
        _serverId: string,
        _cmd: CommandName,
        _params: unknown,
        onEvent: (event: Event) => void
      ) => {
        reads += 1;

        for (const chunk of numbered(PNG, 12)) {
          onEvent({ ...chunk, event: "shot", id: 2 });
        }

        return {
          ok: true,
          result: {
            chunks: numbered(PNG, 12).length,
            media_type: "image/png",
            path: SHOT.path,
            sha256: await digest(PNG),
            size_bytes: PNG.length,
          },
        };
      },
    });

    await useShots.getState().read(SERVER);
    await useShots.getState().readThumbnail(SERVER, SHOT);
    await useShots.getState().readThumbnail(SERVER, SHOT);

    expect(reads).toBe(1);
    expect(useShots.getState().thumbnails[SHOT.path]).toMatchObject({
      mediaType: "image/png",
      status: "ready",
    });

    await useShots.getState().show(SERVER, SHOT);

    expect(reads).toBe(1);
    expect(useShots.getState().view.status).toBe("shown");
  });

  it("moves to the next and the previous capture in list order", async () => {
    const shown: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({ ok: true, result: { shots: TWO_DAYS } }),
      agentStream: (_serverId: string, _cmd: CommandName, params: unknown) => {
        shown.push((params as { path: string }).path);

        return Promise.resolve({
          error: { code: "internal", message: "pas d'octets ici" },
          ok: false,
        });
      },
    });

    await useShots.getState().read(SERVER);
    await useShots.getState().show(SERVER, TWO_DAYS[0] as Shot);
    await useShots.getState().step(SERVER, 1);
    await useShots.getState().step(SERVER, 1);
    await useShots.getState().step(SERVER, 1);
    await useShots.getState().step(SERVER, -1);

    expect(shown).toEqual([
      "2026-09-05/panier.png",
      "2026-09-05/paiement.png",
      "2026-09-04/accueil.png",
      "2026-09-05/paiement.png",
    ]);
  });
});

describe("a viewer closed during reading", () => {
  it("does not reopen when the image size arrives after closing", async () => {
    reader(numbered(PNG, 12), {});

    const showing = useShots.getState().show(SERVER, SHOT);

    useShots.getState().hide();
    await showing;

    expect(useShots.getState().view).toEqual({ status: "idle" });
  });
});

describe("a capture saved to this disk", () => {
  function shown(): void {
    useShots.setState({
      saveProblem: null,
      saved: null,
      view: {
        blob: new Blob([PNG], { type: "image/png" }),
        mediaType: "image/png",
        shot: SHOT,
        size: null,
        status: "shown",
        url: "blob:shown",
      },
    });
  }

  it("asks for the dialog, then passes the bytes and the returned path, never another", async () => {
    const asked: string[] = [];
    const written: { path: string; bytes: Uint8Array }[] = [];

    stubPupitre({
      pickSavePath: (name: string) => {
        asked.push(name);

        return Promise.resolve("/Users/ada/Downloads/accueil.png");
      },
      saveShot: (path: string, bytes: Uint8Array) => {
        written.push({ bytes, path });

        return Promise.resolve({ ok: true, result: { path } });
      },
    });
    shown();

    await useShots.getState().save();

    expect(asked).toEqual(["accueil.png"]);
    expect(written).toHaveLength(1);
    expect(written[0]?.path).toBe("/Users/ada/Downloads/accueil.png");
    expect([...(written[0]?.bytes ?? [])]).toEqual([...PNG]);
    expect(useShots.getState().saved).toBe("/Users/ada/Downloads/accueil.png");
    expect(useShots.getState().saveProblem).toBeNull();
  });

  it("writes nothing when the dialog is closed", async () => {
    let written = 0;

    stubPupitre({
      pickSavePath: () => Promise.resolve(null),
      saveShot: () => {
        written += 1;

        return Promise.resolve({ ok: true, result: { path: "" } });
      },
    });
    shown();

    await useShots.getState().save();

    expect(written).toBe(0);
    expect(useShots.getState().saved).toBeNull();
  });

  it("keeps the main process's refusal in the viewer", async () => {
    stubPupitre({
      pickSavePath: () => Promise.resolve("/Users/ada/Downloads/accueil.png"),
      saveShot: () =>
        Promise.resolve({
          error: {
            code: "internal",
            message: "refusal.shots.saveFailed",
            phrase: {
              id: "refusal.shots.saveFailed",
              values: {
                path: "/Users/ada/Downloads/accueil.png",
                reason: "EACCES",
              },
            },
          },
          ok: false,
        }),
    });
    shown();

    await useShots.getState().save();

    expect(useShots.getState().saved).toBeNull();
    expect(useShots.getState().saveProblem).toMatchObject({
      phrase: { id: "refusal.shots.saveFailed" },
    });

    useShots.getState().hide();

    expect(useShots.getState().saveProblem).toBeNull();
  });

  it("says nothing about a capture the viewer left during the dialog", async () => {
    stubPupitre({
      pickSavePath: () => {
        useShots.getState().hide();

        return Promise.resolve("/Users/ada/Downloads/accueil.png");
      },
      saveShot: (path: string) =>
        Promise.resolve({ ok: true, result: { path } }),
    });
    shown();

    await useShots.getState().save();

    expect(useShots.getState().saved).toBeNull();
    expect(useShots.getState().view).toEqual({ status: "idle" });
  });
});
