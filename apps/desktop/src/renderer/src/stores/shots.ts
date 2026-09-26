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

// Project names start with a letter or a digit, so neither key can be a project's.
export const ALL_SHOTS = "*";
export const UNFILED = "_unfiled";

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
  address: ShotsUrlResult | null;
  folder: string;
  cleaning: boolean;
  removing: string | null;
  removed: number | null;
  problem: AgentError | null;
  saved: string | null;
  saveProblem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  choose: (folder: string) => void;
  readThumbnail: (serverId: string, shot: Shot) => Promise<void>;
  show: (serverId: string, shot: Shot) => Promise<void>;
  step: (serverId: string, direction: -1 | 1) => Promise<void>;
  hide: () => void;
  save: () => Promise<void>;
  clean: (serverId: string) => Promise<void>;
  remove: (serverId: string, path: string) => Promise<void>;
  openGallery: () => Promise<void>;
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

function listed(state: ShotsState): Shot[] {
  return state.status === "read" ? state.shots : [];
}

// The capture that takes the place of one about to go: the next in the folder, else the one before.
function neighbour(shots: readonly Shot[], path: string): Shot | null {
  const at = shots.findIndex((shot) => shot.path === path);

  if (at === -1) {
    return null;
  }

  return shots[at + 1] ?? shots[at - 1] ?? null;
}

export const useShots = create<ShotsStore>((set, get) => ({
  address: null,
  cleaning: false,
  folder: ALL_SHOTS,
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
        address: null,
        folder: ALL_SHOTS,
        state: { serverId, status: "loading" },
        thumbnails: {},
      });
    }

    const [answer, address] = await Promise.all([
      call<ShotsListResult>(serverId, "shots.list"),
      call<ShotsUrlResult>(serverId, "shots.url"),
    ]);

    if (!answer.ok) {
      set({
        removed: null,
        state: { error: answer.error, serverId, status: "failed" },
      });

      return;
    }

    const { shots } = answer.result;
    const { folder } = get();
    const kept = keepListedThumbnails(get().thumbnails, shots);

    set({
      address: address.ok ? address.result : null,
      folder:
        folder === ALL_SHOTS || shots.some((shot) => folderOf(shot) === folder)
          ? folder
          : ALL_SHOTS,
      removed: null,
      state: { serverId, shots, status: "read" },
      thumbnails: kept,
    });
  },

  choose(folder) {
    set({ folder });
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

    const { state, view, folder } = get();
    const shown = view.status !== "idle" && view.shot.path === path;
    const next = shown ? neighbour(shotsIn(listed(state), folder), path) : null;

    const answer = await call<ShotsCleanResult>(serverId, "shots.clean", {
      path,
    });

    set({ problem: answer.ok ? null : answer.error, removing: null });

    await get().read(serverId);

    if (answer.ok) {
      set({ removed: answer.result.removed });
    }

    if (!(answer.ok && shown)) {
      return;
    }

    if (next) {
      await get().show(serverId, next);
    } else {
      get().hide();
    }
  },

  async openGallery() {
    const { address } = get();

    if (address?.exposed) {
      await window.pupitre.openUrl(address.url);
    }
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
    const { state, view, folder } = get();

    if (view.status === "idle") {
      return;
    }

    const shots = shotsIn(listed(state), folder);
    const at = shots.findIndex((shot) => shot.path === view.shot.path);
    const next = shots[at + direction];

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
      address: null,
      cleaning: false,
      folder: ALL_SHOTS,
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

// An agent that did not sort captures yet names no project: its captures read as unfiled.
export function folderOf(shot: Shot): string {
  return shot.project ?? UNFILED;
}

export function shotsIn(shots: readonly Shot[], folder: string): Shot[] {
  return folder === ALL_SHOTS
    ? [...shots]
    : shots.filter((shot) => folderOf(shot) === folder);
}

export function shotFolders(
  shots: readonly Shot[]
): readonly { folder: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const shot of shots) {
    const folder = folderOf(shot);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }

  return [...counts]
    .map(([folder, count]) => ({ count, folder }))
    .sort((a, b) => {
      if (a.folder === UNFILED || b.folder === UNFILED) {
        return a.folder === UNFILED ? 1 : -1;
      }

      return a.folder.localeCompare(b.folder);
    });
}

export function publicAddress(
  address: ShotsUrlResult | null,
  shot: Shot
): string | null {
  if (!address?.exposed) {
    return null;
  }

  const path = shot.path.split("/").map(encodeURIComponent).join("/");

  return `${address.url}/${path}`;
}

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

const DAY = /(?:^|\/)(\d{4}-\d{2}-\d{2})\//;

export function shotDay(shot: Shot): string {
  const fromPath = DAY.exec(shot.path)?.[1];

  return fromPath ?? shot.created_at.slice(0, 10);
}
