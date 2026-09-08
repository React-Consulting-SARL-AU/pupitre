import { Callout } from "@renderer/components/ui/callout";
import { fieldControlClass } from "@renderer/components/ui/field";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { BranchState } from "@renderer/stores/project";
import { GitBranchPlus } from "lucide-react";

/**
 * The branches of the project, and the one it is on.
 *
 * Both lists come from the agent, local and remote; taking a branch is
 * `project.checkout`, and a refused switch comes back with the agent's own
 * reason rather than one written here.
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
  onCheckout: (branch: string) => void;
}) {
  const t = useTranslations();

  if (state.status === "idle" || state.status === "reading") {
    return (
      <p className="flex items-center gap-2 font-data text-[12px] text-ink-3">
        <StatusDot shape="breathing" size={11} />
        {t("project.branches.reading")}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <Callout fix={agentText(t, state.error).fix} tone="warn">
        {agentText(t, state.error).message}
      </Callout>
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

  const all = [
    ...branches.local,
    ...branches.remote.filter((name) => !branches.local.includes(name)),
  ];

  return (
    <div className="flex flex-col gap-2">
      <select
        className={fieldControlClass}
        disabled={switching}
        onChange={(event) => onCheckout(event.target.value)}
        value={branches.current}
      >
        {all.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
            {branches.local.includes(branch)
              ? ""
              : t("project.branches.remoteSuffix")}
          </option>
        ))}
      </select>

      {branches.dirty ? (
        <Callout tone="warn">{t("project.branches.dirty")}</Callout>
      ) : (
        <p className="truncate font-data text-[12px] text-ink-3">
          {branches.root} ·{" "}
          {t.plural("project.branches.localCount", branches.local.length)}
        </p>
      )}
    </div>
  );
}
