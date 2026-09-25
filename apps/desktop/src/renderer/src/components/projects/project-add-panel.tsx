import type {
  Project,
  ProjectState,
} from "@pupitre/shared/agent-protocol/state";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import {
  ArrowRight,
  FolderPlus,
  PencilLine,
  RefreshCw,
  ScanSearch,
  X,
} from "lucide-react";
import type {
  AddStep,
  DetectionState,
  Draft,
  Exposure,
  FolderState,
  KnownState,
  Phase,
  PhaseId,
  ProjectAddState,
  ReposState,
} from "../../stores/project-add";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Screen } from "../ui/screen";
import { WaitingNotice } from "../ui/waiting-notice";
import { type DraftEdits, ProjectAddForm } from "./project-add-form";
import { ProjectAddJournal } from "./project-add-journal";
import { ProjectAddOutcome } from "./project-add-outcome";
import { ProjectAddSteps } from "./project-add-steps";

// A refusal in these phases is still fixable from the form; past them the project runs on the server.
const EDITABLE: readonly PhaseId[] = ["add", "sources"];

export function ProjectAddPanel({
  known,
  step,
  draft,
  declared,
  detection,
  repos,
  folders,
  exposure,
  githubModule,
  phases,
  logs,
  run,
  state,
  ready,
  processProblems,
  rowProblems,
  edit,
  onDetect,
  onSkipReading,
  onEditSource,
  onLaunch,
  onRetry,
  onEdit,
  onReload,
  onCancel,
  onFinish,
  onOpen,
  onConnect,
  onInstallModule,
  onOpenDeclared,
}: {
  known: KnownState;
  step: AddStep;
  draft: Draft;
  declared: Project | null;
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  exposure: Exposure | null;
  /** Without `tool.github` on the machine, a private repository cannot be cloned. */
  githubModule: boolean;
  phases: readonly Phase[];
  logs: readonly string[];
  run: ProjectAddState;
  state?: ProjectState;
  ready: boolean;
  processProblems: readonly (ProcessProblem | null)[];
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  edit: DraftEdits;
  /** Return the reading's promise so the button stays pending on it. */
  onDetect: () => Promise<void> | void;
  onSkipReading: () => void;
  onEditSource: () => void;
  onLaunch: () => void;
  onRetry: () => void;
  onEdit?: () => void;
  onReload: () => void;
  onCancel?: () => void;
  onFinish?: () => void;
  onOpen?: (url: string) => void;
  onConnect: () => void;
  onInstallModule: () => void;
  onOpenDeclared: (name: string) => void;
}) {
  const t = useTranslations();

  const editing = known.status === "ready" && run.status === "idle";
  const reading = detection.status === "reading";
  const readable = draft.source.trim().length > 0 && declared === null;

  const footer =
    step === "source" ? (
      <ActionBar name="project-add">
        {detection.status === "failed" ? (
          <Button onClick={onSkipReading} variant="discreet">
            {t("projectAdd.form.skipReading")}
          </Button>
        ) : null}
        <Button
          disabled={!readable}
          icon={ScanSearch}
          loading={reading}
          onClick={onDetect}
          variant="inverse"
        >
          {t(
            draft.kind === "dir"
              ? "projectAdd.form.read.dir"
              : "projectAdd.form.read.repo"
          )}
        </Button>
      </ActionBar>
    ) : (
      <ActionBar name="project-add">
        <Button
          disabled={!ready}
          icon={FolderPlus}
          onClick={onLaunch}
          variant="inverse"
        >
          {t("projectAdd.form.submit")}
        </Button>
      </ActionBar>
    );

  return (
    <Screen
      actions={
        run.status === "done" ? (
          <Button icon={ArrowRight} onClick={onFinish} variant="inverse">
            {t("projectAdd.panel.open")}
          </Button>
        ) : (
          <Button
            disabled={run.status === "running"}
            icon={X}
            onClick={onCancel}
            variant="discreet"
          >
            {t("projectAdd.panel.cancel")}
          </Button>
        )
      }
      column
      eyebrow={t("project.header.eyebrow")}
      footer={editing ? footer : undefined}
      title={t("projectAdd.panel.title")}
    >
      {known.status === "loading" ? (
        <WaitingNotice title={t("projectAdd.panel.loadingTitle")} />
      ) : null}

      {known.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onReload}>
              {t("common.retry")}
            </Button>
          }
          fix={agentText(t, known.error).fix}
          tone="danger"
        >
          {agentText(t, known.error).message}
        </Callout>
      ) : null}

      {editing ? (
        <ProjectAddForm
          declared={declared}
          detection={detection}
          draft={draft}
          edit={edit}
          exposure={exposure}
          folders={folders}
          githubModule={githubModule}
          onConnect={onConnect}
          onEditSource={onEditSource}
          onInstallModule={onInstallModule}
          onOpenDeclared={onOpenDeclared}
          onSubmit={() => {
            if (step === "config" && ready) {
              onLaunch();
            } else if (step === "source" && readable && !reading) {
              onDetect();
            }
          }}
          processProblems={processProblems}
          repos={repos}
          rowProblems={rowProblems}
          step={step}
        />
      ) : null}

      {run.status === "idle" ? null : <ProjectAddSteps phases={phases} />}

      {run.status === "failed" ? (
        <Callout
          action={
            <>
              {EDITABLE.includes(run.phase) ? (
                <Button icon={PencilLine} onClick={onEdit} variant="discreet">
                  {t("projectAdd.panel.edit")}
                </Button>
              ) : null}
              <Button icon={RefreshCw} onClick={onRetry}>
                {t("common.retry")}
              </Button>
            </>
          }
          fix={agentText(t, run.error).fix}
          tone="danger"
        >
          {agentText(t, run.error).message}
        </Callout>
      ) : null}

      {run.status === "done" ? (
        <ProjectAddOutcome
          name={run.name}
          onOpen={onOpen}
          state={state ?? run.state}
          url={run.url}
        />
      ) : null}

      <ProjectAddJournal lines={logs} />
    </Screen>
  );
}
