import type {
  ProjectBranchesResult,
  ProjectDiffResult,
  ProjectEnvResult,
  ProjectGitStatusResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

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

export type EnvState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; env: ProjectEnvResult }
  | { status: "failed"; error: AgentError };

export type DiffState =
  | { status: "idle" }
  | { status: "reading"; path: string }
  | { status: "read"; path: string; diff: ProjectDiffResult }
  | { status: "failed"; path: string; error: AgentError };

interface ProjectStore {
  /** Answers for any other project are dropped, so a slow read never paints the one now open. */
  name: string | null;
  git: GitState;
  branches: BranchState;
  tree: TreeState;
  diff: DiffState;
  env: EnvState;
  switching: boolean;
  problem: AgentError | null;

  open: (serverId: string, name: string) => Promise<void>;
  readGit: (serverId: string, name: string) => Promise<void>;
  readBranches: (serverId: string, name: string) => Promise<void>;
  readTree: (serverId: string, name: string) => Promise<void>;
  readDiff: (serverId: string, name: string, path: string) => Promise<void>;
  /** `force` makes the agent rewrite `.env.local`. */
  readEnv: (serverId: string, name: string, force?: boolean) => Promise<void>;
  checkout: (serverId: string, name: string, branch: string) => Promise<void>;
  sync: (serverId: string, name: string) => Promise<void>;
  clearDiff: () => void;
  close: () => void;
}

const EMPTY = {
  branches: { status: "idle" } as BranchState,
  diff: { status: "idle" } as DiffState,
  env: { status: "idle" } as EnvState,
  git: { status: "idle" } as GitState,
  problem: null,
  switching: false,
  tree: { status: "idle" } as TreeState,
};

export const useProject = create<ProjectStore>((set, get) => ({
  ...EMPTY,
  name: null,

  // git_status queries the remote over the network: read on open and on demand, never polled.
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

    if (get().name !== name) {
      return;
    }

    set({
      git: answer.ok
        ? { at: Date.now(), git: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async readBranches(serverId, name) {
    set({ branches: { status: "reading" } });

    const answer = await window.pupitre.projectBranches(serverId, name);

    if (get().name !== name) {
      return;
    }

    set({
      branches: answer.ok
        ? { branches: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async readTree(serverId, name) {
    set({ tree: { status: "reading" } });

    const answer = await window.pupitre.projectWorkingTree(serverId, name);

    if (get().name !== name) {
      return;
    }

    set({
      tree: answer.ok
        ? { status: "read", tree: answer.result }
        : { error: answer.error, status: "failed" },
    });
  },

  async readDiff(serverId, name, path) {
    set({ diff: { path, status: "reading" } });

    const answer = await window.pupitre.projectDiff(serverId, name, path);

    if (get().name !== name) {
      return;
    }

    set({
      diff: answer.ok
        ? { diff: answer.result, path, status: "read" }
        : { error: answer.error, path, status: "failed" },
    });
  },

  async readEnv(serverId, name, force = false) {
    set({ env: { status: "reading" } });

    const answer = await window.pupitre.projectEnv(serverId, name, force);

    if (get().name !== name) {
      return;
    }

    set({
      env: answer.ok
        ? { env: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  // The new branch has its own lead on the remote, so git status is read again.
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
