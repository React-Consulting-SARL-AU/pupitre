import type { Project } from "@pupitre/shared/agent-protocol/state";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RowProblem } from "@renderer/lib/project-ports";
import type { Exposure } from "@renderer/stores/project-add";
import type { ConfigDraft, ConfigState } from "@renderer/stores/project-config";
import { Save } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Field, fieldControlClass } from "../ui/field";
import type { PortEdits } from "./project-port-row";
import { ProjectPorts } from "./project-ports";

export interface ConfigEdits extends PortEdits {
  cmd: (value: string) => void;
  install: (value: string) => void;
  branch: (value: string) => void;
}

/**
 * The configuration of a declared project, as the add form drew it: the
 * command, the install line, the branch, the ports and their names on the web.
 *
 * The source and the name are not here — they do not change without removing
 * the project. What is said before the button is what the save will do: a
 * changed command restarts the project if it runs, and a name taken out stops
 * answering. The agent's answer is read under the form, in its own words.
 */
export function ProjectConfigPanel({
  project,
  draft,
  exposure,
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
  exposure: Exposure | null;
  rowProblems: readonly (RowProblem | null)[];
  ready: boolean;
  /** The command changed: saving restarts the project when it runs. */
  restarts: boolean;
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
        className="elevation-raised flex max-w-3xl flex-col gap-gutter rounded-md border border-line bg-surface p-5"
        data-config={run.status}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Field
          help={t("projectAdd.form.cmdHelp")}
          label={t("projectAdd.form.cmdLabel")}
          name="config.cmd"
          required
        >
          <input
            className={fieldControlClass}
            id="config.cmd"
            onChange={(event) => edit.cmd(event.target.value)}
            value={draft.cmd}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            help={t("project.config.installHelp", { pkgmgr: project.pkgmgr })}
            label={t("project.overview.installCmd")}
            name="config.install"
          >
            <input
              className={fieldControlClass}
              id="config.install"
              onChange={(event) => edit.install(event.target.value)}
              placeholder={t("project.overview.derivedFrom", {
                pkgmgr: project.pkgmgr,
              })}
              value={draft.install}
            />
          </Field>

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
        </div>

        <ProjectPorts
          edit={edit}
          exposure={exposure}
          placeholder={project.name}
          problems={rowProblems}
          rows={draft.rows}
        />

        {restarts ? (
          <Callout name="config-restart" tone="warn">
            {t("project.config.restarts")}
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
