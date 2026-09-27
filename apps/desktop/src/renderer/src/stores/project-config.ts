import type {
  ProjectPatch,
  ProjectUpdateParams,
} from "@pupitre/shared/agent-protocol/projects";
import type {
  PackageManager,
  Project,
  ProjectRuntimes,
} from "@pupitre/shared/agent-protocol/state";
import type { RuntimeTool } from "@pupitre/shared/catalog";
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
  type ProcessAccess,
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

export interface ConfigDraft {
  branch: string;
  boot: boolean;
  /** A tool left out runs at the machine's default version. */
  runtimes: ProjectRuntimes;
  processes: ProcessDraft[];
  protected: boolean;
}

export type ConfigState =
  | { status: "idle" }
  | { status: "saving"; name: string }
  // `sync`: the project is saved but the exposure refused to write its hostnames.
  | {
      status: "saved";
      name: string;
      project: Project;
      sync?: AgentError;
      warnings?: string[];
    }
  | { status: "failed"; name: string; error: AgentError };

interface ProjectConfigStore {
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
  setBoot: (value: boolean) => void;
  /** An empty version unpins the tool. */
  setRuntime: (tool: RuntimeTool, version: string) => void;
  setProcessId: (process: number, value: string) => void;
  setProcessDir: (process: number, value: string) => void;
  setProcessPkgmgr: (process: number, value: PackageManager) => void;
  setProcessCmd: (process: number, value: string) => void;
  setProcessInstall: (process: number, value: string) => void;
  setProtected: (value: boolean) => void;
  setProcessAccess: (process: number, value: ProcessAccess) => void;
  /** False for an agent that has no access gate: nothing about protection is sent to it. */
  gated: () => boolean;
  setRowLabel: (process: number, row: number, value: string) => void;
  setRowPort: (process: number, row: number, value: number) => void;
  setRowPublish: (process: number, row: number, value: boolean) => void;
  setRowWeb: (process: number, row: number, value: string) => void;
  generateRowWeb: (process: number, row: number) => void;
  addRow: (process: number) => void;
  removeRow: (process: number, row: number) => void;
  addProcess: () => void;
  removeProcess: (process: number) => void;
  save: (serverId: string) => Promise<void>;
  close: () => void;

  patch: () => ProjectPatch;
  processProblem: (process: number) => ProcessProblem | null;
  rowProblems: (process: number) => (RowProblem | null)[];
  ready: () => boolean;
  restarts: () => string[];
  dropped: () => string[];
  changed: () => boolean;
}

const EMPTY_DRAFT: ConfigDraft = {
  boot: false,
  branch: "",
  processes: [],
  protected: true,
  runtimes: {},
};

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
    boot: project.boot === true,
    branch: project.branch ?? "",
    processes: processesFromProject(project),
    protected: project.protected !== false,
    runtimes: { ...(project.runtimes ?? {}) },
  };
}

function sameRuntimes(left: ProjectRuntimes, right: ProjectRuntimes): boolean {
  const keys = Object.keys(left);

  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (tool) => left[tool as RuntimeTool] === right[tool as RuntimeTool]
    )
  );
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

    setBoot(value) {
      edit({ boot: value });
    },

    setRuntime(tool, version) {
      const { [tool]: _dropped, ...rest } = get().draft.runtimes;

      edit({ runtimes: version ? { ...rest, [tool]: version } : rest });
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

    setProtected(value) {
      edit({ protected: value });
    },

    setProcessAccess(process, value) {
      editProcesses(
        atProcess(get().draft.processes, process, { access: value })
      );
    },

    gated() {
      return get().project?.protected !== undefined;
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

    // A project always keeps at least one process.
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
      const synced =
        get().exposure && (published || get().dropped().length > 0);
      let refused: AgentError | null = null;

      if (synced) {
        await useTunnel.getState().sync(serverId);
        refused = useTunnel.getState().problem;
      }

      await useSnapshot.getState().read(serverId);

      set({
        draft: draftFrom(answer.result),
        project: answer.result,
        run: {
          name: project.name,
          project: answer.result,
          status: "saved",
          ...(refused ? { sync: refused } : {}),
          ...(answer.result.warnings?.length
            ? { warnings: answer.result.warnings }
            : {}),
        },
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

    // An empty branch field means "leave it", never "clear it".
    patch() {
      const { draft, project, exposure } = get();
      const branch = draft.branch.trim();

      return {
        ...(project && branch && branch !== (project.branch ?? "")
          ? { branch }
          : {}),
        ...(project && draft.boot !== (project.boot === true)
          ? { boot: draft.boot }
          : {}),
        ...(project && !sameRuntimes(draft.runtimes, project.runtimes ?? {})
          ? { runtimes: draft.runtimes }
          : {}),
        ...(project?.protected !== undefined &&
        draft.protected !== project.protected
          ? { protected: draft.protected }
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
