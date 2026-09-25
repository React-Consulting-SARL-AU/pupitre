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
  gallery: string | null;
  cleaning: boolean;
  removing: string | null;
  removed: number | null;
  problem: AgentError | null;
  saved: string | null;
  saveProblem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  readThumbnail: (serverId: string, shot: Shot) => Promise<void>;
  show: (serverId: string, shot: Shot) => Promise<void>;
  step: (serverId: string, direction: -1 | 1) => Promise<void>;
  hide: () => void;
  save: () => Promise<void>;
  clean: (serverId: string) => Promise<void>;
  remove: (serverId: string, path: string) => Promise<void>;
  openGallery: (serverId: string) => Promise<void>;
  forget: () => void;
}

function corruptShotError(): AgentError {
  return {
    code: "internal",
    fix: translate()("shots.brokenFix"),
    message: translate()("shots.brokenMessage"),
  };
}

type Read =
  | { ok: true; blob: Blob; mediaType: ShotMediaType }
  | { ok: false; error: AgentError };

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
    return { error: corruptShotError(), ok: false };
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

function keepListedThumbnails(
  thumbnails: Record<string, ThumbnailState>,
  shots: readonly Shot[]
): Record<string, ThumbnailState> {
  const listed = new Set(shots.map((shot) => shot.path));
  const kept: Record<string, ThumbnailState> = {};

  for (const [path, thumbnail] of Object.entries(thumbnails)) {
    if (listed.has(path)) {
      kept[path] = thumbnail;
    } else if (thumbnail.status === "ready") {
      URL.revokeObjectURL(thumbnail.url);
    }
  }

  return kept;
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

    const kept = keepListedThumbnails(get().thumbnails, answer.result.shots);

    set({
      removed: null,
      state: { serverId, shots: answer.result.shots, status: "read" },
      thumbnails: kept,
    });
  },

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

  async openGallery(serverId) {
    const answer = await call<ShotsUrlResult>(serverId, "shots.url");

    if (!answer.ok) {
      set({ problem: answer.error });

      return;
    }

    set({ gallery: answer.result.url, problem: null });

    await window.pupitre.openUrl(answer.result.url);
  },

  async show(serverId, shot) {
    get().hide();
    set({ saveProblem: null, saved: null, view: { shot, status: "reading" } });

    const thumbnail = get().thumbnails[shot.path];
    const read: Read =
      thumbnail?.status === "ready"
        ? { blob: thumbnail.blob, mediaType: thumbnail.mediaType, ok: true }
        : await readShot(serverId, shot);
    const size = read.ok ? await shotSize(read.blob) : null;

    // The viewer may have closed or moved on while the bytes were read.
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

    // The viewer may have moved on while the dialog was open.
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

export function shotDay(shot: Shot): string {
  const fromPath = DAY.exec(shot.path)?.[1];

  return fromPath ?? shot.created_at.slice(0, 10);
}
