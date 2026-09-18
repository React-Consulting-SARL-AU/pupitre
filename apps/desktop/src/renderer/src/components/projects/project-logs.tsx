import { CheckLine } from "@renderer/components/ui/check-line";
import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { JournalPane } from "@renderer/components/ui/journal-pane";
import { Select } from "@renderer/components/ui/select";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { matchingRows } from "@renderer/lib/journal-buffer";
import { useJournal } from "@renderer/lib/use-journal";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * The journal of one process of a project, as a continuous stream.
 *
 * A project of several processes has several journals, and the bar picks
 * which one is read; the first is the default. The lines arrive as `log`
 * events of `project.logs` followed, so the app never tails a file itself and
 * never names one. The history is bounded: a watcher can write megabytes, and
 * the page would not recover.
 */

const MAX_LINES = 3000;

const TAIL = 400;

export function ProjectLogs({
  serverId,
  project,
  processes,
}: {
  serverId: string;
  project: string;
  /** The ids of the project's processes, the main one first. */
  processes: readonly string[];
}) {
  const t = useTranslations();

  const [chosen, setChosen] = useState<string | null>(null);
  const process =
    chosen && processes.includes(chosen) ? chosen : (processes[0] ?? "");
  const [follow, setFollow] = useState(true);
  const [term, setTerm] = useState("");

  const journal = useJournal(
    (onLine) =>
      window.pupitre.followProjectJournal(
        serverId,
        project,
        process,
        TAIL,
        onLine
      ),
    `${serverId}/${project}/${process}`,
    MAX_LINES
  );

  const shown = useMemo(
    () => matchingRows(journal.rows, term),
    [journal.rows, term]
  );
  const searching = term.trim().length > 0;
  const label = t("project.logs.journal", {
    name: processes.length > 1 ? `${project}/${process}` : project,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-line border-b px-4 py-2">
        <span className="font-data text-[12px] text-ink-3">{label}</span>

        {processes.length > 1 ? (
          <Select
            aria-label={t("project.logs.process")}
            className="w-auto py-0.5 text-[12px]"
            kind="data"
            onChange={setChosen}
            options={processes.map((id) => ({ label: id, value: id }))}
            value={process}
          />
        ) : null}

        <span className="flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-0.5">
          <Search className="shrink-0 text-ink-4" size={12} strokeWidth={1.5} />
          <input
            aria-label={t("project.logs.search")}
            autoComplete="off"
            className="w-44 bg-transparent font-data text-[12px] text-ink outline-none placeholder:text-ink-4"
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("project.logs.search")}
            spellCheck={false}
            type="search"
            value={term}
          />
          {searching ? (
            <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
              {t.plural("project.logs.matches", shown.length)}
            </span>
          ) : null}
        </span>

        <CopyButton
          disabled={journal.rows.length === 0}
          hint={t("project.logs.copyAllHint")}
          onCopy={() =>
            navigator.clipboard.writeText(
              journal.rows.map((row) => row.text).join("\n")
            )
          }
        >
          {t("project.logs.copyAll")}
        </CopyButton>

        <div className="ml-auto">
          <CheckLine
            checked={follow}
            label={t("project.logs.follow")}
            name="project-logs-follow"
            onChange={setFollow}
            size="sm"
          />
        </div>
      </div>

      {journal.error ? (
        <div className="p-4">
          <ErrorNotice error={journal.error} onRetry={journal.retry} />
        </div>
      ) : null}

      <JournalPane
        className="flex-1"
        follow={follow}
        label={label}
        onFollowChange={setFollow}
        rows={shown}
      >
        {journal.cut ? (
          <p
            className="mb-2 border-line border-b pb-2 text-[11px] text-ink-3"
            data-logs-cut="true"
          >
            {t("project.logs.cut", { count: MAX_LINES })}
          </p>
        ) : null}

        {journal.rows.length === 0 && !journal.error ? (
          <WaitingLine>
            {t("project.logs.waiting", { name: project })}
          </WaitingLine>
        ) : null}

        {journal.rows.length > 0 && shown.length === 0 ? (
          <p className="text-ink-3">{t("project.logs.noMatch")}</p>
        ) : null}
      </JournalPane>
    </div>
  );
}
