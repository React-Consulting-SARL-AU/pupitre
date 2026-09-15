import type { ProjectState } from "@pupitre/shared/agent-protocol/state";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import type {
  DetectionState,
  Draft,
  Exposure,
  FolderState,
  KnownState,
  Phase,
  ProjectAddState,
  ReposState,
} from "../../stores/project-add";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Screen } from "../ui/screen";
import { WaitingNotice } from "../ui/waiting-notice";
import { type DraftEdits, ProjectAddForm } from "./project-add-form";
import { ProjectAddJournal } from "./project-add-journal";
import { ProjectAddOutcome } from "./project-add-outcome";
import { ProjectAddSteps } from "./project-add-steps";

/**
 * A project added to a server, as it is drawn.
 *
 * What is asked runs in the open — each phase says what the agent is doing,
 * the journal stays on screen whatever happens, and a refusal keeps the agent's
 * own words and its own remedy. Leaving costs nothing before the first phase;
 * after it, the project exists on the server, and the screen says so.
 */
export function ProjectAddPanel({
  known,
  draft,
  detected,
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
  onLaunch,
  onRetry,
  onReload,
  onCancel,
  onFinish,
  onOpen,
  onConnect,
  onInstallModule,
}: {
  known: KnownState;
  draft: Draft;
  detected: boolean;
  detection: DetectionState;
  repos: ReposState;
  folders: FolderState;
  /** What publishes a port on this machine, or nothing: no exposure, no name on the web. */
  exposure: Exposure | null;
  /** Whether `tool.github` sits on this machine: no module, no private clone. */
  githubModule: boolean;
  phases: readonly Phase[];
  logs: readonly string[];
  run: ProjectAddState;
  /** The state the machine reports now, when it has been read since the run ended. */
  state?: ProjectState;
  ready: boolean;
  processProblems: readonly (ProcessProblem | null)[];
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  edit: DraftEdits;
  onDetect: () => void;
  onLaunch: () => void;
  onRetry: () => void;
  onReload: () => void;
  onCancel?: () => void;
  onFinish?: () => void;
  onOpen?: (url: string) => void;
  /** Opens the settings on the connections, and comes back to this draft. */
  onConnect: () => void;
  onInstallModule: () => void;
}) {
  const t = useTranslations();

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
      eyebrow={t("project.header.eyebrow")}
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

      {known.status === "ready" && run.status === "idle" ? (
        <ProjectAddForm
          detected={detected}
          detection={detection}
          draft={draft}
          edit={edit}
          exposure={exposure}
          folders={folders}
          githubModule={githubModule}
          onConnect={onConnect}
          onDetect={onDetect}
          onInstallModule={onInstallModule}
          onSubmit={onLaunch}
          processProblems={processProblems}
          ready={ready}
          repos={repos}
          rowProblems={rowProblems}
        />
      ) : null}

      {run.status === "idle" ? null : <ProjectAddSteps phases={phases} />}

      {run.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              {t("common.retry")}
            </Button>
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
