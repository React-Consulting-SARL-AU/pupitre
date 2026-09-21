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

/**
 * The files of a server, one folder and one file at a time.
 *
 * Every path is relative to the root the agent holds, and the browser is bound
 * to one folder under it — a project's, or the root itself. Every read lands
 * only on the path it was asked for: a slow answer from a folder the reader
 * has since left would otherwise paint it over the one now open.
 *
 * A file that is read keeps its digest, and the write that follows carries it:
 * the agent refuses when the file changed in between, and the refusal is shown
 * as what it is — never merged, never overwritten blind.
 */

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

/** What the right pane shows: one file, read whole, or refused before the read. */
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
      /** The agent's refusal when it was asked; nothing when the type alone said no. */
      error: AgentError | null;
    }
  | { status: "failed"; path: string; error: AgentError };

export type WriteState =
  | { status: "idle" }
  | { status: "writing" }
  | { status: "written"; at: number }
  /** The file is not the one that was read any more: the agent refused, and so does the app. */
  | { status: "stale"; error: AgentError }
  | { status: "failed"; error: AgentError };

/** How a file that has a rendered form is looked at: drawn, or as the text it is. */
export type PreviewView = "rendered" | "source";

/** A folder the agent would not remove because it holds something. */
export interface Removal {
  path: string;
  error: AgentError;
}

interface FilesStore {
  serverId: string | null;
  /** Where the agent's root sits on the machine, read once per server. */
  workRoot: string | null;
  /** The folder the browser is bound to, relative to the agent's root. */
  root: string | null;
  listing: ListingState;
  preview: PreviewState;
  /** Rendered anew for every file opened; the source stays until the next. */
  view: PreviewView;
  write: WriteState;
  /** The buffer as edited, or nothing while it still reads as the file. */
  draft: string | null;
  /** A gesture held back because the buffer is edited; confirming runs it. */
  leaving: (() => void) | null;
  sort: FileSort;
  hidden: boolean;
  problem: AgentError | null;
  removal: Removal | null;

  /** Binds the browser to an absolute folder of the server, or to the root when none is named. */
  open: (serverId: string, absoluteRoot: string | null) => Promise<void>;
  browse: (serverId: string, path: string) => Promise<void>;
  refresh: () => Promise<void>;
  show: (serverId: string, path: string) => Promise<void>;
  close: () => void;
  edit: (text: string) => void;
  setView: (view: PreviewView) => void;
  save: (serverId: string) => Promise<void>;
  /** Reads the open file again and drops the buffer, which is what a stale write leaves to do. */
  reread: (serverId: string) => Promise<void>;
  confirmLeave: () => void;
  stay: () => void;
  rename: (serverId: string, path: string, name: string) => Promise<void>;
  remove: (
    serverId: string,
    path: string,
    recursive?: boolean
  ) => Promise<void>;
  makeFolder: (serverId: string, name: string) => Promise<void>;
  /** Makes an empty file in the folder on screen and opens it as code to write, unless a buffer is being edited. */
  makeFile: (serverId: string, name: string) => Promise<void>;
  setSort: (sort: FileSort) => void;
  setHidden: (hidden: boolean) => void;
  dismiss: () => void;
  forget: () => void;
}

/** What the app says when the bytes do not match the receipt the agent gave. */
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

export const useFiles = create<FilesStore>((set, get) => {
  function release(preview: PreviewState): void {
    if (preview.status === "image") {
      URL.revokeObjectURL(preview.url);
    }
  }

  /** A gesture that would drop an edited buffer waits for the reader's word. */
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

  /** Lists a folder and lands only on it: the reader may have left for another. */
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
        release(current.preview);
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
        release(get().preview);
        set({ ...EMPTY, root });
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
        set({ problem: answer.error });

        return;
      }

      const { preview } = get();

      if (preview.status !== "idle" && preview.path === path) {
        set({ preview: { ...preview, path: answer.result.path } });
      }

      await get().refresh();
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
        return;
      }

      set({ problem: null });

      const answer = await call<FsPathResult>(serverId, "fs.mkdir", {
        path: under(listing.path, name),
      });

      if (!answer.ok) {
        set({ problem: answer.error });

        return;
      }

      await get().refresh();
    },

    async makeFile(serverId, name) {
      const { listing } = get();

      if (listing.status === "idle") {
        return;
      }

      set({ problem: null });

      const path = under(listing.path, name);

      const answer = await call<FsWriteResult>(serverId, "fs.write", {
        content: "",
        path,
      });

      if (!answer.ok) {
        set({ problem: answer.error });

        return;
      }

      await get().refresh();

      if (get().draft === null) {
        await get().show(serverId, path);
        set({ view: "source" });
      }
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
      set({ ...EMPTY, root: null, serverId: null, workRoot: null });
    },
  };
});
