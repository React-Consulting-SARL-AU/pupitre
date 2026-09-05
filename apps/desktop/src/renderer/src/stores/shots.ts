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
      mediaType: ShotMediaType;
      size: ShotSize | null;
    }
  | { status: "failed"; shot: Shot; error: AgentError };

export type ShotsState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; shots: Shot[] }
  | { status: "failed"; serverId: string; error: AgentError };

interface ShotsStore {
  state: ShotsState;
  view: ShotView;
  /** The address the server serves the gallery at, once it has said. */
  gallery: string | null;
  cleaning: boolean;
  /** How many the last cleaning removed, kept until the next reading. */
  removed: number | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  show: (serverId: string, shot: Shot) => Promise<void>;
  hide: () => void;
  clean: (serverId: string) => Promise<void>;
  openGallery: (serverId: string) => Promise<void>;
  forget: () => void;
}

function call<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1]
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd) as Promise<AgentResponse<T>>;
}

/** What the app says when the bytes do not match the receipt the agent gave. */
function broken(): AgentError {
  return {
    code: "internal",
    fix: translate()("shots.brokenFix"),
    message: translate()("shots.brokenMessage"),
  };
}

export const useShots = create<ShotsStore>((set, get) => ({
  cleaning: false,
  gallery: null,
  problem: null,
  removed: null,
  state: { status: "idle" },
  view: { status: "idle" },

  async read(serverId) {
    const current = get().state;

    if (current.status === "idle" || current.serverId !== serverId) {
      set({ gallery: null, state: { serverId, status: "loading" } });
    }

    const answer = await call<ShotsListResult>(serverId, "shots.list");

    set({
      removed: null,
      state: answer.ok
        ? { serverId, shots: answer.result.shots, status: "read" }
        : { error: answer.error, serverId, status: "failed" },
    });
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
   * The image itself, read over the channel the app already holds.
   *
   * The bytes arrive on `shot` events and the answer says how many there were
   * and what they hash to: what the screen gets is either the whole capture or
   * the reason it is not showing one. Nothing is downloaded, nothing is opened
   * in a browser, and no port of the server is brought over.
   */
  async show(serverId, shot) {
    get().hide();
    set({ view: { shot, status: "reading" } });

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

    const current = get().view;

    if (current.status !== "reading" || current.shot.path !== shot.path) {
      return;
    }

    if (!answer.ok) {
      set({ view: { error: answer.error, shot, status: "failed" } });

      return;
    }

    const bytes = await shotBytes(chunks, answer.result);

    if (!bytes) {
      set({ view: { error: broken(), shot, status: "failed" } });

      return;
    }

    const blob = new Blob([bytes], { type: answer.result.media_type });

    set({
      view: {
        mediaType: answer.result.media_type,
        shot,
        size: await shotSize(blob),
        status: "shown",
        url: URL.createObjectURL(blob),
      },
    });
  },

  hide() {
    const { view } = get();

    if (view.status === "shown") {
      URL.revokeObjectURL(view.url);
    }

    set({ view: { status: "idle" } });
  },

  forget() {
    get().hide();
    set({
      cleaning: false,
      gallery: null,
      problem: null,
      removed: null,
      state: { status: "idle" },
    });
  },
}));
