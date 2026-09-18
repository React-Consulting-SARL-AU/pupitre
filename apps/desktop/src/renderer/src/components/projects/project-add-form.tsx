import type { Project } from "@pupitre/shared/agent-protocol/state";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import type {
  AddStep,
  DetectionState,
  Draft,
  Exposure,
  FolderState,
  ReposState,
} from "../../stores/project-add";
import { Callout } from "../ui/callout";
import { CheckLine } from "../ui/check-line";
import { Field, fieldControlClass } from "../ui/field";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { ProjectAddDeclared } from "./project-add-declared";
import { ProjectAddSource, type SourceEdits } from "./project-add-source";
import { ProjectAddSourceStatus } from "./project-add-source-status";
import { ProjectAddSourceSummary } from "./project-add-source-summary";
import type { ProcessEdits } from "./project-process-card";
import { ProjectProcesses } from "./project-processes";

/**
 * What the agent needs to know about a project, asked in two pages.
 *
 * The first settles where the project comes from — a repository and its
 * branch, or a folder — and ends on the agent reading it. The second opens
 * on what it read: which processes the source holds, which manager each
 * locks, which script starts it and which port it wants; the name comes off
 * the last segment of the address, the ports are ones no declared project
 * holds. Everything proposed there stays editable — the machine decides what
 * it accepts, and says so. The gesture that ends each page stands in the bar
 * at the foot of the screen, not here.
 */
export interface DraftEdits extends SourceEdits, ProcessEdits {
  name: (value: string) => void;
  startNow: (value: boolean) => void;
  boot: (value: boolean) => void;
}

export function ProjectAddForm({
  step,
  draft,
  declared,
  detection,
  repos,
  folders,
  exposure,
  githubModule,
  processProblems,
  rowProblems,
  edit,
  onSubmit,
  onEditSource,
  onConnect,
  onInstallModule,
  onOpenDeclared,
}: {
  step: AddStep;
  draft: Draft;
  /** The project the server already declares at this folder or under this name: the way on is to open it. */
  declared: Project | null;
  /** What the agent read off the source, or why it could not. */
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  /** What publishes a port on this server, or nothing: no exposure, no name on the web. */
  exposure: Exposure | null;
  /** Whether `tool.github` sits on this server. */
  githubModule: boolean;
  /** Why each process would be refused, in the order of the processes. */
  processProblems: readonly (ProcessProblem | null)[];
  /** Why each port row would be refused, process by process. */
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  edit: DraftEdits;
  /** What the page's own gesture does: reads the source, or creates the project. */
  onSubmit: () => void;
  /** Back to the first page, the configuration kept. */
  onEditSource: () => void;
  onConnect: () => void;
  onInstallModule: () => void;
  onOpenDeclared: (name: string) => void;
}) {
  const t = useTranslations();

  return (
    <form
      className="flex flex-col gap-section"
      data-detection={detection.status}
      data-step={step}
      id="project-add"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {step === "source" ? (
        <Section name="source" title={t("projectAdd.section.source")}>
          <Panel className="flex flex-col gap-6" inset="lg">
            <ProjectAddSource
              detection={detection}
              draft={draft}
              edit={edit}
              folders={folders}
              githubModule={githubModule}
              onConnect={onConnect}
              onInstallModule={onInstallModule}
              repos={repos}
            />

            <ProjectAddSourceStatus detection={detection} kind={draft.kind} />

            {detection.status === "failed" ? (
              <Callout
                bare
                fix={agentText(t, detection.error).fix}
                name="detection"
                tone="danger"
              >
                {agentText(t, detection.error).message}
              </Callout>
            ) : null}

            {declared ? (
              <ProjectAddDeclared declared={declared} onOpen={onOpenDeclared} />
            ) : null}
          </Panel>
        </Section>
      ) : (
        <>
          <ProjectAddSourceSummary
            detection={detection}
            draft={draft}
            onEdit={onEditSource}
          />

          <Section name="project" title={t("projectAdd.section.project")}>
            <Panel className="flex flex-col gap-6" inset="lg">
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
                  className={`${fieldControlClass} max-w-sm`}
                  id="project.name"
                  onChange={(event) => edit.name(event.target.value)}
                  placeholder={t("projectAdd.form.namePlaceholder")}
                  value={draft.name}
                />
              </Field>

              {declared ? (
                <ProjectAddDeclared
                  declared={declared}
                  onOpen={onOpenDeclared}
                />
              ) : null}
            </Panel>
          </Section>

          <ProjectProcesses
            edit={edit}
            exposure={exposure}
            placeholder={draft.name}
            problems={processProblems}
            processes={draft.processes}
            rowProblems={rowProblems}
          />

          <Section name="start" title={t("projectAdd.section.start")}>
            <Panel className="flex flex-col gap-5" inset="lg">
              <CheckLine
                checked={draft.startNow}
                detail={t("projectAdd.form.startNowDetail")}
                label={t("projectAdd.form.startNowLabel")}
                name="project.startNow"
                onChange={edit.startNow}
              />
              <CheckLine
                checked={draft.boot}
                detail={t("projectAdd.form.bootDetail")}
                label={t("projectAdd.form.bootLabel")}
                name="project.boot"
                onChange={edit.boot}
              />
            </Panel>
          </Section>
        </>
      )}
    </form>
  );
}
