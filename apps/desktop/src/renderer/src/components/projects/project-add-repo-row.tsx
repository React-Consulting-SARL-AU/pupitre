import { since } from "@renderer/lib/format";
import type { GithubRepo } from "@shared/github";
import { GitBranch, Lock } from "lucide-react";

/** A repository that has never been pushed to has no date to show, and shows none. */
export function pushedSince(value: string): string {
  const at = Date.parse(value);

  return Number.isNaN(at) ? "" : since(at);
}

/**
 * One repository of the connected account, as it is picked.
 *
 * Four things decide: the full name, whether it is private — which is what
 * costs a module on the server — the branch it opens on, and the day it last
 * moved, because that is how a reader finds the one they were working in.
 */
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
        <span className="truncate font-data text-[12px] text-ink">
          {repo.fullName}
        </span>
      </span>

      {repo.defaultBranch ? (
        <span className="hidden shrink-0 items-center gap-1 font-data text-[11px] text-ink-3 sm:flex">
          <GitBranch size={11} strokeWidth={1.5} />
          {repo.defaultBranch}
        </span>
      ) : null}

      <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
        {pushedSince(repo.pushedAt)}
      </span>
    </button>
  );
}
