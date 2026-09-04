import type { GitStatus } from "@shared/contract";
import {
  ArrowDownToLine,
  GitBranch,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "./ui/button";
import { Callout } from "./ui/callout";
import { IconButton } from "./ui/icon-button";
import { StatusDot } from "./ui/status-dot";

/**
 * What the repositories have more of than the server, shown before acting.
 *
 * A project restarted without being updated comes back on yesterday's code, and
 * nothing on screen said so. The gap is therefore visible where you arrive — the
 * dashboard — and not in a tab you would have to remember to open.
 */
export type RepoBehind = { status: GitStatus; projects: string[] };

/**
 * A repository behind, not a project.
 *
 * The API and the client of the same repository are two projects and a single
 * `.git`: counting them twice would announce two gaps where a single pull erases
 * both.
 */
export function behind(git: Record<string, GitStatus>): RepoBehind[] {
  const repos = new Map<string, RepoBehind>();
  for (const status of Object.values(git)) {
    if (!(status.repo && status.behind > 0)) {
      continue;
    }
    const known = repos.get(status.root);
    if (known) {
      known.projects.push(status.project);
    } else {
      repos.set(status.root, { status, projects: [status.project] });
    }
  }
  return [...repos.values()].sort((a, b) => b.status.behind - a.status.behind);
}

export function unreachable(git: Record<string, GitStatus>): GitStatus[] {
  return Object.values(git).filter((s) => s.repo && s.problem);
}

export function timeAgo(timestampMs: number): string {
  const seconds = Math.max(0, (Date.now() - timestampMs) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min ago`;
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)} h ago`;
  }
  return `${Math.round(seconds / 86_400)} d ago`;
}

function commits(n: number): string {
  return `${n} commit${n > 1 ? "s" : ""}`;
}

function checkLabel(busy: boolean, checkedAt: number | null): string {
  if (busy) {
    return "querying repositories…";
  }
  if (checkedAt) {
    return `repositories checked ${timeAgo(checkedAt)}`;
  }
  return "check repositories";
}

export function CheckButton({
  busy,
  checkedAt,
  onCheck,
}: {
  busy: boolean;
  checkedAt: number | null;
  onCheck: () => void;
}) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-sm font-data text-[10px] text-ink-3 transition-soft hover:text-ink disabled:opacity-60"
      disabled={busy}
      onClick={onCheck}
      type="button"
    >
      {busy ? (
        <StatusDot shape="breathing" size={11} />
      ) : (
        <RefreshCw size={11} strokeWidth={1.5} />
      )}
      {checkLabel(busy, checkedAt)}
    </button>
  );
}

type Props = {
  git: Record<string, GitStatus>;
  busyProject: string | null;
  busy: boolean;
  onPull: (project: string) => void;
  onPullAll: () => void;
  onSelect: (name: string) => void;
};

export function Repos({
  git,
  busyProject,
  busy,
  onPull,
  onPullAll,
  onSelect,
}: Props) {
  const late = behind(git);
  const silent = unreachable(git);

  if (late.length === 0) {
    if (silent.length === 0) {
      return null;
    }
    return (
      <div className="mt-5">
        <Callout fix={silent[0].problem} tone="warn">
          {silent.length} repositor{silent.length > 1 ? "ies" : "y"} unreachable
          from the server
        </Callout>
      </div>
    );
  }

  const clean = late.filter((d) => !d.status.dirty);

  return (
    <section className="mt-5 animate-[fade-in_200ms_ease-out] rounded-md border border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowDownToLine className="text-ink-2" size={14} strokeWidth={1.5} />
        <h2 className="font-semibold text-[13px] text-ink">
          {late.length === 1
            ? "One repository has commits to pull"
            : `${late.length} repositories have commits to pull`}
        </h2>
        {clean.length > 1 ? (
          <Button
            className="ml-auto"
            disabled={busy || busyProject !== null}
            icon={ArrowDownToLine}
            onClick={onPullAll}
            variant="inverse"
          >
            Pull all
          </Button>
        ) : null}
      </div>

      <ul className="mt-3 divide-y divide-line">
        {late.map(({ status, projects }) => (
          <li
            className="flex flex-wrap items-center gap-3 py-2"
            key={status.root}
          >
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect(status.project)}
              type="button"
            >
              <p className="truncate font-medium text-[12px] text-ink hover:underline">
                {projects.join(", ")}
                <span className="ml-2 font-data font-semibold text-[11px] text-ink tabular-nums">
                  {commits(status.behind)}
                </span>
              </p>
              <p className="truncate font-data text-[11px] text-ink-3">
                <GitBranch
                  className="mr-1 inline"
                  size={10}
                  strokeWidth={1.5}
                />
                {status.current} ← {status.upstream}
                {status.subject ? ` · ${status.subject}` : ""}
              </p>
            </button>

            {status.dirty ? (
              <span
                className="flex items-center gap-1 font-data text-[10px] text-warn"
                title="Uncommitted changes live in this folder"
              >
                <TriangleAlert size={11} strokeWidth={1.5} />
                uncommitted
              </span>
            ) : null}

            <Button
              disabled={busyProject === status.project || busy}
              icon={ArrowDownToLine}
              onClick={() => onPull(status.project)}
              size="sm"
            >
              Pull
            </Button>
          </li>
        ))}
      </ul>

      <p className="mt-2 font-data text-[10px] text-ink-3">
        fast-forward only — a running project keeps its old code until you
        restart it
      </p>
    </section>
  );
}

/**
 * The same gap, on a project's page.
 *
 * It sits under the branch selector because that is where you look for it: right
 * after switching, when the branch you have just taken does not have a single
 * recent commit.
 */
export function RepoState({
  status,
  busyProject,
  busy,
  onPull,
  onCheck,
}: {
  status: GitStatus | null;
  busyProject: boolean;
  busy: boolean;
  onPull: () => void;
  onCheck: () => void;
}) {
  if (!status?.repo) {
    return null;
  }

  if (status.problem) {
    return (
      <div className="mt-2">
        <Callout tone="warn">{status.problem}</Callout>
      </div>
    );
  }

  if (!status.upstream) {
    return (
      <p className="mt-2 font-data text-[11px] text-ink-3">
        no remote branch tracked
      </p>
    );
  }

  return (
    <div className="mt-2.5 rounded-sm border border-line bg-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-data text-[11px] ${status.behind > 0 ? "font-semibold text-ink" : "text-ink-3"}`}
        >
          {status.behind > 0
            ? `${commits(status.behind)} to pull`
            : `up to date with ${status.upstream}`}
          {status.ahead > 0 ? ` · ${commits(status.ahead)} to push` : ""}
          {status.changed > 0
            ? ` · ${status.changed} local change${status.changed > 1 ? "s" : ""}`
            : ""}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            icon={RefreshCw}
            label="Query the remote repository"
            loading={busy}
            onClick={onCheck}
            size={12}
          />
          {status.behind > 0 ? (
            <Button
              disabled={busyProject || busy}
              icon={ArrowDownToLine}
              onClick={onPull}
              size="sm"
              variant="inverse"
            >
              Pull
            </Button>
          ) : null}
        </div>
      </div>

      {status.behind > 0 && status.subject ? (
        <p className="mt-1 truncate font-data text-[10px] text-ink-3">
          latest: {status.subject}
        </p>
      ) : null}
    </div>
  );
}
