import type { Project } from "@pupitre/shared/agent-protocol/state";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import {
  type AddStep,
  type DetectionState,
  type Draft,
  type Exposure,
  type FolderState,
  nameRefused,
  type ReposState,
} from "../../stores/project-add";
import { Callout } from "../ui/callout";
import { CheckLine } from "../ui/check-line";
import { controlClass, Field, fieldAria } from "../ui/field";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { ProjectAddDeclared } from "./project-add-declared";
import { ProjectAddSource, type SourceEdits } from "./project-add-source";
import { ProjectAddSourceStatus } from "./project-add-source-status";
import { ProjectAddSourceSummary } from "./project-add-source-summary";
import type { ProcessEdits } from "./project-process-card";
import { ProjectProcesses } from "./project-processes";

const NAME_FIELD = "project.name";

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
  declared: Project | null;
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  exposure: Exposure | null;
  githubModule: boolean;
  /** Index-aligned with `draft.processes`. */
  processProblems: readonly (ProcessProblem | null)[];
  /** Index-aligned with `draft.processes`, then with each process's port rows. */
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  edit: DraftEdits;
  onSubmit: () => void;
  onEditSource: () => void;
  onConnect: () => void;
  onInstallModule: () => void;
  onOpenDeclared: (name: string) => void;
}) {
  const t = useTranslations();

  const nameProblem = nameRefused(draft.name)
    ? t("projectAdd.form.nameProblem")
    : undefined;

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
                name={NAME_FIELD}
                problem={nameProblem}
                required
              >
                <input
                  {...fieldAria({
                    help: true,
                    name: NAME_FIELD,
                    problem: Boolean(nameProblem),
                    required: true,
                  })}
                  className={`${controlClass("data", Boolean(nameProblem))} max-w-sm`}
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
