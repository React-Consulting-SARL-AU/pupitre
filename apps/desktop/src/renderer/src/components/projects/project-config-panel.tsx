import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import {
  RUNTIME_TOOLS,
  type RuntimeTool,
  runtimeModuleId,
} from "@pupitre/shared/catalog";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type {
  ProcessAccess,
  ProcessProblem,
} from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import type { ConfigDraft, ConfigState } from "@renderer/stores/project-config";
import { Save } from "lucide-react";
import { useState } from "react";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { CheckLine } from "../ui/check-line";
import { Field, fieldControlClass } from "../ui/field";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import { Tab, TabBar } from "../ui/tab-bar";
import { ProjectConfigAccess } from "./project-config-access";
import type { ProcessEdits } from "./project-process-card";
import { ProjectProcesses } from "./project-processes";
import { ProjectRuntimes } from "./project-runtimes";

export interface ConfigEdits extends ProcessEdits {
  branch: (value: string) => void;
  boot: (value: boolean) => void;
  runtime: (tool: RuntimeTool, version: string) => void;
  protected: (value: boolean) => void;
  processAccess: (process: number, value: ProcessAccess) => void;
}

const PARTS = ["general", "runtimes", "processes", "access"] as const;

export type ConfigPart = (typeof PARTS)[number];

type Part = ConfigPart;

const PART_LABEL = {
  access: "project.config.part.access",
  general: "project.config.part.general",
  processes: "project.config.part.processes",
  runtimes: "project.config.part.runtimes",
} as const;

function pinnable(services: readonly Service[]): boolean {
  return RUNTIME_TOOLS.some(
    (tool) =>
      (services.find((service) => service.id === runtimeModuleId(tool))
        ?.versions?.length ?? 0) > 0
  );
}

// Source and name are absent on purpose: they only change by removing the project.
export function ProjectConfigPanel({
  serverId,
  project,
  projects,
  draft,
  services,
  exposure,
  gated,
  processProblems,
  rowProblems,
  ready,
  restarts,
  dropped,
  run,
  edit,
  onSave,
  openAt = "general",
}: {
  serverId: string;
  project: Project;
  projects: readonly Project[];
  draft: ConfigDraft;
  services: readonly Service[];
  exposure: Exposure | null;
  gated: boolean;
  processProblems: readonly (ProcessProblem | null)[];
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  ready: boolean;
  restarts: readonly string[];
  dropped: readonly string[];
  run: ConfigState;
  edit: ConfigEdits;
  onSave: () => Promise<void>;
  openAt?: ConfigPart;
}) {
  const t = useTranslations();

  const [part, setPart] = useState<Part>(openAt);

  const saving = run.status === "saving";
  const parts = PARTS.filter(
    (candidate) => candidate !== "runtimes" || pinnable(services)
  );
  const refused: Partial<Record<Part, boolean>> = {
    processes:
      processProblems.some(Boolean) ||
      rowProblems.some((rows) => rows.some(Boolean)),
  };

  const consequences = [
    restarts.length > 0
      ? t("project.config.restarts", { processes: restarts.join(", ") })
      : null,
    dropped.length > 0
      ? t("project.config.dropped", { hostnames: dropped.join(", ") })
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <form
      className="flex h-full flex-col"
      data-config={run.status}
      data-config-part={part}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex min-h-0 flex-1 items-start gap-12 overflow-y-auto px-8 py-8">
        <div className="sticky top-0">
          <TabBar
            label={t("project.config.sections")}
            onChange={setPart}
            orientation="vertical"
            value={part}
          >
            {parts.map((id) => (
              <Tab key={id} orientation="vertical" value={id}>
                <span className="flex-1">{t(PART_LABEL[id])}</span>
                {id === "processes" && draft.processes.length > 1 ? (
                  <span className="font-data text-ink-3 text-small tabular-nums">
                    {draft.processes.length}
                  </span>
                ) : null}
                {refused[id] ? (
                  <span
                    aria-label={t("project.config.part.refused", {
                      part: t(PART_LABEL[id]),
                    })}
                    className="size-1.5 rounded-full bg-danger"
                    data-part-refused={id}
                    role="img"
                  />
                ) : null}
              </Tab>
            ))}
          </TabBar>
        </div>

        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-section">
          {part === "general" ? (
            <Section name="start" title={t("project.config.start.title")}>
              <Panel className="flex flex-col gap-6" inset="lg">
                <CheckLine
                  checked={draft.boot}
                  detail={t("projectAdd.form.bootDetail")}
                  label={t("projectAdd.form.bootLabel")}
                  name="config.boot"
                  onChange={edit.boot}
                />

                <Field
                  help={t("project.config.branchHelp")}
                  label={t("projectAdd.form.branchLabel")}
                  name="config.branch"
                >
                  <input
                    className={`${fieldControlClass} max-w-sm`}
                    disabled={!project.repo}
                    id="config.branch"
                    onChange={(event) => edit.branch(event.target.value)}
                    placeholder={t("projectAdd.form.branchPlaceholder")}
                    value={draft.branch}
                  />
                </Field>
              </Panel>
            </Section>
          ) : null}

          {part === "runtimes" ? (
            <ProjectRuntimes
              onChange={edit.runtime}
              runtimes={draft.runtimes}
              services={services}
            />
          ) : null}

          {/* Kept mounted: a fold opened or a field half-typed survives a look at another part. */}
          <div
            className="flex flex-col gap-section"
            hidden={part !== "processes"}
          >
            <ProjectProcesses
              edit={edit}
              exposure={exposure}
              folded
              placeholder={project.name}
              problems={processProblems}
              processes={draft.processes}
              rowProblems={rowProblems}
            />
          </div>

          {part === "access" ? (
            <ProjectConfigAccess
              exposure={exposure}
              gated={gated}
              guarded={draft.protected}
              onProcessAccess={edit.processAccess}
              onProtected={edit.protected}
              processes={draft.processes}
              project={project}
              projects={projects}
              serverId={serverId}
            />
          ) : null}

          {run.status === "saved" ? (
            <Callout name="config-saved" tone="ok">
              {t("project.config.saved", {
                name: run.name,
                state: t(`state.project.${run.project.state}`),
              })}
            </Callout>
          ) : null}

          {run.status === "saved"
            ? run.warnings?.map((warning) => (
                <Callout key={warning} name="config-warning" tone="warn">
                  {t("project.config.warning", { warning })}
                </Callout>
              ))
            : null}

          {run.status === "saved" && run.sync ? (
            <Callout
              fix={agentText(t, run.sync).fix}
              name="config-sync-refused"
              tone="warn"
            >
              {t("project.config.syncRefused", {
                message: agentText(t, run.sync).message,
              })}
            </Callout>
          ) : null}

          {run.status === "failed" ? (
            <Callout
              fix={agentText(t, run.error).fix}
              name="config-failed"
              tone="danger"
            >
              {agentText(t, run.error).message}
            </Callout>
          ) : null}
        </div>
      </div>

      <ActionBar
        column={false}
        name="project-config"
        note={
          consequences.length > 0 ? (
            <span className="flex flex-col gap-1" data-config-consequences="">
              {consequences.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          ) : undefined
        }
      >
        <Button
          disabled={!ready || saving}
          icon={Save}
          loading={saving}
          submit
          variant="inverse"
        >
          {t("project.config.save")}
        </Button>
      </ActionBar>
    </form>
  );
}
