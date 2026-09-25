import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  FileEntry,
  FileMediaType,
  FsListResult,
  FsPathResult,
  FsReadResult,
  FsRemoveResult,
  FsStatResult,
  FsWriteResult,
} from "@pupitre/shared/agent-protocol/files";
import { FileEventSchema } from "@pupitre/shared/agent-protocol/files";
import { translate } from "@renderer/i18n/translate";
import { agentCall as call } from "@renderer/lib/agent-call";
import {
  base64Of,
  bytesOf,
  checkedBytes,
  textOf,
} from "@renderer/lib/file-bytes";
import {
  dirnameOf,
  type FileSort,
  isFileSort,
  parentOf,
  under,
  within,
} from "@renderer/lib/files";
import { readNavigation, writeNavigation } from "@renderer/lib/memory";
import { type ShotSize, shotSize } from "@renderer/lib/shot-image";
import type { AgentError, AgentResponse } from "@shared/agent";
import { create } from "zustand";

export type ListingState =
  | { status: "idle" }
  | { status: "reading"; path: string }
  | {
      status: "read";
      path: string;
      entries: readonly FileEntry[];
      truncated: boolean;
    }
  | { status: "failed"; path: string; error: AgentError };

export type PreviewState =
  | { status: "idle" }
  | { status: "reading"; path: string }
  | {
      status: "text";
      path: string;
      stat: FsStatResult;
      text: string;
      sha256: string;
    }
  | {
      status: "image";
      path: string;
      stat: FsStatResult;
      url: string;
      mediaType: FileMediaType;
      sha256: string;
      size: ShotSize | null;
    }
  | {
      status: "unreadable";
      path: string;
      stat: FsStatResult;
      // Null when the media type alone ruled the file out, before any read.
      error: AgentError | null;
    }
  | { status: "failed"; path: string; error: AgentError };

export type WriteState =
  | { status: "idle" }
  | { status: "writing" }
  | { status: "written"; at: number }
  // The file changed since it was read, so the agent refused the write.
  | { status: "stale"; error: AgentError }
  | { status: "failed"; error: AgentError };

export type PreviewView = "rendered" | "source";

/** A folder the agent refused to remove because it is not empty. */
export interface Removal {
  path: string;
  error: AgentError;
}

interface FilesStore {
  serverId: string | null;
  workRoot: string | null;
  // Relative to the agent's root.
  root: string | null;
  listing: ListingState;
  preview: PreviewState;
  view: PreviewView;
  write: WriteState;
  // Null while the buffer still matches the file.
  draft: string | null;
  // A gesture held back by an edited buffer; confirmLeave runs it.
  leaving: (() => void) | null;
  sort: FileSort;
  hidden: boolean;
  problem: AgentError | null;
  removal: Removal | null;

  // A null root binds the browser to the agent's root.
  open: (serverId: string, absoluteRoot: string | null) => Promise<void>;
  browse: (serverId: string, path: string) => Promise<void>;
  refresh: () => Promise<void>;
  show: (serverId: string, path: string) => Promise<void>;
  close: () => void;
  edit: (text: string) => void;
  setView: (view: PreviewView) => void;
  save: (serverId: string) => Promise<void>;
  reread: (serverId: string) => Promise<void>;
  confirmLeave: () => void;
  stay: () => void;
  rename: (
    serverId: string,
    path: string,
    name: string
  ) => Promise<AgentError | null>;
  remove: (
    serverId: string,
    path: string,
    recursive?: boolean
  ) => Promise<void>;
  makeFolder: (serverId: string, name: string) => Promise<AgentError | null>;
  makeFile: (serverId: string, name: string) => Promise<AgentError | null>;
  setSort: (sort: FileSort) => void;
  setHidden: (hidden: boolean) => void;
  dismiss: () => void;
  forget: () => void;
}

function broken(): AgentError {
  return {
    code: "internal",
    fix: translate()("files.brokenFix"),
    message: translate()("files.brokenMessage"),
  };
}

function outside(): AgentError {
  return {
    code: "bad_request",
    message: "",
    phrase: { id: "files.outsideRoot" },
  };
}

function shownPath(preview: PreviewState): string | null {
  return preview.status === "idle" ? null : preview.path;
}

function kindOf(listing: ListingState, path: string): FileEntry["kind"] | null {
  if (listing.status !== "read") {
    return null;
  }

  const entry = listing.entries.find(
    (candidate) => under(listing.path, candidate.name) === path
  );

  return entry?.kind ?? null;
}

function remembered(): { sort: FileSort; hidden: boolean } {
  const kept = readNavigation().files;

  return {
    hidden: kept?.hidden === true,
    sort: isFileSort(kept?.sort) ? kept.sort : "name",
  };
}

const EMPTY = {
  draft: null,
  leaving: null,
  listing: { status: "idle" } as ListingState,
  preview: { status: "idle" } as PreviewState,
  problem: null,
  removal: null,
  view: "rendered" as PreviewView,
  write: { status: "idle" } as WriteState,
};

type Parked = Pick<
  FilesStore,
  "draft" | "listing" | "preview" | "view" | "write"
>;

