import { since } from "@renderer/lib/format";
import type { GithubRepo } from "@shared/github";
import { GitBranch, Lock } from "lucide-react";

/** A never-pushed repository has no parsable date: it shows none. */
export function pushedSince(value: string): string {
  const at = Date.parse(value);

  return Number.isNaN(at) ? "" : since(at);
}

export function ProjectAddRepoRow({
  repo,
  picked,
  privateLabel,
  onPick,
}: {
  repo: GithubRepo;
  picked: boolean;
  privateLabel: string;
  onPick: () => void;
}) {
  return (
    <button
      aria-pressed={picked}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-fast ${
        picked ? "bg-raised" : "hover:bg-raised"
      }`}
      onClick={onPick}
      type="button"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {repo.private ? (
          <Lock
            aria-label={privateLabel}
            className="shrink-0 text-ink-3"
            size={12}
            strokeWidth={1.5}
          />
        ) : null}
        <span className="truncate font-data text-ink text-small">
          {repo.fullName}
        </span>
      </span>

      {repo.defaultBranch ? (
        <span className="hidden shrink-0 items-center gap-1 font-data text-caption text-ink-3 sm:flex">
          <GitBranch size={11} strokeWidth={1.5} />
          {repo.defaultBranch}
        </span>
      ) : null}

      <span className="shrink-0 text-caption text-ink-3 tabular-nums">
        {pushedSince(repo.pushedAt)}
      </span>
    </button>
  );
}
