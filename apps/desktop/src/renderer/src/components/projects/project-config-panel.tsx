import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import type { RuntimeTool } from "@pupitre/shared/catalog";
import { panelClass } from "@renderer/components/ui/panel";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { ProcessProblem } from "@renderer/lib/project-processes";
import type { Exposure } from "@renderer/stores/project-add";
import type { ConfigDraft, ConfigState } from "@renderer/stores/project-config";
import { Save } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { CheckLine } from "../ui/check-line";
import { Field, fieldControlClass } from "../ui/field";
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
 * the project. What is said before the button is what the save will do: a
 * changed command restarts its process if it runs, and a name taken out stops
 * answering. The agent's answer is read under the form, in its own words.
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

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <form
        className={`${panelClass("lg")} flex max-w-3xl flex-col gap-gutter`}
        data-config={run.status}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Field
          help={t("project.config.branchHelp")}
          label={t("projectAdd.form.branchLabel")}
          name="config.branch"
        >
          <input
            className={fieldControlClass}
            disabled={!project.repo}
            id="config.branch"
            onChange={(event) => edit.branch(event.target.value)}
            placeholder={t("projectAdd.form.branchPlaceholder")}
            value={draft.branch}
          />
        </Field>

        <CheckLine
          checked={draft.boot}
          label={t("projectAdd.form.bootLabel")}
          name="config.boot"
          onChange={edit.boot}
        />

        <ProjectRuntimes
          onChange={edit.runtime}
          runtimes={draft.runtimes}
          services={services}
        />

        <ProjectProcesses
          edit={edit}
          exposure={exposure}
          placeholder={project.name}
          problems={processProblems}
          processes={draft.processes}
          rowProblems={rowProblems}
        />

        {restarts.length > 0 ? (
          <Callout name="config-restart" tone="warn">
            {t("project.config.restarts", { processes: restarts.join(", ") })}
          </Callout>
        ) : null}

        {dropped.length > 0 ? (
          <Callout name="config-dropped" tone="warn">
            {t("project.config.dropped", { hostnames: dropped.join(", ") })}
          </Callout>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            disabled={!ready || run.status === "saving"}
            icon={Save}
            loading={run.status === "saving"}
            submit
            variant="inverse"
          >
            {t("project.config.save")}
          </Button>
        </div>

        {run.status === "saved" ? (
          <Callout name="config-saved" tone="ok">
            {t("project.config.saved", {
              name: run.name,
              state: t(`state.project.${run.project.state}`),
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
      </form>
    </div>
  );
}
