import { Collapsible } from "@base-ui-components/react/collapsible";
import {
  PACKAGE_MANAGERS,
  type PackageManager,
  PORT_SPAN_MAX,
} from "@pupitre/shared/agent-protocol/state";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import {
  type ProcessDraft,
  type ProcessProblem,
  type SpanProblem,
  spanRange,
} from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Field, fieldAria, fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { NumberField } from "../ui/number-field";
import { Panel } from "../ui/panel";
import { Select } from "../ui/select";
import type { PortEdits } from "./project-port-row";
import { ProjectPorts } from "./project-ports";

export interface ProcessEdits {
  processId: (process: number, value: string) => void;
  processDir: (process: number, value: string) => void;
  processPkgmgr: (process: number, value: PackageManager) => void;
  processCmd: (process: number, value: string) => void;
  processInstall: (process: number, value: string) => void;
  processSpan: (process: number, value: number) => void;
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

const SPAN_TEXT: Record<
  SpanProblem,
  "projectAdd.processes.span" | "projectAdd.processes.spanTaken"
> = {
  span: "projectAdd.processes.span",
  spanTaken: "projectAdd.processes.spanTaken",
};

function portsSummary(draft: ProcessDraft): string {
  return draft.rows
    .map((row) =>
      row.publish && row.web ? `${row.port} → ${row.web}` : String(row.port)
    )
    .join(" · ");
}

export function ProjectProcessCard({
  index,
  draft,
  problem,
  rowProblems,
  spans,
  spanProblem,
  exposure,
  placeholder,
  removable,
  folded,
  edit,
}: {
  index: number;
  draft: ProcessDraft;
  problem: ProcessProblem | null;
  rowProblems: readonly (RowProblem | null)[];
  /** False for an agent that predates spans. */
  spans: boolean;
  spanProblem: SpanProblem | null;
  exposure: Exposure | null;
  placeholder: string;
  removable: boolean;
  folded: boolean;
  edit: ProcessEdits;
}) {
  const t = useTranslations();

  const [opened, setOpened] = useState(!folded);

  const scope = `project.processes.${index}`;
  const field = problem ? PROBLEM_FIELD[problem] : null;
  const problemText = problem ? t(PROBLEM_TEXT[problem]) : undefined;
  const refused =
    problem !== null || spanProblem !== null || rowProblems.some(Boolean);
  const spanText = spanProblem
    ? t(SPAN_TEXT[spanProblem], { max: String(PORT_SPAN_MAX) })
    : undefined;
  // A fold hiding a refusal would leave the reader with a submit button that does nothing.
  const open = opened || refused;
  const summary = [draft.dir, draft.cmd].filter(Boolean).join(" · ");

  return (
    <Panel as="li" className="flex items-start gap-3" inset="lg">
      <Collapsible.Root
        className="group flex min-w-0 flex-1 flex-col"
        data-process={index}
        onOpenChange={setOpened}
        open={open}
      >
        <Collapsible.Trigger
          className="clickable -m-2 flex w-[calc(100%+1rem)] min-w-0 cursor-pointer items-start gap-3 rounded-sm p-2 text-left transition-soft hover:bg-raised"
          data-process-fold={index}
        >
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-3 transition-soft group-data-[open]:rotate-90"
            size={14}
            strokeWidth={1.5}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 whitespace-nowrap font-data font-semibold text-control text-ink">
                {draft.id || t("projectAdd.processes.unnamed")}
              </span>
              {index === 0 ? (
                <span className="label shrink-0 text-ink-3">
                  {t("projectAdd.processes.main")}
                </span>
              ) : null}
              <span className="ml-auto min-w-0 truncate font-data text-ink-3 text-small tabular-nums">
                {portsSummary(draft)}
              </span>
            </span>
            {summary ? (
              <span className="truncate font-data text-ink-3 text-small">
                {summary}
              </span>
            ) : null}
          </span>
        </Collapsible.Trigger>

        <Collapsible.Panel
          className="mt-6 flex flex-col gap-6"
          keepMounted
          onFocusCapture={() => setOpened(true)}
        >
          <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-3">
            <Field
              help={
                field === "id" ? undefined : t("projectAdd.processes.idHelp")
              }
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
              <Select
                id={`${scope}.pkgmgr`}
                kind="data"
                onChange={(manager) => edit.processPkgmgr(index, manager)}
                options={PACKAGE_MANAGERS.map((manager) => ({
                  label: manager,
                  value: manager,
                }))}
                value={draft.pkgmgr}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
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
                onChange={(event) =>
                  edit.processInstall(index, event.target.value)
                }
                placeholder={t("project.overview.derivedFrom", {
                  pkgmgr: draft.pkgmgr,
                })}
                value={draft.install}
              />
            </Field>
          </div>

          {spans ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                help={
                  spanText
                    ? undefined
                    : t("projectAdd.processes.spanHelp", {
                        range: spanRange(draft),
                      })
                }
                label={t("projectAdd.processes.spanLabel")}
                name={`${scope}.span`}
                problem={spanText}
              >
                <NumberField
                  {...fieldAria({
                    help: !spanText,
                    name: `${scope}.span`,
                    problem: Boolean(spanText),
                  })}
                  decrementLabel={t("common.decrease", {
                    label: t("projectAdd.processes.spanLabel"),
                  })}
                  id={`${scope}.span`}
                  incrementLabel={t("common.increase", {
                    label: t("projectAdd.processes.spanLabel"),
                  })}
                  max={PORT_SPAN_MAX}
                  min={1}
                  onChange={(next) => edit.processSpan(index, next)}
                  value={draft.span}
                  wrong={Boolean(spanText)}
                />
              </Field>
            </div>
          ) : null}

          <ProjectPorts
            edit={portEditsOf(edit, index)}
            exposure={exposure}
            placeholder={placeholder}
            problems={rowProblems}
            rows={draft.rows}
            scope={`${scope}.ports`}
          />
        </Collapsible.Panel>
      </Collapsible.Root>

      {removable ? (
        <IconButton
          icon={X}
          label={t("projectAdd.processes.remove", { id: draft.id })}
          onClick={() => edit.removeProcess(index)}
          variant="discreet"
        />
      ) : null}
    </Panel>
  );
}
