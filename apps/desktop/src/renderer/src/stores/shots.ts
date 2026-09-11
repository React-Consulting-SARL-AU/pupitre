import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  Shot,
  ShotMediaType,
  ShotsCleanResult,
  ShotsListResult,
  ShotsReadResult,
  ShotsUrlResult,
} from "@pupitre/shared/agent-protocol/processes";
import { ShotEventSchema } from "@pupitre/shared/agent-protocol/processes";
import { translate } from "@renderer/i18n/translate";
import { agentCall as call } from "@renderer/lib/agent-call";
import { type ShotSize, shotBytes, shotSize } from "@renderer/lib/shot-image";
import type { AgentError, AgentResponse } from "@shared/agent";
import { create } from "zustand";

/** One capture on the screen: read, checked, and shown from the app's memory. */
export type ShotView =
  | { status: "idle" }
  | { status: "reading"; shot: Shot }
  | {
      status: "shown";
      shot: Shot;
      url: string;
      blob: Blob;
      mediaType: ShotMediaType;
      size: ShotSize | null;
    }
  | { status: "failed"; shot: Shot; error: AgentError };

/**
 * A thumbnail is the same bytes as the capture, read once and kept for the
 * life of the list: the grid asks for the ones on screen and no other.
 */
export type ThumbnailState =
  | { status: "reading" }
  | { status: "ready"; url: string; blob: Blob; mediaType: ShotMediaType }
  | { status: "failed"; error: AgentError };

export type ShotsState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; shots: Shot[] }
  | { status: "failed"; serverId: string; error: AgentError };

interface ShotsStore {
  state: ShotsState;
  view: ShotView;
  thumbnails: Record<string, ThumbnailState>;
  /** The address the server serves the gallery at, once it has said. */
  gallery: string | null;
  cleaning: boolean;
  /** The capture being removed, so its own button waits and no other. */
  removing: string | null;
  /** How many the last cleaning removed, kept until the next reading. */
  removed: number | null;
  problem: AgentError | null;
  /** Where the capture on screen was last written, until the viewer moves on. */
  saved: string | null;
  /** What refused the last save, shown in the viewer until the next gesture. */
  saveProblem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  readThumbnail: (serverId: string, shot: Shot) => Promise<void>;
  show: (serverId: string, shot: Shot) => Promise<void>;
  /** The capture before or after the one shown, in the list's order. */
  step: (serverId: string, direction: -1 | 1) => Promise<void>;
  hide: () => void;
  /**
   * The capture on screen, written where the save dialog points. The bytes
   * are the ones already shown; the path is the dialog's, handed back as is.
   */
  save: () => Promise<void>;
  clean: (serverId: string) => Promise<void>;
  remove: (serverId: string, path: string) => Promise<void>;
  openGallery: (serverId: string) => Promise<void>;
  forget: () => void;
}

/** What the app says when the bytes do not match the receipt the agent gave. */
function broken(): AgentError {
  return {
    code: "internal",
    fix: translate()("shots.brokenFix"),
    message: translate()("shots.brokenMessage"),
  };
}

type Read =
  | { ok: true; blob: Blob; mediaType: ShotMediaType }
  | { ok: false; error: AgentError };

/**
 * The bytes of one capture, read over the channel the app already holds.
 *
 * They arrive on `shot` events and the answer says how many there were and
 * what they hash to: what comes out is either the whole capture or the reason
 * it is not showing one. Nothing is downloaded, nothing is opened in a
 * browser, and no port of the server is brought over.
 */
async function readShot(serverId: string, shot: Shot): Promise<Read> {
  const chunks = new Map<number, string>();

  const answer = (await window.pupitre.agentStream(
    serverId,
    "shots.read",
    { path: shot.path },
    (event: Event) => {
      const chunk = ShotEventSchema.safeParse(event);

      if (chunk.success) {
        chunks.set(chunk.data.seq, chunk.data.bytes);
      }
    }
  )) as AgentResponse<ShotsReadResult>;

  if (!answer.ok) {
    return { error: answer.error, ok: false };
  }

  const bytes = await shotBytes(chunks, answer.result);

  if (!bytes) {
    return { error: broken(), ok: false };
  }

  return {
    blob: new Blob([bytes], { type: answer.result.media_type }),
    mediaType: answer.result.media_type,
    ok: true,
  };
}

function revokeAll(thumbnails: Record<string, ThumbnailState>): void {
  for (const thumbnail of Object.values(thumbnails)) {
    if (thumbnail.status === "ready") {
      URL.revokeObjectURL(thumbnail.url);
    }
  }
}

