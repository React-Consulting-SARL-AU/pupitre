import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { DiffState } from "@renderer/stores/project";
import { ProjectDiffPatchRows } from "./project-diff-patch-rows";

/** Waiting, read, refused or nothing chosen — never a bare spinner. */
export function ProjectDiffPatch({
  state,
  onRetry,
}: {
  state: DiffState;
  onRetry: () => void;
}) {
  const t = useTranslations();

  if (state.status === "idle") {
    return <EmptyState title={t("project.diff.pickFile")} />;
  }

  if (state.status === "reading") {
    return (
      <div className="flex justify-center p-6">
        <WaitingLine className="text-[13px]">
          {t("project.diff.reading")}
        </WaitingLine>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="p-4">
        <ErrorNotice error={state.error} onRetry={onRetry} />
      </div>
    );
  }

  if (state.diff.binary) {
    return (
      <p className="p-6 text-center text-[13px] text-ink-3">
        {t("project.diff.binaryFile")}
      </p>
    );
  }

  return (
    <ProjectDiffPatchRows
      patch={state.diff.patch}
      problem={state.diff.problem}
    />
  );
}
