import type { AgentError } from "@shared/agent";
import { settled, type Transfer, type TransferList } from "@shared/transfers";
import { create } from "zustand";

/**
 * The transfers, as the main process tells them.
 *
 * The list is the main process's and comes whole with every change: this
 * store keeps the latest revision, drops what arrived out of order, and asks
 * for what a gesture needs — a dialog opened over there, a path the user
 * pointed at, a transfer started on it. A transfer that finished leaves the
 * list on its own after a moment, or on a click.
 */

/** How long a finished transfer stays on screen before leaving on its own. */
export const LINGER_MS = 6000;

interface TransfersStore {
  transfers: Transfer[];
  revision: number;
  problem: AgentError | null;

  read: () => Promise<void>;
  /** Starts listening to the main process; answers the way to stop. */
  follow: () => () => void;
  /** Sends paths a dialog or a drop designated; answers the transfers started. */
  upload: (
    serverId: string,
    remoteDir: string,
    paths: readonly string[]
  ) => Promise<Transfer[]>;
  /** Opens the dialog, then sends what was chosen into the folder. */
  pickAndUpload: (serverId: string, remoteDir: string) => Promise<number>;
  /** Sends what was dropped on the window into the folder. */
  dropAndUpload: (
    serverId: string,
    remoteDir: string,
    files: Iterable<File>
  ) => Promise<number>;
  /** Asks where to save, then brings the file or folder to this computer. */
  pickAndDownload: (
    serverId: string,
    remotePath: string,
    kind: "file" | "dir"
  ) => Promise<boolean>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissProblem: () => void;
  forget: () => void;
}

function nameOf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export const useTransfers = create<TransfersStore>((set, get) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function forgetLater(transfer: Transfer): void {
    if (transfer.status !== "done" || timers.has(transfer.id)) {
      return;
    }

    timers.set(
      transfer.id,
      setTimeout(() => {
        timers.delete(transfer.id);
        get().dismiss(transfer.id);
      }, LINGER_MS)
    );
  }

  /** The newer list wins; an older one that arrived late is dropped. */
  function take(list: TransferList): void {
    if (list.revision <= get().revision) {
      return;
    }

    set({ revision: list.revision, transfers: list.transfers });

    for (const transfer of list.transfers) {
      forgetLater(transfer);
    }

    for (const [id, timer] of timers) {
      const kept = list.transfers.find((one) => one.id === id);

      if (!(kept && settled(kept))) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }
  }

  async function started(
    answer: Promise<
      { ok: true; result: TransferList } | { ok: false; error: AgentError }
    >
  ): Promise<Transfer[]> {
    const before = new Set(get().transfers.map((one) => one.id));
    const outcome = await answer;

    if (!outcome.ok) {
      set({ problem: outcome.error });

      return [];
    }

    take(outcome.result);

    return outcome.result.transfers.filter((one) => !before.has(one.id));
  }

  return {
    problem: null,
    revision: 0,
    transfers: [],

    async read() {
      take(await window.pupitre.transfers());
    },

    follow() {
      const stop = window.pupitre.onTransfers(take);

      get().read();

      return stop;
    },

    upload(serverId, remoteDir, paths) {
      if (paths.length === 0) {
        return Promise.resolve([]);
      }

      set({ problem: null });

      return started(window.pupitre.startUpload(serverId, remoteDir, paths));
    },

    async pickAndUpload(serverId, remoteDir) {
      const paths = await window.pupitre.pickUploadPaths();
      const fresh = await get().upload(serverId, remoteDir, paths);

      return fresh.length;
    },

    async dropAndUpload(serverId, remoteDir, files) {
      const paths: string[] = [];

      for (const file of files) {
        const path = await window.pupitre.pathOfDroppedFile(file);

        if (path) {
          paths.push(path);
        }
      }

      const fresh = await get().upload(serverId, remoteDir, paths);

      return fresh.length;
    },

    async pickAndDownload(serverId, remotePath, kind) {
      const target =
        kind === "dir"
          ? await window.pupitre.pickFolder()
          : await window.pupitre.pickSavePath(nameOf(remotePath));

      if (target === null) {
        return false;
      }

      set({ problem: null });

      const fresh = await started(
        window.pupitre.startDownload(serverId, remotePath, target)
      );

      return fresh.length > 0;
    },

    async pause(id) {
      take(await window.pupitre.pauseTransfer(id));
    },

    async resume(id) {
      take(await window.pupitre.resumeTransfer(id));
    },

    async cancel(id) {
      take(await window.pupitre.cancelTransfer(id));
    },

    async dismiss(id) {
      const timer = timers.get(id);

      if (timer) {
        clearTimeout(timer);
        timers.delete(id);
      }

      take(await window.pupitre.dismissTransfer(id));
    },

    dismissProblem() {
      set({ problem: null });
    },

    forget() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }

      timers.clear();
      set({ problem: null, revision: 0, transfers: [] });
    },
  };
});
