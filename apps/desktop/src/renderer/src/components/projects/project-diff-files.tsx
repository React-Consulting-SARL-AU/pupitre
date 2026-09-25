import type { FileChange } from "@pupitre/shared/agent-protocol/projects";
import { useTranslations } from "@renderer/i18n/use-translations";
import { type KeyboardEvent, useId } from "react";
import { ProjectDiffFileRow } from "./project-diff-file-row";

export const STAGES = {
  staged: { className: "text-ok", label: "project.diff.stage.staged" },
  unstaged: { className: "text-warn", label: "project.diff.stage.unstaged" },
  untracked: { className: "text-ink-2", label: "project.diff.stage.untracked" },
} as const;

const ORDER = ["staged", "unstaged", "untracked"] as const;

export function drawnOrder(files: readonly FileChange[]): readonly string[] {
  return ORDER.flatMap((stage) =>
    files.filter((file) => file.stage === stage).map((file) => file.path)
  );
}

/** Null when the key does not move the selection. */
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

  const prefix = useId();
  const order = drawnOrder(files);
  const optionId = (path: string) => `${prefix}-${order.indexOf(path)}`;
  const tabbable =
    selected !== null && order.includes(selected) ? selected : order[0];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const next = pathAfterKey(event.key, order, selected);

    if (next && next !== selected) {
      event.preventDefault();
      onSelect(next);
      document.getElementById(optionId(next))?.focus();
    }
  }

  return (
    <div
      aria-label={t("project.diff.filesList")}
      className="min-h-0 overflow-y-auto border-line border-r"
      onKeyDown={onKeyDown}
      role="listbox"
    >
      {ORDER.map((stage) => {
        const group = files.filter((file) => file.stage === stage);

        if (group.length === 0) {
          return null;
        }

        const caption = `${t(STAGES[stage].label)} · ${group.length}`;

        return (
          // biome-ignore lint/a11y/useSemanticElements: a listbox groups its options with role group; a fieldset groups form controls
          <div aria-label={caption} key={stage} role="group">
            <p
              aria-hidden="true"
              className={`sticky top-0 z-10 border-line border-b bg-base px-3 py-1 font-data text-caption uppercase tracking-[0.08em] ${STAGES[stage].className}`}
            >
              {caption}
            </p>
            {group.map((file) => (
              <ProjectDiffFileRow
                active={file.path === selected}
                change={file}
                id={optionId(file.path)}
                key={file.path}
                onSelect={() => onSelect(file.path)}
                tabbable={file.path === tabbable}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
