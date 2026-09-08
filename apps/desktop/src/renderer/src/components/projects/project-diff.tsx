import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { DiffState, TreeState } from "@renderer/stores/project";
import { Check, FileDiff, RefreshCw } from "lucide-react";
import { ProjectDiffCount } from "./project-diff-count";
import { ProjectDiffFiles } from "./project-diff-files";
import { ProjectDiffPatch } from "./project-diff-patch";

/**
 * The working tree of a project, and the diff of the file you select.
 *
 * Read-only, deliberately and entirely: there is no staging, no discarding, no
 * editing. What this view is for is seeing what changed before restarting a
 * project or switching a branch — and the moment it could also write, every
 * misclick would cost someone their work on a machine they are not looking at.
 */
export function ProjectDiff({
  tree,
  diff,
  selected,
  onSelect,
  onReload,
  onRetryDiff,
}: {
  tree: TreeState;
  diff: DiffState;
  selected: string | null;
  onSelect: (path: string) => void;
  onReload: () => void;
  onRetryDiff: () => void;
}) {
  const t = useTranslations();

  if (tree.status === "idle" || tree.status === "reading") {
    return (
      <div className="grid h-full place-items-center">
        <span className="flex items-center gap-2 text-[13px] text-ink-3">
          <StatusDot shape="breathing" size={11} />
          {t("project.diff.readingTree")}
        </span>
      </div>
    );
  }

  if (tree.status === "failed") {
    return (
      <div className="p-4">
        <ErrorNotice error={tree.error} onRetry={onReload} />
      </div>
    );
  }

  if (!tree.tree.repo) {
    return (
      <EmptyState
        detail={t("project.diff.nothingToCompare")}
        icon={FileDiff}
        title={t("project.diff.notRepo")}
      />
    );
  }

  const files = tree.tree.files;
  const total = files.reduce(
    (sum, file) => ({
      added: sum.added + Math.max(0, file.added),
      removed: sum.removed + Math.max(0, file.removed),
    }),
    { added: 0, removed: 0 }
  );
  const change = files.find((file) => file.path === selected) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-line border-b px-4 py-2">
        <span className="font-data text-[12px] text-ink-3">
          {tree.tree.branch || t("project.diff.detachedHead")}
          {tree.tree.upstream ? (
            <span className="text-ink-3"> → {tree.tree.upstream}</span>
          ) : null}
        </span>
        <span className="font-data text-[12px] text-ink-3">
          {files.length === 0
            ? t("project.clean")
            : t.plural("project.file", files.length)}
        </span>
        <ProjectDiffCount added={total.added} removed={total.removed} />
        <span
          className="ml-auto font-data text-[11px] text-ink-3"
          title={t("project.diff.readOnlyHint")}
        >
          {t("project.diff.readOnly")}
        </span>
        <IconButton
          icon={RefreshCw}
          label={t("project.diff.reloadTree")}
          onClick={onReload}
          size={12}
        />
      </div>

      {files.length === 0 ? (
        <EmptyState icon={Check} title={t("project.diff.nothingChanged")} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,17rem)_1fr]">
          <ProjectDiffFiles
            files={files}
            onSelect={onSelect}
            selected={selected}
          />

          <div className="flex min-h-0 min-w-0 flex-col">
            {change ? (
              <p className="flex shrink-0 items-center gap-2 border-line border-b px-4 py-1.5">
                <span className="min-w-0 flex-1 truncate font-data text-[12px] text-ink-2">
                  {change.path}
                </span>
                {change.binary ? null : (
                  <ProjectDiffCount
                    added={change.added}
                    removed={change.removed}
                  />
                )}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">
              <ProjectDiffPatch onRetry={onRetryDiff} state={diff} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