function parkingKey(serverId: string, root: string): string {
  return `${serverId}\u0000${root}`;
}

export const useFiles = create<FilesStore>((set, get) => {
  const parked = new Map<string, Parked>();

  function release(preview: PreviewState): void {
    if (preview.status === "image") {
      URL.revokeObjectURL(preview.url);
    }
  }

  // An edited buffer is parked per server and root, to be found again on return.
  function leave(state: FilesStore): void {
    if (
      state.draft === null ||
      state.serverId === null ||
      state.root === null
    ) {
      release(state.preview);

      return;
    }

    const { draft, listing, preview, view, write } = state;

    parked.set(parkingKey(state.serverId, state.root), {
      draft,
      listing,
      preview,
      view,
      write: write.status === "writing" ? { status: "idle" } : write,
    });
  }

  function unpark(serverId: string, root: string): Parked | null {
    const key = parkingKey(serverId, root);
    const kept = parked.get(key) ?? null;

    parked.delete(key);

    return kept;
  }

  function guarded(gesture: () => Promise<void>): Promise<void> {
    if (get().draft === null) {
      return gesture();
    }

    set({
      leaving: () => {
        gesture();
      },
    });

    return Promise.resolve();
  }

  async function workRootOf(serverId: string): Promise<string | null> {
    const current = get();

    if (current.serverId === serverId && current.workRoot !== null) {
      return current.workRoot;
    }

    const named = await window.pupitre.completions(serverId);

    if (!named.ok) {
      set({ listing: { error: named.error, path: "", status: "failed" } });

      return null;
    }

    const workRoot = dirnameOf(named.result.root);

    set({ serverId, workRoot });

    return workRoot;
  }

  // Lands only if the reader is still on this folder: a slow answer must not paint over another.
  async function list(serverId: string, path: string): Promise<void> {
    const answer = await call<FsListResult>(serverId, "fs.list", { path });

    const { listing } = get();

    if (listing.status === "idle" || listing.path !== path) {
      return;
    }

    set({
      listing: answer.ok
        ? {
            entries: answer.result.entries,
            path,
            status: "read",
            truncated: answer.result.truncated,
          }
        : { error: answer.error, path, status: "failed" },
    });
  }

  async function read(serverId: string, path: string, stat: FsStatResult) {
    const chunks = new Map<number, string>();

    const answer = (await window.pupitre.agentStream(
      serverId,
      "fs.read",
      { path },
      (event: Event) => {
        const chunk = FileEventSchema.safeParse(event);

        if (chunk.success) {
          chunks.set(chunk.data.seq, chunk.data.bytes);
        }
      }
    )) as AgentResponse<FsReadResult>;

    if (shownPath(get().preview) !== path) {
      return;
    }

    if (!answer.ok) {
      set({
        preview:
          answer.error.code === "bad_request"
            ? { error: answer.error, path, stat, status: "unreadable" }
            : { error: answer.error, path, status: "failed" },
      });

      return;
    }

    const bytes = await checkedBytes(chunks, answer.result);

    if (shownPath(get().preview) !== path) {
      return;
    }

    if (!bytes) {
      set({ preview: { error: broken(), path, status: "failed" } });

      return;
    }

    const { media_type: mediaType, sha256 } = answer.result;

    if (mediaType === "text/plain" || mediaType === "image/svg+xml") {
      set({
        preview: { path, sha256, stat, status: "text", text: textOf(bytes) },
      });

      return;
    }

    const blob = new Blob([bytes], { type: mediaType });
    const size = await shotSize(blob);

    if (shownPath(get().preview) !== path) {
      return;
    }

    set({
      preview: {
        mediaType,
        path,
        sha256,
        size,
        stat,
        status: "image",
        url: URL.createObjectURL(blob),
      },
    });
  }

  return {
    ...EMPTY,
    ...remembered(),
    root: null,
    serverId: null,
    workRoot: null,

    async open(serverId, absoluteRoot) {
      const current = get();

      if (current.serverId !== serverId) {
        leave(current);
        set({ ...EMPTY, root: null, serverId, workRoot: null });
      }

      const workRoot = await workRootOf(serverId);

      if (workRoot === null) {
        return;
      }

      const root = absoluteRoot === null ? "" : within(workRoot, absoluteRoot);

      if (root === null) {
        set({
          listing: { error: outside(), path: "", status: "failed" },
          root: null,
        });

        return;
      }

      if (get().root !== root) {
        leave(get());
        set({ ...EMPTY, ...unpark(serverId, root), root });
      }

      if (get().draft !== null) {
        await get().refresh();

        return;
      }

      await get().browse(serverId, root);
    },

    browse(serverId, path) {
      return guarded(async () => {
        set({ listing: { path, status: "reading" }, removal: null });
        await list(serverId, path);
      });
    },

    async refresh() {
      const { listing, serverId } = get();

      if (listing.status !== "idle" && serverId !== null) {
        await list(serverId, listing.path);
      }
    },

    show(serverId, path) {
      return guarded(async () => {
        release(get().preview);
        set({
          draft: null,
          preview: { path, status: "reading" },
          view: "rendered",
          write: { status: "idle" },
        });

        const stat = await call<FsStatResult>(serverId, "fs.stat", { path });

        if (shownPath(get().preview) !== path) {
          return;
        }

        if (!stat.ok) {
          set({ preview: { error: stat.error, path, status: "failed" } });

          return;
        }

        if (stat.result.kind === "dir") {
          set({ preview: { status: "idle" } });
          await get().browse(serverId, path);

          return;
        }

        if (stat.result.media_type === undefined) {
          set({
            preview: {
              error: null,
              path,
              stat: stat.result,
              status: "unreadable",
            },
          });

          return;
        }

        await read(serverId, path, stat.result);
      });
    },

    close() {
      if (get().draft !== null) {
        set({ leaving: () => get().close() });

        return;
      }

      release(get().preview);
      set({
        draft: null,
        leaving: null,
        preview: { status: "idle" },
        write: { status: "idle" },
      });
    },

    edit(text) {
      const { preview } = get();

      if (preview.status !== "text") {
        return;
      }

      set({ draft: text === preview.text ? null : text });
    },

    setView(view) {
      set({ view });
    },

    // The read's digest rides the write, so the agent refuses if the file changed in between.
    async save(serverId) {
      const { draft, preview } = get();

      if (preview.status !== "text" || draft === null) {
        return;
      }

      set({ write: { status: "writing" } });

      const answer = await call<FsWriteResult>(serverId, "fs.write", {
        content: base64Of(bytesOf(draft)),
        path: preview.path,
        sha256: preview.sha256,
      });

      const now = get();

      if (now.preview.status !== "text" || now.preview.path !== preview.path) {
        return;
      }

      if (answer.ok) {
        set({
          draft: now.draft === draft ? null : now.draft,
          preview: {
            ...now.preview,
            sha256: answer.result.sha256,
            stat: { ...now.preview.stat, size_bytes: answer.result.size_bytes },
            text: draft,
          },
          write: { at: Date.now(), status: "written" },
        });

        return;
      }

      const stat = await call<FsStatResult>(serverId, "fs.stat", {
        hash: true,
        path: preview.path,
      });

      const changed = stat.ok && stat.result.sha256 !== preview.sha256;

      set({
        write: changed
          ? { error: answer.error, status: "stale" }
          : { error: answer.error, status: "failed" },
      });
    },

    async reread(serverId) {
      const { preview } = get();

      if (preview.status === "idle") {
        return;
      }

      set({ draft: null, leaving: null });
      await get().show(serverId, preview.path);
    },

    confirmLeave() {
      const { leaving } = get();

      set({ draft: null, leaving: null, write: { status: "idle" } });
      leaving?.();
    },

    stay() {
      set({ leaving: null });
    },

    async rename(serverId, path, name) {
      set({ problem: null });

      const answer = await call<FsPathResult>(serverId, "fs.rename", {
        path,
        to: under(parentOf(path), name),
      });

      if (!answer.ok) {
        return answer.error;
      }

      const { preview } = get();

      if (preview.status !== "idle" && preview.path === path) {
        set({ preview: { ...preview, path: answer.result.path } });
      }

      await get().refresh();

      return null;
    },

    async remove(serverId, path, recursive = false) {
      set({ problem: null, removal: null });

      const answer = await call<FsRemoveResult>(serverId, "fs.remove", {
        path,
        ...(recursive ? { recursive } : {}),
      });

      if (!answer.ok) {
        const held = !recursive && kindOf(get().listing, path) === "dir";

        set(
          held
            ? { removal: { error: answer.error, path } }
            : { problem: answer.error }
        );

        return;
      }

      const { preview } = get();

      if (
        preview.status !== "idle" &&
        (preview.path === path || preview.path.startsWith(`${path}/`))
      ) {
        get().close();
      }

      await get().refresh();
    },

    async makeFolder(serverId, name) {
      const { listing } = get();

      if (listing.status === "idle") {
        return null;
      }

      set({ problem: null });

      const answer = await call<FsPathResult>(serverId, "fs.mkdir", {
        path: under(listing.path, name),
      });

      if (!answer.ok) {
        return answer.error;
      }

      await get().refresh();

      return null;
    },

    async makeFile(serverId, name) {
      const { listing } = get();

      if (listing.status === "idle") {
        return null;
      }

      set({ problem: null });

      const path = under(listing.path, name);

      const answer = await call<FsWriteResult>(serverId, "fs.write", {
        content: "",
        path,
      });

      if (!answer.ok) {
        return answer.error;
      }

      await get().refresh();

      if (get().draft === null) {
        await get().show(serverId, path);
        set({ view: "source" });
      }

      return null;
    },

    setSort(sort) {
      set({ sort });
      writeNavigation({ files: { hidden: get().hidden, sort } });
    },

    setHidden(hidden) {
      set({ hidden });
      writeNavigation({ files: { hidden, sort: get().sort } });
    },

    dismiss() {
      set({ problem: null, removal: null });
    },

    forget() {
      release(get().preview);
      parked.clear();
      set({ ...EMPTY, root: null, serverId: null, workRoot: null });
    },
  };
});
