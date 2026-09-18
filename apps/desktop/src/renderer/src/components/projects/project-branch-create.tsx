import type { ProjectBranchesResult } from "@pupitre/shared/agent-protocol/projects";
import { GitBranchSchema } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { controlClass, fieldAria } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { GitBranchPlus } from "lucide-react";
import { useState } from "react";

export type NewBranchProblem = "invalid" | "exists";

const PROBLEM_KEY = {
  exists: "project.branches.exists",
  invalid: "project.branches.invalidName",
} as const;

/**
 * What stops a name from becoming a branch, before the agent is asked.
 *
 * git's own rule is the one the contract carries; a name that already exists,
 * locally or on the remote, is not created but taken, and the list is where
 * that gesture lives.
 */
export function newBranchProblem(
  name: string,
  branches: Pick<ProjectBranchesResult, "local" | "remote">
): NewBranchProblem | null {
  if (!GitBranchSchema.safeParse(name).success) {
    return "invalid";
  }

  if (branches.local.includes(name) || branches.remote.includes(name)) {
    return "exists";
  }

  return null;
}

/**
 * A branch that does not exist yet, named here and created from the one the
 * project is on.
 *
 * The agent creates it on the same `project.checkout` that takes an existing
 * one, so a tree with uncommitted changes gets the same refusal, said before
 * the agent says it.
 */
export function ProjectBranchCreate({
  branches,
  switching,
  onCreate,
  onCancel,
}: {
  branches: ProjectBranchesResult;
  switching: boolean;
  onCreate: (branch: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const problem = trimmed === "" ? null : newBranchProblem(trimmed, branches);
  const problemText = problem
    ? t(PROBLEM_KEY[problem], { branch: trimmed })
    : undefined;
  const refused = touched && problemText !== undefined;
  const inputId = "project-branch-new";

  return (
    <form
      className="flex flex-col gap-2"
      data-branch-create=""
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);

        if (trimmed === "" || problem !== null) {
          return;
        }

        onCreate(trimmed);
      }}
    >
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={inputId}>
          {t("project.branches.newName")}
        </label>
        <input
          {...fieldAria({ name: inputId, help: true, problem: refused })}
          autoFocus
          className={controlClass("data", refused)}
          disabled={switching}
          onBlur={() => setTouched(true)}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("project.branches.newPlaceholder")}
          spellCheck={false}
          value={name}
        />

        <Button
          disabled={trimmed === "" || problem !== null}
          icon={GitBranchPlus}
          loading={switching}
          size="sm"
          submit
          variant={branches.dirty ? "danger" : "inverse"}
        >
          {t("project.branches.create")}
        </Button>

        <Button
          disabled={switching}
          onClick={onCancel}
          size="sm"
          variant="discreet"
        >
          {t("common.cancel")}
        </Button>
      </div>

      <span className="font-data text-[11px] text-ink-3" id={`${inputId}-help`}>
        {t("project.branches.newFrom", { branch: branches.current })}
      </span>

      {refused ? (
        <span
          className="text-[12px] text-danger leading-relaxed"
          id={`${inputId}-problem`}
        >
          {problemText}
        </span>
      ) : null}

      {branches.dirty && trimmed !== "" && problem === null ? (
        <Callout bare tone="warn">
          {t("project.branches.dirtyCreate", { branch: trimmed })}
        </Callout>
      ) : null}
    </form>
  );
}
