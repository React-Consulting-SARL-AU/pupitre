import { panelClass } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import { FolderPlus } from "lucide-react";
import type {
  DetectionState,
  Draft,
  Exposure,
  FolderState,
  ReposState,
} from "../../stores/project-add";
import { Button } from "../ui/button";
import { Field, fieldControlClass } from "../ui/field";
import { ProjectAddSource, type SourceEdits } from "./project-add-source";
import { ProjectAddSourceStatus } from "./project-add-source-status";
import type { ProcessEdits } from "./project-process-card";
import { ProjectProcesses } from "./project-processes";

/**
 * What the agent needs to know about a project, asked once.
 *
 * The source fills the rest in: the agent reads the repository and says which
 * processes it holds, which manager each locks, which script starts it and
 * which port it wants; the name comes off the last segment of the address,
 * the ports are ones no declared project holds. Everything proposed here
 * stays editable — the machine decides what it accepts, and says so.
 */
export interface DraftEdits extends SourceEdits, ProcessEdits {
  name: (value: string) => void;
}

export function ProjectAddForm({
  draft,
  detected,
  detection,
  repos,
  folders,
  exposure,
  githubModule,
  ready,
  processProblems,
  rowProblems,
  edit,
  onDetect,
  onSubmit,
  onConnect,
  onInstallModule,
}: {
  draft: Draft;
  /** The processes came from a project the agent already declares. */
  detected: boolean;
  /** What the agent read off the source, or why it could not. */
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  /** What publishes a port on this server, or nothing: no exposure, no name on the web. */
  exposure: Exposure | null;
  /** Whether `tool.github` sits on this server. */
  githubModule: boolean;
  ready: boolean;
  /** Why each process would be refused, in the order of the processes. */
  processProblems: readonly (ProcessProblem | null)[];
  /** Why each port row would be refused, process by process. */
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  edit: DraftEdits;
  /** The reader is done naming the source: the agent may read it. */
  onDetect: () => void;
  onSubmit: () => void;
  onConnect: () => void;
  onInstallModule: () => void;
}) {
  const t = useTranslations();

  const busy = detection.status === "reading";

  return (
    <form
      className={`${panelClass("lg")} flex flex-col gap-gutter`}
      data-detection={detection.status}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ProjectAddSource
        detection={detection}
        draft={draft}
        edit={edit}
        folders={folders}
        githubModule={githubModule}
        onConnect={onConnect}
        onDetect={onDetect}
        onInstallModule={onInstallModule}
        repos={repos}
      />

      <ProjectAddSourceStatus detection={detection} kind={draft.kind} />

      <Field
        help={
          draft.dir
            ? t("projectAdd.form.folderHelp", { dir: draft.dir })
            : t("projectAdd.form.nameHelp")
        }
        label={t("projectAdd.form.nameLabel")}
        name="project.name"
        required
      >
        <input
          className={fieldControlClass}
          id="project.name"
          onChange={(event) => edit.name(event.target.value)}
          placeholder={t("projectAdd.form.namePlaceholder")}
          value={draft.name}
        />
      </Field>

      {detected ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t("projectAdd.form.processesDetected")}
        </p>
      ) : null}

      <ProjectProcesses
        edit={edit}
        exposure={exposure}
        placeholder={draft.name}
        problems={processProblems}
        processes={draft.processes}
        rowProblems={rowProblems}
      />

      <div className="flex items-center gap-2">
        <Button
          disabled={!ready || busy}
          icon={FolderPlus}
          submit
          variant="inverse"
        >
          {t("projectAdd.form.submit")}
        </Button>
      </div>
    </form>
  );
}
