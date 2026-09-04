import { Check, RefreshCw } from "lucide-react";
import type {
  Draft,
  FirstProjectState,
  KnownState,
  Phase,
} from "../../stores/first-project";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { WaitingNotice } from "../ui/waiting-notice";
import { type DraftEdits, FirstProjectForm } from "./first-project-form";
import { FirstProjectJournal } from "./first-project-journal";
import { FirstProjectOutcome } from "./first-project-outcome";
import { FirstProjectSteps } from "./first-project-steps";

/**
 * The first project of a freshly installed server, as it is drawn.
 *
 * The step is skippable on purpose: a reader who came to install a machine has
 * already got what they came for, and a project that waits for tomorrow costs
 * nothing. What is not skipped runs in the open — each phase says what the
 * agent is doing, the journal stays on screen whatever happens, and a refusal
 * keeps the agent's own words and its own remedy.
 */
export function FirstProjectPanel({
  serverName,
  known,
  draft,
  detected,
  cloudflare,
  phases,
  logs,
  run,
  ready,
  edit,
  onLaunch,
  onRetry,
  onReload,
  onSkip,
  onFinish,
  onOpen,
}: {
  serverName?: string;
  known: KnownState;
  draft: Draft;
  detected: boolean;
  /** Whether `exposure.cloudflare` sits on this machine: no tunnel, no subdomain. */
  cloudflare: boolean;
  phases: readonly Phase[];
  logs: readonly string[];
  run: FirstProjectState;
  ready: boolean;
  edit: DraftEdits;
  onLaunch: () => void;
  onRetry: () => void;
  onReload: () => void;
  onSkip?: () => void;
  onFinish?: () => void;
  onOpen?: (url: string) => void;
}) {
  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        actions={
          run.status === "done" ? (
            <Button icon={Check} onClick={onFinish} variant="inverse">
              Terminer
            </Button>
          ) : (
            <Button onClick={onSkip} variant="discreet">
              Plus tard
            </Button>
          )
        }
        description="Un dépôt à cloner ou un dossier déjà là : l'agent le déclare, l'installe, le démarre et ouvre son journal."
        eyebrow="Premier projet"
        title={serverName ?? "Ce serveur"}
      />

      {known.status === "loading" ? (
        <WaitingNotice
          detail="Leurs ports décident de celui que ce projet peut prendre."
          title="Lecture des projets déjà déclarés"
        />
      ) : null}

      {known.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onReload}>
              Réessayer
            </Button>
          }
          fix={known.error.fix}
          tone="danger"
        >
          {known.error.message}
        </Callout>
      ) : null}

      {known.status === "ready" && run.status === "idle" ? (
        <FirstProjectForm
          cloudflare={cloudflare}
          detected={detected}
          draft={draft}
          edit={edit}
          onSubmit={onLaunch}
          ready={ready}
        />
      ) : null}

      {run.status === "idle" ? null : <FirstProjectSteps phases={phases} />}

      {run.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              Réessayer
            </Button>
          }
          fix={run.error.fix}
          tone="danger"
        >
          {run.error.message}
        </Callout>
      ) : null}

      {run.status === "done" ? (
        <FirstProjectOutcome
          name={run.name}
          onOpen={onOpen}
          port={run.port}
          state={run.state}
          url={run.url}
        />
      ) : null}

      <FirstProjectJournal lines={logs} />
    </section>
  );
}
