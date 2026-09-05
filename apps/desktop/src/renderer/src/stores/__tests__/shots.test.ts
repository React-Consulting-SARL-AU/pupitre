import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  Shot,
  ShotsReadResult,
} from "@pupitre/shared/agent-protocol/processes";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useShots } from "../shots";

const SERVER = "srv-1";

const SHOTS = [
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "/var/lib/pupitre/shots/accueil.png",
    size_bytes: 240_000,
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

describe("la galerie", () => {
  it("liste les captures que le serveur a nommées", async () => {
    agent({ "shots.list": { shots: SHOTS } });

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({
      shots: [{ name: "accueil.png", size_bytes: 240_000 }],
      status: "read",
    });
  });

  it("garde le refus de l'agent, sans vider ce qui est affiché", async () => {
    agent({});

    await useShots.getState().read(SERVER);

    expect(useShots.getState().state).toMatchObject({ status: "failed" });
  });

  it("dit combien le nettoyage a supprimé, puis relit", async () => {
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

  it("ouvre l'adresse que le serveur donne, jamais une adresse construite", async () => {
    const opened: string[] = [];

    stubPupitre({
      agentCall: () =>
        Promise.resolve({ ok: true, result: { url: "https://shots.exemple" } }),
      openUrl: (url: string) => {
        opened.push(url);

        return Promise.resolve();
      },
    });

    await useShots.getState().openGallery(SERVER);

    expect(opened).toEqual(["https://shots.exemple"]);
    expect(useShots.getState().gallery).toBe("https://shots.exemple");
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

/** The agent as it answers `shots.read`: chunks first, then what proves them. */
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

describe("une capture affichée dans l'app", () => {
  it("recolle les morceaux et rend une image, sans navigateur", async () => {
    const { opened } = reader(numbered(PNG, 12), {});

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("shown");
    expect(view.status === "shown" && view.mediaType).toBe("image/png");
    expect(view.status === "shown" && view.url.startsWith("blob:")).toBe(true);
    expect(opened).toEqual([]);
  });

  it("rend les octets du serveur, pas ceux de l'ordre d'arrivée", async () => {
    reader(numbered(PNG, 12), {}, "reversed");

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("shown");

    if (view.status === "shown") {
      const back = new Uint8Array(await (await fetch(view.url)).arrayBuffer());

      expect([...back]).toEqual([...PNG]);
    }
  });

  it("échoue plutôt que de montrer une image tronquée : empreinte", async () => {
    reader(numbered(PNG, 12), { sha256: "0".repeat(64) });

    await useShots.getState().show(SERVER, SHOT);

    const view = useShots.getState().view;

    expect(view.status).toBe("failed");
    expect(view.status === "failed" && view.error.fix).toBeTruthy();
  });

  it("échoue plutôt que de montrer une image tronquée : compte", async () => {
    reader(numbered(PNG, 12), { chunks: 9 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("échoue quand il arrive plus de morceaux que l'accusé n'en compte", async () => {
    reader(numbered(PNG, 12), { chunks: 1 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("échoue quand un morceau manque au milieu", async () => {
    const cut = numbered(PNG, 12);

    reader([cut[0] as Chunk, cut[2] as Chunk], { chunks: 3 });

    await useShots.getState().show(SERVER, SHOT);

    expect(useShots.getState().view.status).toBe("failed");
  });

  it("garde le refus de l'agent tel quel", async () => {
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

  it("oublie l'image quand la vue se ferme", async () => {
    reader(numbered(PNG, 12), {});

    await useShots.getState().show(SERVER, SHOT);
    useShots.getState().hide();

    expect(useShots.getState().view).toEqual({ status: "idle" });
  });
});
