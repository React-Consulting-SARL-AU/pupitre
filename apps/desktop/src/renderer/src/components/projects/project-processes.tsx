import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type {
  ProcessDraft,
  ProcessProblem,
} from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { type ProcessEdits, ProjectProcessCard } from "./project-process-card";

/**
 * The processes of a project, one card each, the main one first.
 *
 * A project of one process is the usual case and shows one card; a repository
 * that holds a server and its client shows two, each with its own folder,
 * manager, command and ports. The agent proposes the list from what it read
 * in the repository, and the reader adds, removes or corrects.
 */
export function ProjectProcesses({
  processes,
  problems,
  rowProblems,
  exposure,
  placeholder,
  edit,
}: {
  processes: readonly ProcessDraft[];
  /** Why each process would be refused, in the order of the processes. */
  problems: readonly (ProcessProblem | null)[];
  /** Why each row of each process would be refused, process by process. */
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  exposure: Exposure | null;
  /** The project's name, which each name on the web is proposed from. */
  placeholder: string;
  edit: ProcessEdits;
}) {
  const t = useTranslations();

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      data-processes={processes.length}
    >
      <legend className="flex flex-col gap-1">
        <Label>{t("projectAdd.processes.title")}</Label>
        <span className="text-[12px] text-ink-3 leading-relaxed">
          {t("projectAdd.processes.help")}
        </span>
      </legend>

      <ul className="flex flex-col gap-3">
        {processes.map((draft, index) => (
          <ProjectProcessCard
            draft={draft}
            edit={edit}
            exposure={exposure}
            index={index}
            key={draft.key}
            placeholder={placeholder}
            problem={problems[index] ?? null}
            removable={processes.length > 1}
            rowProblems={rowProblems[index] ?? []}
          />
        ))}
      </ul>

      <div>
        <Button icon={Plus} onClick={edit.addProcess} size="sm">
          {t("projectAdd.processes.add")}
        </Button>
      </div>
    </fieldset>
  );
}
