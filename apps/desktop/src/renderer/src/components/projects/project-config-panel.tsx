import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import type { RuntimeTool } from "@pupitre/shared/catalog";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import type { ConfigDraft, ConfigState } from "@renderer/stores/project-config";
import { Save } from "lucide-react";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { CheckLine } from "../ui/check-line";
import { Field, fieldControlClass } from "../ui/field";
import { Panel } from "../ui/panel";
import { Section } from "../ui/section";
import type { ProcessEdits } from "./project-process-card";
import { ProjectProcesses } from "./project-processes";
import { ProjectRuntimes } from "./project-runtimes";

export interface ConfigEdits extends ProcessEdits {
  branch: (value: string) => void;
  boot: (value: boolean) => void;
  runtime: (tool: RuntimeTool, version: string) => void;
}

/**
 * The configuration of a declared project, as the add form drew it: the
 * branch, and each process with its command, its install line, its folder,
 * its ports and their names on the web.
 *
 * The source and the name are not here — they do not change without removing
 * the project. What the save will do is said in the bar it ends on: a
 * changed command restarts its process if it runs, and a name taken out stops
 * answering. The agent's answer is read above the bar, in its own words.
 */
export function ProjectConfigPanel({
  project,
  draft,
  services,
  exposure,
  processProblems,
  rowProblems,
  ready,
  restarts,
  dropped,
  run,
  edit,
  onSave,
}: {
  project: Project;
  draft: ConfigDraft;
  /** The server's services: the runtimes among them say which versions a project may pin. */
  services: readonly Service[];
  exposure: Exposure | null;
  processProblems: readonly (ProcessProblem | null)[];
  rowProblems: readonly (readonly (RowProblem | null)[])[];
  ready: boolean;
  /** The processes whose command changed: saving restarts those that run. */
  restarts: readonly string[];
  /** The names on the web the save takes away. */
  dropped: readonly string[];
  run: ConfigState;
  edit: ConfigEdits;
  onSave: () => Promise<void>;
}) {
  const t = useTranslations();

  const saving = run.status === "saving";

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
      className="flex h-full flex-col overflow-y-auto"
      data-config={run.status}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-col gap-section px-8 py-8">
        <div className="grid items-start gap-section lg:grid-cols-[repeat(auto-fit,minmax(24rem,1fr))]">
          <Section name="start" title={t("projectAdd.section.start")}>
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

          <ProjectRuntimes
            onChange={edit.runtime}
            runtimes={draft.runtimes}
            services={services}
          />
        </div>

        <ProjectProcesses
          edit={edit}
          exposure={exposure}
          folded
          placeholder={project.name}
          problems={processProblems}
          processes={draft.processes}
          rowProblems={rowProblems}
        />

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

      <div className="mt-auto">
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
      </div>
    </form>
  );
}
