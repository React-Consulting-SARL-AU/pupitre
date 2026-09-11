import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortRow, RowProblem } from "@renderer/lib/project-ports";
import type { Exposure } from "@renderer/stores/project-add";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { type PortEdits, ProjectPortRow } from "./project-port-row";
import { PORTS_HEAD, portsColumns } from "./project-ports-columns";

/**
 * The ports of a project, as a table: one line each, what the machine runs
 * on the left, what the web reaches on the right.
 *
 * Without an exposure module the table is a plain reading of ports. Behind a
 * Cloudflare tunnel the app writes the records itself; behind Caddy the reader
 * points their own DNS at the server, and the address to write is said here,
 * once, rather than discovered when a name fails to answer.
 */
export function ProjectPorts({
  rows,
  problems,
  exposure,
  placeholder,
  edit,
}: {
  rows: readonly PortRow[];
  /** Why each row would be refused, in the order of the rows. */
  problems: readonly (RowProblem | null)[];
  exposure: Exposure | null;
  /** The project's name, which each name on the web is proposed from. */
  placeholder: string;
  edit: PortEdits;
}) {
  const t = useTranslations();

  const exposed = exposure !== null;
  const published = exposed && rows.some((row) => row.publish);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" data-ports={rows.length}>
      <legend className="flex flex-col gap-1">
        <Label>{t("projectAdd.ports.title")}</Label>
        <span className="text-[12px] text-ink-3 leading-relaxed">
          {exposed
            ? t("projectAdd.ports.help.published")
            : t("projectAdd.ports.help.local")}
        </span>
      </legend>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div
          className={`${portsColumns(exposed)} border-line border-b bg-sunken/60 px-3 py-2`}
        >
          <span id={PORTS_HEAD.label}>
            <Label>{t("projectAdd.ports.labelLabel")}</Label>
          </span>
          <span id={PORTS_HEAD.port}>
            <Label>{t("projectAdd.form.portLabel")}</Label>
          </span>
          {exposed ? (
            <span id={PORTS_HEAD.web}>
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
            />
          ))}
        </ul>
      </div>

      {exposure?.provider === "caddy" && published ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
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
