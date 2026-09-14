import {
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type {
  ProcessDraft,
  ProcessProblem,
} from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import { X } from "lucide-react";
import { Field, fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import type { PortEdits } from "./project-port-row";
import { ProjectPorts } from "./project-ports";

/** What the processes section lets the reader change, process by process. */
export interface ProcessEdits {
  processId: (process: number, value: string) => void;
  processDir: (process: number, value: string) => void;
  processPkgmgr: (process: number, value: PackageManager) => void;
  processCmd: (process: number, value: string) => void;
  processInstall: (process: number, value: string) => void;
  rowLabel: (process: number, row: number, value: string) => void;
  rowPort: (process: number, row: number, value: number) => void;
  rowPublish: (process: number, row: number, value: boolean) => void;
  rowWeb: (process: number, row: number, value: string) => void;
  generateRowWeb: (process: number, row: number) => void;
  addRow: (process: number) => void;
  removeRow: (process: number, row: number) => void;
  addProcess: () => void;
  removeProcess: (process: number) => void;
}

/** The port edits of one process, as its table takes them. */
function portEditsOf(edit: ProcessEdits, process: number): PortEdits {
  return {
    addRow: () => edit.addRow(process),
    generateRowWeb: (row) => edit.generateRowWeb(process, row),
    removeRow: (row) => edit.removeRow(process, row),
    rowLabel: (row, value) => edit.rowLabel(process, row, value),
    rowPort: (row, value) => edit.rowPort(process, row, value),
    rowPublish: (row, value) => edit.rowPublish(process, row, value),
    rowWeb: (row, value) => edit.rowWeb(process, row, value),
  };
}

const PROBLEM_FIELD: Record<ProcessProblem, "id" | "dir" | "cmd"> = {
  cmd: "cmd",
  dir: "dir",
  id: "id",
  idTaken: "id",
};

const PROBLEM_TEXT: Record<
  ProcessProblem,
  | "projectAdd.processes.id"
  | "projectAdd.processes.idTaken"
  | "projectAdd.processes.dir"
  | "projectAdd.processes.cmd"
> = {
  cmd: "projectAdd.processes.cmd",
  dir: "projectAdd.processes.dir",
  id: "projectAdd.processes.id",
  idTaken: "projectAdd.processes.idTaken",
};

/**
 * One process of the project: what it is called, the folder it runs from,
 * the manager that installs it, the command that starts it, and its ports.
 *
 * The first one is the main process — its first port decides the project's
 * address — and it cannot go. A refused field says why beneath itself, tied
 * to the control it concerns.
 */
export function ProjectProcessCard({
  index,
  draft,
  problem,
  rowProblems,
  exposure,
  placeholder,
  removable,
  edit,
}: {
  index: number;
  draft: ProcessDraft;
  problem: ProcessProblem | null;
  rowProblems: readonly (RowProblem | null)[];
  exposure: Exposure | null;
  /** The project's name, which each name on the web is proposed from. */
  placeholder: string;
  removable: boolean;
  edit: ProcessEdits;
}) {
  const t = useTranslations();

  const scope = `project.processes.${index}`;
  const field = problem ? PROBLEM_FIELD[problem] : null;
  const problemText = problem ? t(PROBLEM_TEXT[problem]) : undefined;

  return (
    <li
      className="flex flex-col gap-5 rounded-md border border-line bg-sunken/40 p-4"
      data-process={index}
    >
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-3">
          <Field
            help={field === "id" ? undefined : t("projectAdd.processes.idHelp")}
            label={t("projectAdd.processes.idLabel")}
            name={`${scope}.id`}
            problem={field === "id" ? problemText : undefined}
            required
          >
            <input
              className={fieldControlClass}
              id={`${scope}.id`}
              onChange={(event) => edit.processId(index, event.target.value)}
              placeholder={t("projectAdd.processes.idPlaceholder")}
              value={draft.id}
            />
          </Field>

          <Field
            help={
              field === "dir" ? undefined : t("projectAdd.processes.dirHelp")
            }
            label={t("projectAdd.processes.dirLabel")}
            name={`${scope}.dir`}
            problem={field === "dir" ? problemText : undefined}
          >
            <input
              className={fieldControlClass}
              id={`${scope}.dir`}
              onChange={(event) => edit.processDir(index, event.target.value)}
              placeholder={t("projectAdd.processes.dirPlaceholder")}
              value={draft.dir}
            />
          </Field>

          <Field
            label={t("projectAdd.form.pkgmgrLabel")}
            name={`${scope}.pkgmgr`}
          >
            <select
              className={fieldControlClass}
              id={`${scope}.pkgmgr`}
              onChange={(event) =>
                edit.processPkgmgr(index, event.target.value as PackageManager)
              }
              value={draft.pkgmgr}
            >
              {PACKAGE_MANAGERS.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {removable ? (
          <IconButton
            icon={X}
            label={t("projectAdd.processes.remove", { id: draft.id })}
            onClick={() => edit.removeProcess(index)}
            variant="discreet"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          help={field === "cmd" ? undefined : t("projectAdd.form.cmdHelp")}
          label={t("projectAdd.form.cmdLabel")}
          name={`${scope}.cmd`}
          problem={field === "cmd" ? problemText : undefined}
          required
        >
          <input
            className={fieldControlClass}
            id={`${scope}.cmd`}
            onChange={(event) => edit.processCmd(index, event.target.value)}
            placeholder={t("projectAdd.form.cmdPlaceholder")}
            value={draft.cmd}
          />
        </Field>

        <Field
          help={t("project.config.installHelp", { pkgmgr: draft.pkgmgr })}
          label={t("project.overview.installCmd")}
          name={`${scope}.install`}
        >
          <input
            className={fieldControlClass}
            id={`${scope}.install`}
            onChange={(event) => edit.processInstall(index, event.target.value)}
            placeholder={t("project.overview.derivedFrom", {
              pkgmgr: draft.pkgmgr,
            })}
            value={draft.install}
          />
        </Field>
      </div>

      <ProjectPorts
        edit={portEditsOf(edit, index)}
        exposure={exposure}
        placeholder={placeholder}
        problems={rowProblems}
        rows={draft.rows}
        scope={`${scope}.ports`}
      />
    </li>
  );
}
