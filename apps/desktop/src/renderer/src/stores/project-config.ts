import type {
  ProjectPatch,
  ProjectUpdateParams,
} from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";
import {
  addedRow,
  followName,
  type Held,
  heldBy,
  heldSubdomains,
  hostnamesOf,
  type PortRow,
  type RowProblem,
  routePatches,
  rowProblem,
  rowsFromProject,
  rowsReady,
} from "../lib/project-ports";
import { useSnapshot } from "./snapshot";
import { useTunnel } from "./tunnel";

/**
 * The configuration of a declared project, reopened.
 *
 * It is the same form as the add, filled from the project the snapshot gave —
 * the command, the install line, the branch, the ports and their names on the
 * web — minus what cannot change without removing the project: the source and
 * the name. What it sends is a patch of what differs, and the whole list of
 * ports, because the screen sends what it shows. A changed command restarts
 * the project, a name on the web taken out stops answering: both are said
 * before the button is pressed, not after.
 */

export interface ConfigDraft {
  cmd: string;
  install: string;
  branch: string;
  rows: PortRow[];
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
  setCmd: (value: string) => void;
  setInstall: (value: string) => void;
  setBranch: (value: string) => void;
  setRowLabel: (index: number, value: string) => void;
  setRowPort: (index: number, value: number) => void;
  setRowPublish: (index: number, value: boolean) => void;
  setRowWeb: (index: number, value: string) => void;
  generateRowWeb: (index: number) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  /** Sends the patch, syncs the exposure when a name changed, then reads the snapshot again. */
  save: (serverId: string) => Promise<void>;
  close: () => void;

  patch: () => ProjectPatch;
  rowProblem: (index: number) => RowProblem | null;
  ready: () => boolean;
  /** True when the command differs from the project's: saving restarts it if it runs. */
  restarts: () => boolean;
  /** The names on the web the project holds today and the draft no longer names: they stop answering. */
  dropped: () => string[];
  changed: () => boolean;
}

const EMPTY_DRAFT: ConfigDraft = { branch: "", cmd: "", install: "", rows: [] };

const NO_HELD: Held = { hostnames: [], ports: [] };

function atRow(
  rows: readonly PortRow[],
  index: number,
  change: Partial<PortRow>
): PortRow[] {
  return rows.map((current, at) =>
    at === index ? { ...current, ...change } : current
  );
}

export const useProjectConfig = create<ProjectConfigStore>((set, get) => {
  function edit(change: Partial<ConfigDraft>): void {
    set((state) => ({
      draft: { ...state.draft, ...change },
      run: state.run.status === "saving" ? state.run : { status: "idle" },
    }));
  }

  function editRows(rows: PortRow[]): void {
    const { project, exposure, held } = get();

    edit({
      rows: followName(
        rows,
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
        draft: {
          branch: project.branch ?? "",
          cmd: project.cmd,
          install: project.install ?? "",
          rows: rowsFromProject(project),
        },
        exposure,
        held: heldBy(others, project.name),
        project,
        run: { status: "idle" },
      });
    },

    setCmd(value) {
      edit({ cmd: value });
    },

    setInstall(value) {
      edit({ install: value });
    },

    setBranch(value) {
      edit({ branch: value });
    },

    setRowLabel(index, value) {
      editRows(atRow(get().draft.rows, index, { label: value }));
    },

    setRowPort(index, value) {
      editRows(atRow(get().draft.rows, index, { port: value }));
    },

    setRowPublish(index, value) {
      editRows(atRow(get().draft.rows, index, { publish: value }));
    },

    setRowWeb(index, value) {
      editRows(atRow(get().draft.rows, index, { ownWeb: true, web: value }));
    },

    generateRowWeb(index) {
      editRows(atRow(get().draft.rows, index, { ownWeb: false, whole: false }));
    },

    addRow() {
      const { draft, held, exposure } = get();

      editRows([...draft.rows, addedRow(draft.rows, held, exposure)]);
    },

    removeRow(index) {
      const { rows } = get().draft;

      if (index === 0 || rows.length <= 1) {
        return;
      }

      editRows(rows.filter((_row, at) => at !== index));
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

      const published = answer.result.routes.some((route) => route.hostname);

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
        draft: {
          branch: answer.result.branch ?? "",
          cmd: answer.result.cmd,
          install: answer.result.install ?? "",
          rows: rowsFromProject(answer.result),
        },
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
     * What differs, and the whole list of ports.
     *
     * The install line travels even when empty, because empty is an answer:
     * the command goes back to the package manager. The branch does not — the
     * registry keeps a branch or none, and an empty field means "leave it".
     */
    patch() {
      const { draft, project, exposure } = get();
      const cmd = draft.cmd.trim();
      const install = draft.install.trim();
      const branch = draft.branch.trim();

      return {
        ...(project && cmd !== project.cmd ? { cmd } : {}),
        ...(project && install !== (project.install ?? "") ? { install } : {}),
        ...(project && branch && branch !== (project.branch ?? "")
          ? { branch }
          : {}),
        routes: routePatches(draft.rows, exposure),
      };
    },

    rowProblem(index) {
      const { draft, held, exposure } = get();

      return rowProblem(draft.rows, index, held, exposure);
    },

    ready() {
      const { draft, held, exposure } = get();

      return (
        draft.cmd.trim().length > 0 &&
        rowsReady(draft.rows, held, exposure) &&
        get().changed()
      );
    },

    restarts() {
      const { draft, project } = get();

      return project !== null && draft.cmd.trim() !== project.cmd;
    },

    dropped() {
      const { draft, project, exposure } = get();

      if (!project) {
        return [];
      }

      const kept = new Set(
        exposure
          ? draft.rows
              .filter((row) => row.publish && row.whole)
              .map((row) => row.web.trim())
          : []
      );

      return hostnamesOf(project).filter((hostname) => !kept.has(hostname));
    },

    changed() {
      const { project } = get();

      if (!project) {
        return false;
      }

      const patch = get().patch();
      const same =
        JSON.stringify(patch.routes) ===
        JSON.stringify(routePatches(rowsFromProject(project), get().exposure));

      return !same || Object.keys(patch).length > 1;
    },
  };
});
