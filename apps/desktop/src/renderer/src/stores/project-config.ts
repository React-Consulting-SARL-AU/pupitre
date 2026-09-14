import type {
  ProjectPatch,
  ProjectUpdateParams,
} from "@pupitre/shared/agent-protocol/projects";
import type {
  PackageManager,
  Project,
} from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";
import {
  addedRow,
  type Held,
  heldBy,
  heldSubdomains,
  hostnamesOf,
  type PortRow,
  type RowProblem,
} from "../lib/project-ports";
import {
  addedProcess,
  followProcesses,
  type ProcessDraft,
  type ProcessProblem,
  processesFromProject,
  processesReady,
  processPatches,
  processProblem,
  rowProblems,
} from "../lib/project-processes";
import { useSnapshot } from "./snapshot";
import { useTunnel } from "./tunnel";

/**
 * The configuration of a declared project, reopened.
 *
 * It is the same form as the add, filled from the project the snapshot gave —
 * the branch, and each process with its command, its install line, its folder,
 * its ports and their names on the web — minus what cannot change without
 * removing the project: the source and the name. What it sends is the whole
 * list of processes, because the screen sends what it shows. A changed
 * command restarts its process, a name on the web taken out stops answering:
 * both are said before the button is pressed, not after.
 */

export interface ConfigDraft {
  branch: string;
  processes: ProcessDraft[];
}

export type ConfigState =
  | { status: "idle" }
  | { status: "saving"; name: string }
  | { status: "saved"; name: string; project: Project }
  | { status: "failed"; name: string; error: AgentError };

interface ProjectConfigStore {
  /** The project the draft was opened from, or nothing. */
  project: Project | null;
  draft: ConfigDraft;
  exposure: boolean;
  held: Held;
  run: ConfigState;

  open: (
    project: Project,
    others: readonly Project[],
    exposure: boolean
  ) => void;
  setBranch: (value: string) => void;
  setProcessId: (process: number, value: string) => void;
  setProcessDir: (process: number, value: string) => void;
  setProcessPkgmgr: (process: number, value: PackageManager) => void;
  setProcessCmd: (process: number, value: string) => void;
  setProcessInstall: (process: number, value: string) => void;
  setRowLabel: (process: number, row: number, value: string) => void;
  setRowPort: (process: number, row: number, value: number) => void;
  setRowPublish: (process: number, row: number, value: boolean) => void;
  setRowWeb: (process: number, row: number, value: string) => void;
  generateRowWeb: (process: number, row: number) => void;
  addRow: (process: number) => void;
  removeRow: (process: number, row: number) => void;
  addProcess: () => void;
  removeProcess: (process: number) => void;
  /** Sends the patch, syncs the exposure when a name changed, then reads the snapshot again. */
  save: (serverId: string) => Promise<void>;
  close: () => void;

  patch: () => ProjectPatch;
  processProblem: (process: number) => ProcessProblem | null;
  rowProblems: (process: number) => (RowProblem | null)[];
  ready: () => boolean;
  /** The processes whose command or folder differs from the project's: saving restarts those that run. */
  restarts: () => string[];
  /** The names on the web the project holds today and the draft no longer names: they stop answering. */
  dropped: () => string[];
  changed: () => boolean;
}

const EMPTY_DRAFT: ConfigDraft = { branch: "", processes: [] };

const NO_HELD: Held = { hostnames: [], ports: [] };

function atProcess(
  processes: readonly ProcessDraft[],
  index: number,
  change: Partial<ProcessDraft>
): ProcessDraft[] {
  return processes.map((current, at) =>
    at === index ? { ...current, ...change } : current
  );
}

function atRow(
  processes: readonly ProcessDraft[],
  index: number,
  row: number,
  change: Partial<PortRow>
): ProcessDraft[] {
  const current = processes[index];

  if (!current) {
    return [...processes];
  }

  return atProcess(processes, index, {
    rows: current.rows.map((held, at) =>
      at === row ? { ...held, ...change } : held
    ),
  });
}

function draftFrom(project: Project): ConfigDraft {
  return {
    branch: project.branch ?? "",
    processes: processesFromProject(project),
  };
}

