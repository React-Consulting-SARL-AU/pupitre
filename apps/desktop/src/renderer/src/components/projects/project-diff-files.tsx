import type { FileChange } from "@pupitre/shared/agent-protocol/projects";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { KeyboardEvent } from "react";
import { ProjectDiffFileRow } from "./project-diff-file-row";

/**
 * The changed files, grouped as git groups them.
 *
 * `code` is the pair of letters `git status --porcelain` gives, kept verbatim
 * in the tooltip rather than interpreted: it says more than any word we could
 * put in its place, and git is the one who defines it.
 *
 * The list answers the keyboard as a list does: the arrows and `j`/`k` move
 * the selection through the files in the order they are drawn, whichever
 * group they sit in, and the diff follows.
 */

export const STAGES = {
  staged: { className: "text-ok", label: "project.diff.stage.staged" },
  unstaged: { className: "text-warn", label: "project.diff.stage.unstaged" },
  untracked: { className: "text-ink-2", label: "project.diff.stage.untracked" },
} as const;

const ORDER = ["staged", "unstaged", "untracked"] as const;

/** The files in the order the list draws them: by stage, then as git listed them. */
export function drawnOrder(files: readonly FileChange[]): readonly string[] {
  return ORDER.flatMap((stage) =>
    files.filter((file) => file.stage === stage).map((file) => file.path)
  );
}

/** The path a key moves to, or null when the key is not one of the list's. */
export function pathAfterKey(
  key: string,
  order: readonly string[],
  selected: string | null
): string | null {
  const step = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 }[key];

  if (step === undefined || order.length === 0) {
    return null;
  }

  const here = selected === null ? -1 : order.indexOf(selected);

  if (here === -1) {
    return step > 0 ? (order[0] ?? null) : (order.at(-1) ?? null);
  }

  return order[Math.min(order.length - 1, Math.max(0, here + step))] ?? null;
}

export function ProjectDiffFiles({
  files,
  selected,
  onSelect,
}: {
  files: readonly FileChange[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = pathAfterKey(event.key, drawnOrder(files), selected);

    if (next && next !== selected) {
      event.preventDefault();
      onSelect(next);
    }
  }

  return (
    <div
      aria-label={t("project.diff.filesList")}
      className="min-h-0 overflow-y-auto border-line border-r"
      onKeyDown={onKeyDown}
      role="listbox"
      tabIndex={0}
    >
      {ORDER.map((stage) => {
        const group = files.filter((file) => file.stage === stage);

        if (group.length === 0) {
          return null;
        }

        return (
          <div key={stage}>
            <p
              className={`sticky top-0 z-10 border-line border-b bg-base px-3 py-1 font-data text-[11px] uppercase tracking-[0.08em] ${STAGES[stage].className}`}
            >
              {t(STAGES[stage].label)} · {group.length}
            </p>
            {group.map((file) => (
              <ProjectDiffFileRow
                active={file.path === selected}
                change={file}
                key={file.path}
                onSelect={() => onSelect(file.path)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
