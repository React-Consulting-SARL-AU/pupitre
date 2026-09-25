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
  problems: readonly (ProcessProblem | null)[];
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  exposure: Exposure | null;
  placeholder: string;
  folded?: boolean;
  edit: ProcessEdits;
}) {
  const t = useTranslations();

  // A process added after the list opened starts unfolded.
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
