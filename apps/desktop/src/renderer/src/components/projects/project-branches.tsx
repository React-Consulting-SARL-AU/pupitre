import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Select } from "@renderer/components/ui/select";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { heldForUsage } from "@renderer/lib/refusals";
import type { BranchState } from "@renderer/stores/project";
import { ArrowRightLeft, GitBranchPlus } from "lucide-react";
import { useState } from "react";
import { ProjectBranchCreate } from "./project-branch-create";

/**
 * The branches of the project, and the one it is on.
 *
 * Both lists come from the agent, local and remote, and the list keeps them
 * apart: a remote branch is one the machine has not taken yet. Taking a branch
 * is `project.checkout`, and a refused switch comes back with the agent's own
 * reason rather than one written here. Choosing a branch in the list is not
 * yet taking it: the switch is a button of its own, so a tree with uncommitted
 * changes reads the warning before the agent refuses, not after. A branch that
 * does not exist yet is named in the form that opens under the list.
 */
export function ProjectBranches({
  state,
  folder,
  switching,
  onCheckout,
}: {
  state: BranchState;
  folder: string;
  switching: boolean;
  onCheckout: (branch: string) => Promise<void>;
}) {
  const t = useTranslations();

  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (state.status === "idle" || state.status === "reading") {
    return (
      <WaitingLine className="font-data text-[12px]">
        {t("project.branches.reading")}
      </WaitingLine>
    );
  }

  if (state.status === "failed") {
    return heldForUsage(state.error) ? null : (
      <ErrorNotice bare error={state.error} />
    );
  }

  const { branches } = state;

  if (!branches.repo) {
    return (
      <div className="flex items-start gap-2 text-ink-3">
        <GitBranchPlus className="mt-px shrink-0" size={13} strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-[13px] text-ink-2">
            {t("project.branches.noRepoTitle")}
          </p>
          <p className="mt-0.5 truncate font-data text-[12px]">
            {t("project.branches.notVersioned", { folder })}
          </p>
        </div>
      </div>
    );
  }

  const remoteOnly = branches.remote.filter(
    (name) => !branches.local.includes(name)
  );
  const chosen = picked !== null && picked !== branches.current ? picked : null;
  const selectId = "project-branch";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={selectId}>
          {t("project.overview.branch")}
        </label>
        <Select
          className="max-w-xs"
          disabled={switching || creating}
          groups={[
            {
              label: t("project.branches.local"),
              options: branches.local.map((branch) => ({
                label: branch,
                value: branch,
              })),
            },
            ...(remoteOnly.length > 0
              ? [
                  {
                    label: t("project.branches.remote"),
                    options: remoteOnly.map((branch) => ({
                      label: branch,
                      value: branch,
                    })),
                  },
                ]
              : []),
          ]}
          id={selectId}
          kind="data"
          onChange={setPicked}
          value={chosen ?? branches.current}
        />

        {chosen ? (
          <Button
            icon={ArrowRightLeft}
            loading={switching}
            onClick={async () => {
              await onCheckout(chosen);
              setPicked(null);
            }}
            size="sm"
            variant={branches.dirty ? "danger" : "inverse"}
          >
            {t("project.branches.switch")}
          </Button>
        ) : null}

        {chosen || creating ? null : (
          <Button
            disabled={switching}
            hint={t("project.branches.newHint")}
            icon={GitBranchPlus}
            onClick={() => setCreating(true)}
            size="sm"
            variant="discreet"
          >
            {t("project.branches.new")}
          </Button>
        )}
      </div>

      {creating ? (
        <ProjectBranchCreate
          branches={branches}
          onCancel={() => setCreating(false)}
          onCreate={async (branch) => {
            await onCheckout(branch);
            setCreating(false);
          }}
          switching={switching}
        />
      ) : null}

      {chosen && branches.dirty ? (
        <Callout bare tone="warn">
          {t("project.branches.dirtySwitch", { branch: chosen })}
        </Callout>
      ) : null}

      {branches.dirty && !chosen && !creating ? (
        <Callout bare tone="warn">
          {t("project.branches.dirty")}
        </Callout>
      ) : null}

      {branches.dirty ? null : (
        <p className="truncate font-data text-[12px] text-ink-3">
          {branches.root} ·{" "}
          {t.plural("project.branches.localCount", branches.local.length)}
          {remoteOnly.length > 0
            ? ` · ${t.plural("project.branches.remoteCount", remoteOnly.length)}`
            : ""}
        </p>
      )}
    </div>
  );
}
