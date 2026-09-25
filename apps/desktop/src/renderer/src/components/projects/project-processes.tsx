import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type {
  ProcessDraft,
  ProcessProblem,
} from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Section } from "../ui/section";
import { type ProcessEdits, ProjectProcessCard } from "./project-process-card";

/**
 * The processes of a project, one card each, the main one first.
 *
 * A project of one process is the usual case and shows one card; a repository
 * that holds a server and its client shows two, each with its own folder,
 * manager, command and ports. The agent proposes the list from what it read
 * in the repository, and the reader adds, removes or corrects.
 *
 * Folded, each card is one line saying what the process is until the reader
 * opens it; one added since the list opened, or one the registry would
 * refuse, opens on its own.
 */
export function ProjectProcesses({
  processes,
  problems,
  rowProblems,
  exposure,
  placeholder,
  folded = false,
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
  /** Closes each card on its summary, for a reader who knows the project. */
  folded?: boolean;
  edit: ProcessEdits;
}) {
  const t = useTranslations();

  const [known] = useState(() => new Set(processes.map((draft) => draft.key)));

  return (
    <Section
      actions={
        <Button icon={Plus} onClick={edit.addProcess} size="sm">
          {t("projectAdd.processes.add")}
        </Button>
      }
      aside={
        processes.length > 1 ? (
          <span className="font-data text-ink-3 text-small tabular-nums">
            {processes.length}
          </span>
        ) : undefined
      }
      data-processes={String(processes.length)}
      name="processes"
      title={t("projectAdd.processes.title")}
    >
      <ul className="flex flex-col gap-4">
        {processes.map((draft, index) => (
          <ProjectProcessCard
            draft={draft}
            edit={edit}
            exposure={exposure}
            folded={folded && known.has(draft.key)}
            index={index}
            key={draft.key}
            placeholder={placeholder}
            problem={problems[index] ?? null}
            removable={processes.length > 1}
            rowProblems={rowProblems[index] ?? []}
          />
        ))}
      </ul>
    </Section>
  );
}
