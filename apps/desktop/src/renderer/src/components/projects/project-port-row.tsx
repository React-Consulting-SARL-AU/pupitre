import { useTranslations } from "@renderer/i18n/use-translations";
import { spansSeveralLevels } from "@renderer/lib/project-draft";
import type { PortRow, RowProblem } from "@renderer/lib/project-ports";
import { X } from "lucide-react";
import { controlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";
import { ProjectPortWeb } from "./project-port-web";
import { PORTS_HEAD, portsColumns } from "./project-ports-columns";

/** What one row of the ports section lets the reader change. */
export interface PortEdits {
  rowLabel: (index: number, value: string) => void;
  rowPort: (index: number, value: number) => void;
  rowPublish: (index: number, value: boolean) => void;
  rowWeb: (index: number, value: string) => void;
  generateRowWeb: (index: number) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
}

/** The control a refusal concerns: the line beneath the row is tied to it. */
const PROBLEM_FIELD: Record<RowProblem, "label" | "port" | "web"> = {
  label: "label",
  labelTaken: "label",
  port: "port",
  portTaken: "port",
  web: "web",
  webTaken: "web",
};

const PROBLEM_TEXT: Record<
  RowProblem,
  | "projectAdd.ports.label"
  | "projectAdd.ports.labelTaken"
  | "projectAdd.ports.port"
  | "projectAdd.ports.portTaken"
  | "projectAdd.form.subdomain.invalid"
  | "projectAdd.form.subdomain.taken"
> = {
  label: "projectAdd.ports.label",
  labelTaken: "projectAdd.ports.labelTaken",
  port: "projectAdd.ports.port",
  portTaken: "projectAdd.ports.portTaken",
  web: "projectAdd.form.subdomain.invalid",
  webTaken: "projectAdd.form.subdomain.taken",
};

/**
 * One port of the project, on one line: its label, its number and, when the
 * server can publish it, what it is on the web.
 *
 * The first row is the main port — the one that decides the state — and it
 * cannot go. A row refused before the agent is asked says why beneath itself,
 * tied to the control it concerns; a name of several levels is not refused,
 * but what it costs is said in the same place.
 */
export function ProjectPortRow({
  index,
  row,
  problem,
  exposure,
  placeholder,
  removable,
  edit,
}: {
  index: number;
  row: PortRow;
  problem: RowProblem | null;
  /** Whether the server can publish a port at all: no exposure, no switch. */
  exposure: boolean;
  /** The project's name, which the name on the web is proposed from. */
  placeholder: string;
  removable: boolean;
  edit: PortEdits;
}) {
  const t = useTranslations();

  const id = `project.ports.${index}`;
  const field = problem ? PROBLEM_FIELD[problem] : null;
  const warned =
    exposure &&
    row.publish &&
    problem === null &&
    !row.whole &&
    spansSeveralLevels(row.web);

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5" data-port-row={index}>
      <div className={portsColumns(exposure)}>
        <input
          aria-describedby={
            field === "label" ? `${id}.label-problem` : undefined
          }
          aria-invalid={field === "label" ? true : undefined}
          aria-labelledby={PORTS_HEAD.label}
          className={controlClass("data", field === "label")}
          id={`${id}.label`}
          onChange={(event) => edit.rowLabel(index, event.target.value)}
          placeholder={t("projectAdd.ports.labelPlaceholder")}
          required
          value={row.label}
        />

        <input
          aria-describedby={field === "port" ? `${id}.port-problem` : undefined}
          aria-invalid={field === "port" ? true : undefined}
          aria-labelledby={PORTS_HEAD.port}
          className={controlClass("data", field === "port")}
          id={`${id}.port`}
          inputMode="numeric"
          onChange={(event) => edit.rowPort(index, event.target.valueAsNumber)}
          required
          type="number"
          value={Number.isFinite(row.port) ? row.port : ""}
        />

        {exposure ? (
          <ProjectPortWeb
            name={id}
            onChange={(value) => edit.rowWeb(index, value)}
            onGenerate={() => edit.generateRowWeb(index)}
            onPublish={(value) => edit.rowPublish(index, value)}
            placeholder={placeholder}
            publish={row.publish}
            value={row.web}
            wrong={field === "web"}
          />
        ) : null}

        {removable ? (
          <IconButton
            icon={X}
            label={t("projectAdd.ports.remove", { label: row.label })}
            onClick={() => edit.removeRow(index)}
            variant="discreet"
          />
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      {problem && field ? (
        <p
          className="text-[12px] text-danger leading-relaxed"
          id={`${id}.${field}-problem`}
        >
          {t(PROBLEM_TEXT[problem])}
        </p>
      ) : null}

      {warned ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t("projectAdd.form.subdomainDeep")}
        </p>
      ) : null}
    </li>
  );
}
