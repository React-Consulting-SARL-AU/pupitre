import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortRow, RowProblem } from "@renderer/lib/project-ports";
import type { Exposure } from "@renderer/stores/project-add";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { type PortEdits, ProjectPortRow } from "./project-port-row";
import { portsColumns, portsHead } from "./project-ports-columns";

export function ProjectPorts({
  scope,
  rows,
  problems,
  exposure,
  placeholder,
  edit,
}: {
  scope: string;
  rows: readonly PortRow[];
  problems: readonly (RowProblem | null)[];
  exposure: Exposure | null;
  placeholder: string;
  edit: PortEdits;
}) {
  const t = useTranslations();

  const exposed = exposure !== null;
  const published = exposed && rows.some((row) => row.publish);
  const head = portsHead(scope);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" data-ports={rows.length}>
      <legend className="flex flex-col gap-1">
        <Label>{t("projectAdd.ports.title")}</Label>
        <span className="text-ink-3 text-small leading-relaxed">
          {exposed
            ? t("projectAdd.ports.help.published")
            : t("projectAdd.ports.help.local")}
        </span>
      </legend>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div
          className={`${portsColumns(exposed)} border-line border-b bg-sunken/60 px-3 py-2`}
        >
          <span id={head.label}>
            <Label>{t("projectAdd.ports.labelLabel")}</Label>
          </span>
          <span id={head.port}>
            <Label>{t("projectAdd.form.portLabel")}</Label>
          </span>
          {exposed ? (
            <span id={head.web}>
              <Label>{t("projectAdd.ports.webColumn")}</Label>
            </span>
          ) : null}
          <span aria-hidden="true" />
        </div>

        <ul className="divide-y divide-line">
          {rows.map((row, index) => (
            <ProjectPortRow
              edit={edit}
              exposure={exposed}
              index={index}
              key={row.key}
              placeholder={placeholder}
              problem={problems[index] ?? null}
              removable={index > 0}
              row={row}
              scope={scope}
            />
          ))}
        </ul>
      </div>

      {exposure?.provider === "caddy" && published ? (
        <p className="text-ink-3 text-small leading-relaxed">
          {t("projectAdd.ports.caddyDns", { host: exposure.host })}
        </p>
      ) : null}

      <div>
        <Button icon={Plus} onClick={edit.addRow} size="sm">
          {t("projectAdd.ports.add")}
        </Button>
      </div>
    </fieldset>
  );
}