export const useShots = create<ShotsStore>((set, get) => ({
  cleaning: false,
  gallery: null,
  problem: null,
  removed: null,
  removing: null,
  saveProblem: null,
  saved: null,
  state: { status: "idle" },
  thumbnails: {},
  view: { status: "idle" },

  async read(serverId) {
    const current = get().state;

    if (current.status === "idle" || current.serverId !== serverId) {
      revokeAll(get().thumbnails);
      set({
        gallery: null,
        state: { serverId, status: "loading" },
        thumbnails: {},
      });
    }

    const answer = await call<ShotsListResult>(serverId, "shots.list");

    if (!answer.ok) {
      set({
        removed: null,
        state: { error: answer.error, serverId, status: "failed" },
      });

      return;
    }

    // A thumbnail of a capture the list no longer names is let go of.
    const named = new Set(answer.result.shots.map((shot) => shot.path));
    const kept: Record<string, ThumbnailState> = {};

    for (const [path, thumbnail] of Object.entries(get().thumbnails)) {
      if (named.has(path)) {
        kept[path] = thumbnail;
      } else if (thumbnail.status === "ready") {
        URL.revokeObjectURL(thumbnail.url);
      }
    }

    set({
      removed: null,
      state: { serverId, shots: answer.result.shots, status: "read" },
      thumbnails: kept,
    });
  },

  /** Asked by the grid for a tile that reached the screen, once per capture. */
  async readThumbnail(serverId, shot) {
    if (get().thumbnails[shot.path]) {
      return;
    }

    set((state) => ({
      thumbnails: { ...state.thumbnails, [shot.path]: { status: "reading" } },
    }));

    const read = await readShot(serverId, shot);
    const held = get().thumbnails[shot.path];

    if (held?.status !== "reading") {
      return;
    }

    set((state) => ({
      thumbnails: {
        ...state.thumbnails,
        [shot.path]: read.ok
          ? {
              blob: read.blob,
              mediaType: read.mediaType,
              status: "ready",
              url: URL.createObjectURL(read.blob),
            }
          : { error: read.error, status: "failed" },
      },
    }));
  },

  async clean(serverId) {
    set({ cleaning: true, problem: null });

    const answer = await call<ShotsCleanResult>(serverId, "shots.clean");

    set({
      cleaning: false,
      problem: answer.ok ? null : answer.error,
    });

    await get().read(serverId);

    if (answer.ok) {
      set({ removed: answer.result.removed });
    }
  },

  /**
   * One capture, by the path the list gave: the agent looks it up in what it
   * listed and never resolves it on the disk. The viewer closes if it was on
   * that one, and the list is read again so the grid says what is left.
   */
  async remove(serverId, path) {
    set({ problem: null, removing: path });

    const answer = await call<ShotsCleanResult>(serverId, "shots.clean", {
      path,
    });

    const { view } = get();

    if (answer.ok && view.status !== "idle" && view.shot.path === path) {
      get().hide();
    }

    set({ problem: answer.ok ? null : answer.error, removing: null });

    await get().read(serverId);

    if (answer.ok) {
      set({ removed: answer.result.removed });
    }
  },

  // The address is the server's own: the app never builds one.
  async openGallery(serverId) {
    const answer = await call<ShotsUrlResult>(serverId, "shots.url");

    if (!answer.ok) {
      set({ problem: answer.error });

      return;
    }

    set({ gallery: answer.result.url, problem: null });
    await window.pupitre.openUrl(answer.result.url);
  },

  /**
   * The image itself. A thumbnail already read is the same bytes, so the
   * viewer opens on it at once rather than asking the channel a second time.
   */
  async show(serverId, shot) {
    get().hide();
    set({ saveProblem: null, saved: null, view: { shot, status: "reading" } });

    const thumbnail = get().thumbnails[shot.path];
    const read: Read =
      thumbnail?.status === "ready"
        ? { blob: thumbnail.blob, mediaType: thumbnail.mediaType, ok: true }
        : await readShot(serverId, shot);
    const size = read.ok ? await shotSize(read.blob) : null;

    // Everything asynchronous is behind us: a viewer closed or moved on while
    // the bytes or their size were being read is not painted over.
    const current = get().view;

    if (current.status !== "reading" || current.shot.path !== shot.path) {
      return;
    }

    if (!read.ok) {
      set({ view: { error: read.error, shot, status: "failed" } });

      return;
    }

    set({
      view: {
        blob: read.blob,
        mediaType: read.mediaType,
        shot,
        size,
        status: "shown",
        url: URL.createObjectURL(read.blob),
      },
    });
  },

  async step(serverId, direction) {
    const { state, view } = get();

    if (state.status !== "read" || view.status === "idle") {
      return;
    }

    const at = state.shots.findIndex((shot) => shot.path === view.shot.path);
    const next = state.shots[at + direction];

    if (at !== -1 && next) {
      await get().show(serverId, next);
    }
  },

  hide() {
    const { view } = get();

    if (view.status === "shown") {
      URL.revokeObjectURL(view.url);
    }

    set({ saveProblem: null, saved: null, view: { status: "idle" } });
  },

  async save() {
    const { view } = get();

    if (view.status !== "shown") {
      return;
    }

    const path = await window.pupitre.pickSavePath(view.shot.name);

    if (path === null) {
      return;
    }

    const bytes = new Uint8Array(await view.blob.arrayBuffer());
    const answer = await window.pupitre.saveShot(path, bytes);

    // The viewer may have moved on while the dialog was open: what it shows
    // now is not what was written, and the receipt would name another file.
    if (get().view !== view) {
      return;
    }

    set(
      answer.ok
        ? { saveProblem: null, saved: answer.result.path }
        : { saveProblem: answer.error, saved: null }
    );
  },

  forget() {
    get().hide();
    revokeAll(get().thumbnails);
    set({
      cleaning: false,
      gallery: null,
      problem: null,
      removed: null,
      removing: null,
      saveProblem: null,
      saved: null,
      state: { status: "idle" },
      thumbnails: {},
    });
  },
}));

/** The captures of a list, grouped by the day folder the agent files them under. */
export function shotsByDay(
  shots: readonly Shot[]
): readonly { day: string; shots: Shot[] }[] {
  const groups = new Map<string, Shot[]>();

  for (const shot of shots) {
    const day = shotDay(shot);
    const held = groups.get(day);

    if (held) {
      held.push(shot);
    } else {
      groups.set(day, [shot]);
    }
  }

  return [...groups].map(([day, held]) => ({ day, shots: held }));
}

const DAY = /^(\d{4}-\d{2}-\d{2})\//;

/** The day folder of a capture's path, else the date the agent gave for it. */
export function shotDay(shot: Shot): string {
  const fromPath = DAY.exec(shot.path)?.[1];

  return fromPath ?? shot.created_at.slice(0, 10);
}