export const useProjectConfig = create<ProjectConfigStore>((set, get) => {
  function edit(change: Partial<ConfigDraft>): void {
    set((state) => ({
      draft: { ...state.draft, ...change },
      run: state.run.status === "saving" ? state.run : { status: "idle" },
    }));
  }

  function editProcesses(processes: ProcessDraft[]): void {
    const { project, exposure, held } = get();

    edit({
      processes: followProcesses(
        processes,
        project?.name ?? "",
        exposure,
        heldSubdomains(held.hostnames)
      ),
    });
  }

  return {
    draft: EMPTY_DRAFT,
    exposure: false,
    held: NO_HELD,
    project: null,
    run: { status: "idle" },

    open(project, others, exposure) {
      set({
        draft: draftFrom(project),
        exposure,
        held: heldBy(others, project.name),
        project,
        run: { status: "idle" },
      });
    },

    setBranch(value) {
      edit({ branch: value });
    },

    setProcessId(process, value) {
      editProcesses(atProcess(get().draft.processes, process, { id: value }));
    },

    setProcessDir(process, value) {
      editProcesses(atProcess(get().draft.processes, process, { dir: value }));
    },

    setProcessPkgmgr(process, value) {
      editProcesses(
        atProcess(get().draft.processes, process, { pkgmgr: value })
      );
    },

    setProcessCmd(process, value) {
      editProcesses(
        atProcess(get().draft.processes, process, { cmd: value, ownCmd: true })
      );
    },

    setProcessInstall(process, value) {
      editProcesses(
        atProcess(get().draft.processes, process, { install: value })
      );
    },

    setRowLabel(process, row, value) {
      editProcesses(
        atRow(get().draft.processes, process, row, { label: value })
      );
    },

    setRowPort(process, row, value) {
      editProcesses(
        atRow(get().draft.processes, process, row, { port: value })
      );
    },

    setRowPublish(process, row, value) {
      editProcesses(
        atRow(get().draft.processes, process, row, { publish: value })
      );
    },

    setRowWeb(process, row, value) {
      editProcesses(
        atRow(get().draft.processes, process, row, { ownWeb: true, web: value })
      );
    },

    generateRowWeb(process, row) {
      editProcesses(
        atRow(get().draft.processes, process, row, {
          ownWeb: false,
          whole: false,
        })
      );
    },

    addRow(process) {
      const { draft, held, exposure } = get();
      const current = draft.processes[process];

      if (!current) {
        return;
      }

      editProcesses(
        atProcess(draft.processes, process, {
          rows: [...current.rows, addedRow(current.rows, held, exposure)],
        })
      );
    },

    removeRow(process, row) {
      const { draft } = get();
      const current = draft.processes[process];

      if (!current || row === 0 || current.rows.length <= 1) {
        return;
      }

      editProcesses(
        atProcess(draft.processes, process, {
          rows: current.rows.filter((_row, at) => at !== row),
        })
      );
    },

    addProcess() {
      const { draft, held, exposure } = get();

      editProcesses([
        ...draft.processes,
        addedProcess(draft.processes, held, exposure),
      ]);
    },

    /** A project always has a process: the last one cannot go. */
    removeProcess(process) {
      const { processes } = get().draft;

      if (processes.length <= 1) {
        return;
      }

      editProcesses(processes.filter((_process, at) => at !== process));
    },

    async save(serverId) {
      const { project } = get();

      if (!project) {
        return;
      }

      const params: ProjectUpdateParams = {
        name: project.name,
        patch: get().patch(),
      };

      set({ run: { name: project.name, status: "saving" } });

      const answer = await window.pupitre.updateProject(serverId, params);

      if (!answer.ok) {
        set({
          run: { error: answer.error, name: project.name, status: "failed" },
        });

        return;
      }

      const published = hostnamesOf(answer.result).length > 0;

      if (get().exposure && (published || get().dropped().length > 0)) {
        await useTunnel.getState().sync(serverId);
      }

      const refused = useTunnel.getState().problem;

      if (refused) {
        set({ run: { error: refused, name: project.name, status: "failed" } });

        return;
      }

      await useSnapshot.getState().read(serverId);

      set({
        draft: draftFrom(answer.result),
        project: answer.result,
        run: { name: project.name, project: answer.result, status: "saved" },
      });
    },

    close() {
      set({
        draft: EMPTY_DRAFT,
        exposure: false,
        held: NO_HELD,
        project: null,
        run: { status: "idle" },
      });
    },

    /**
     * The whole list of processes, and the branch when it differs.
     *
     * The branch travels only when set — the registry keeps a branch or none,
     * and an empty field means "leave it".
     */
    patch() {
      const { draft, project, exposure } = get();
      const branch = draft.branch.trim();

      return {
        ...(project && branch && branch !== (project.branch ?? "")
          ? { branch }
          : {}),
        processes: processPatches(draft.processes, exposure),
      };
    },

    processProblem(process) {
      return processProblem(get().draft.processes, process);
    },

    rowProblems(process) {
      const { draft, held, exposure } = get();

      return rowProblems(draft.processes, process, held, exposure);
    },

    ready() {
      const { draft, held, exposure } = get();

      return processesReady(draft.processes, held, exposure) && get().changed();
    },

    restarts() {
      const { draft, project } = get();

      if (!project) {
        return [];
      }

      return draft.processes.flatMap((current) => {
        const declared = project.processes.find(
          (candidate) => candidate.id === current.id
        );
        const dir = current.dir.trim() || ".";

        return declared &&
          (declared.cmd !== current.cmd.trim() || declared.dir !== dir)
          ? [current.id]
          : [];
      });
    },

    dropped() {
      const { draft, project, exposure } = get();

      if (!project) {
        return [];
      }

      const kept = new Set(
        exposure
          ? draft.processes.flatMap((current) =>
              current.rows
                .filter((row) => row.publish && row.whole)
                .map((row) => row.web.trim())
            )
          : []
      );

      return hostnamesOf(project).filter((hostname) => !kept.has(hostname));
    },

    changed() {
      const { project, exposure } = get();

      if (!project) {
        return false;
      }

      const patch = get().patch();
      const same =
        JSON.stringify(patch.processes) ===
        JSON.stringify(processPatches(processesFromProject(project), exposure));

      return !same || Object.keys(patch).length > 1;
    },
  };
});
