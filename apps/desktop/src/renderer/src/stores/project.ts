import type {
  ProjectBranchesResult,
  ProjectDiffResult,
  ProjectGitStatusResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * What an open project costs to know, and when each part is worth paying for.
 *
 * The branches and the working tree are local reads on the server: they are
 * asked whenever the project opens or a tab does. `project.git_status` is not —
 * it queries the remote repository over the network — so it is asked once, on
 * opening, and then only when the reader asks again. It never sits in a loop.
 */

export type GitState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; git: ProjectGitStatusResult; at: number }
  | { status: "failed"; error: AgentError };

export type BranchState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; branches: ProjectBranchesResult }
  | { status: "failed"; error: AgentError };

export type TreeState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; tree: ProjectWorkingTreeResult }
  | { status: "failed"; error: AgentError };

export type DiffState =
  | { status: "idle" }
  | { status: "reading"; path: string }
  | { status: "read"; path: string; diff: ProjectDiffResult }
  | { status: "failed"; path: string; error: AgentError };

interface ProjectStore {
  /** The project every piece of state below belongs to. */
  name: string | null;
  git: GitState;
  branches: BranchState;
  tree: TreeState;
  diff: DiffState;
  /** True while a branch is being taken: the selector waits for the answer. */
  switching: boolean;
  problem: AgentError | null;

  open: (serverId: string, name: string) => Promise<void>;
  readGit: (serverId: string, name: string) => Promise<void>;
  readBranches: (serverId: string, name: string) => Promise<void>;
  readTree: (serverId: string, name: string) => Promise<void>;
  readDiff: (serverId: string, name: string, path: string) => Promise<void>;
  checkout: (serverId: string, name: string, branch: string) => Promise<void>;
  sync: (serverId: string, name: string) => Promise<void>;
  clearDiff: () => void;
  close: () => void;
}

const EMPTY = {
  branches: { status: "idle" } as BranchState,
  diff: { status: "idle" } as DiffState,
  git: { status: "idle" } as GitState,
  problem: null,
  switching: false,
  tree: { status: "idle" } as TreeState,
};

export const useProject = create<ProjectStore>((set, get) => ({
  ...EMPTY,
  name: null,

  /** Opening a project pays for the network read, once. */
  async open(serverId, name) {
    if (get().name !== name) {
      set({ ...EMPTY, name });
    }

    await Promise.all([
      get().readBranches(serverId, name),
      get().readGit(serverId, name),
    ]);
  },

  async readGit(serverId, name) {
    set({ git: { status: "reading" } });

    const answer = await window.pupitre.projectGitStatus(serverId, name);

    set({
      git: answer.ok
        ? { at: Date.now(), git: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async readBranches(serverId, name) {
    set({ branches: { status: "reading" } });

    const answer = await window.pupitre.projectBranches(serverId, name);

    set({
      branches: answer.ok
        ? { branches: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async readTree(serverId, name) {
    set({ tree: { status: "reading" } });

    const answer = await window.pupitre.projectWorkingTree(serverId, name);

    set({
      tree: answer.ok
        ? { status: "read", tree: answer.result }
        : { error: answer.error, status: "failed" },
    });
  },

  async readDiff(serverId, name, path) {
    set({ diff: { path, status: "reading" } });

    const answer = await window.pupitre.projectDiff(serverId, name, path);

    set({
      diff: answer.ok
        ? { diff: answer.result, path, status: "read" }
        : { error: answer.error, path, status: "failed" },
    });
  },

  /**
   * The branch just taken has a lead of its own: the one we were looking at
   * says nothing about it any more, and this is the moment you want to know
   * whether there is anything to pull before restarting.
   */
  async checkout(serverId, name, branch) {
    set({ problem: null, switching: true });

    const answer = await window.pupitre.checkoutProject(serverId, name, branch);

    set({ problem: answer.ok ? null : answer.error, switching: false });

    if (answer.ok) {
      await get().readBranches(serverId, name);
      await get().readGit(serverId, name);
    }
  },

  async sync(serverId, name) {
    set({ problem: null });

    const answer = await window.pupitre.syncProject(serverId, name);

    set({ problem: answer.ok ? null : answer.error });

    if (answer.ok) {
      await get().readGit(serverId, name);
    }
  },

  clearDiff() {
    set({ diff: { status: "idle" } });
  },

  close() {
    set({ ...EMPTY, name: null });
  },
}));
