import type { FileChange } from "@pupitre/shared/agent-protocol/projects";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import { splitPath } from "@renderer/lib/patch";
import { FilePlus, FileX, Pencil } from "lucide-react";
import { ProjectDiffCount } from "./project-diff-count";
import { STAGES } from "./project-diff-files";

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

/**
 * One changed file, the way a reader picks it out of a list.
 *
 * The file name first, the folder after it and dimmed. Written the other way
 * round — as the path reads — a deep folder eats the width and every row
 * truncates on the one word that tells them apart.
 */
export function ProjectDiffFileRow({
  change,
  active,
  id,
  tabbable,
  onSelect,
}: {
  change: FileChange;
  active: boolean;
  id: string;
  /** The one row of the list the Tab key lands on; the arrows walk the others. */
  tabbable: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();

  const { dir, name } = splitPath(change.path);
  const Icon = iconFor(change);
  const stage = STAGES[change.stage];

  return (
    <Tooltip label={`${change.path} · ${change.code.trim() || change.code}`}>
      <div
        aria-selected={active}
        className={`flex w-full cursor-pointer items-center gap-2 border-line border-b px-3 py-2 text-left last:border-b-0 ${
          active ? "bg-raised" : "hover:bg-sunken"
        }`}
        id={id}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="option"
        tabIndex={tabbable ? 0 : -1}
      >
        <Icon className={`shrink-0 ${stage.className}`} size={12} />
        <span className="min-w-0 flex-1 font-data text-small">
          <span
            className={`block truncate ${active ? "text-ink" : "text-ink-2"}`}
          >
            {name}
            {change.from ? (
              <span className="text-ink-3">
                {" "}
                ← {splitPath(change.from).name}
              </span>
            ) : null}
          </span>
          {dir ? (
            <span className="block truncate text-caption text-ink-3">
              {dir.replace(TRAILING_SLASH, "")}
            </span>
          ) : null}
        </span>
        {change.binary ? (
          <span className="shrink-0 font-data text-caption text-ink-3">
            {t("project.diff.binary")}
          </span>
        ) : (
          <ProjectDiffCount added={change.added} removed={change.removed} />
        )}
      </div>
    </Tooltip>
  );
}
