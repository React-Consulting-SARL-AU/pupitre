import { useTranslations } from "@renderer/i18n/use-translations";
import type { GithubRepo } from "@shared/github";
import { ArrowLeftRight, FolderGit2, GitBranch, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { pushedSince } from "./project-add-repo-row";

/**
 * The repository the reader settled on, read where the list used to be.
 *
 * Once a repository is chosen the list has done its work: what stays is the
 * one line that matters — the name, whether it is private, the branch it
 * opens on — and the way back to the list for a reader who changes their mind.
 */
export function ProjectAddRepoPicked({
  repo,
  onChange,
}: {
  repo: GithubRepo;
  /** Brings the search back, the choice standing until another is made. */
  onChange: () => void;
}) {
  const t = useTranslations();

  const pushed = pushedSince(repo.pushedAt);

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-line bg-sunken px-3 py-2.5"
      data-repo={repo.fullName}
    >
      <FolderGit2
        aria-hidden="true"
        className="shrink-0 text-ink-3"
        size={13}
        strokeWidth={1.5}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-data text-[12px] text-ink">
            {repo.fullName}
          </span>
          {repo.private ? (
            <Lock
              aria-label={t("projectAdd.github.private")}
              className="shrink-0 text-ink-3"
              size={11}
              strokeWidth={1.5}
            />
          ) : null}
        </span>

        <span className="flex items-center gap-3 text-[11px] text-ink-3">
          {repo.defaultBranch ? (
            <span className="inline-flex items-center gap-1 font-data">
              <GitBranch aria-hidden="true" size={11} strokeWidth={1.5} />
              {repo.defaultBranch}
            </span>
          ) : null}
          {pushed ? <span className="tabular-nums">{pushed}</span> : null}
        </span>
      </div>

      <Button
        icon={ArrowLeftRight}
        onClick={onChange}
        size="sm"
        variant="discreet"
      >
        {t("projectAdd.github.change")}
      </Button>
    </div>
  );
}
