import type { FileChange } from "@pupitre/shared/agent-protocol/projects";
import { useTranslations } from "@renderer/i18n/use-translations";
import { splitPath } from "@renderer/lib/patch";
import { FilePlus, FileX, Pencil } from "lucide-react";
import { ProjectDiffCount } from "./project-diff-count";

/**
 * The changed files, grouped as git groups them.
 *
 * `code` is the pair of letters `git status --porcelain` gives, kept verbatim
 * in the tooltip rather than interpreted: it says more than any word we could
 * put in its place, and git is the one who defines it.
 */

export const STAGES = {
  staged: { className: "text-ok", label: "project.diff.stage.staged" },
  unstaged: { className: "text-warn", label: "project.diff.stage.unstaged" },
  untracked: { className: "text-ink-2", label: "project.diff.stage.untracked" },
} as const;

const ORDER = ["staged", "unstaged", "untracked"] as const;

const TRAILING_SLASH = /\/$/;

/** The icon follows git's letter, not our own reading of it. */
function iconFor(change: FileChange) {
  if (change.stage === "untracked" || change.code.includes("A")) {
    return FilePlus;
  }

  if (change.code.includes("D")) {
    return FileX;
  }

  return Pencil;
}

function FileRow({
  change,
  active,
  onSelect,
}: {
  change: FileChange;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();

  const { dir, name } = splitPath(change.path);
  const Icon = iconFor(change);
  const stage = STAGES[change.stage];

  return (
    <button
      className={`flex w-full items-center gap-2 border-line border-b px-3 py-2 text-left last:border-b-0 ${
        active ? "bg-raised" : "hover:bg-sunken"
      }`}
      onClick={onSelect}
      title={`${change.path} · ${change.code.trim() || change.code}`}
      type="button"
    >
      <Icon className={`shrink-0 ${stage.className}`} size={12} />
      {/*
        The file name first, the folder after it and dimmed. Written the other
        way round — as the path reads — a deep folder eats the width and every
        row truncates on the one word that tells them apart.
      */}
      <span className="min-w-0 flex-1 font-data text-[11px]">
        <span
          className={`block truncate ${active ? "text-ink" : "text-ink-2"}`}
        >
          {name}
          {change.from ? (
            <span className="text-ink-3"> ← {splitPath(change.from).name}</span>
          ) : null}
        </span>
        {dir ? (
          <span className="block truncate text-[10px] text-ink-3">
            {dir.replace(TRAILING_SLASH, "")}
          </span>
        ) : null}
      </span>
      {change.binary ? (
        <span className="shrink-0 font-data text-[10px] text-ink-3">
          {t("project.diff.binary")}
        </span>
      ) : (
        <ProjectDiffCount added={change.added} removed={change.removed} />
      )}
    </button>
  );
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

  return (
    <div className="min-h-0 overflow-y-auto border-line border-r">
      {ORDER.map((stage) => {
        const group = files.filter((file) => file.stage === stage);

        if (group.length === 0) {
          return null;
        }

        return (
          <div key={stage}>
            <p
              className={`sticky top-0 z-10 border-line border-b bg-base px-3 py-1 font-data text-[10px] uppercase tracking-[0.08em] ${STAGES[stage].className}`}
            >
              {t(STAGES[stage].label)} · {group.length}
            </p>
            {group.map((file) => (
              <FileRow
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
