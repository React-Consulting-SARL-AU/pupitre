import type { GitStatus } from "@shared/contract";
import {
  AlertTriangle,
  ArrowDownToLine,
  GitBranch,
  RefreshCw,
} from "lucide-react";

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
      className="flex items-center gap-1.5 font-mono text-[10px] text-ink-4 transition-soft hover:text-accent-strong disabled:opacity-60"
      disabled={busy}
      onClick={onCheck}
      type="button"
    >
      <RefreshCw className={busy ? "animate-spin" : ""} size={11} />
      {busy
        ? "querying repositories…"
        : checkedAt
          ? `repositories checked ${timeAgo(checkedAt)}`
          : "check repositories"}
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
    return silent.length === 0 ? null : (
      <p className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] text-ink-3">
        <AlertTriangle className="shrink-0 text-warn" size={13} />
        {silent.length} repositor{silent.length > 1 ? "ies" : "y"} unreachable
        from the server —{" "}
        <span className="font-mono text-[11px] text-ink-4">
          {silent[0].problem}
        </span>
      </p>
    );
  }

  const clean = late.filter((d) => !d.status.dirty);

  return (
    <section className="mt-5 animate-[fade-in_200ms_ease-out] rounded-xl border border-accent/35 bg-accent-veil p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowDownToLine
          className="text-accent-strong"
          size={14}
          strokeWidth={2}
        />
        <h2 className="font-semibold text-[13px]">
          {late.length === 1
            ? "One repository has commits to pull"
            : `${late.length} repositories have commits to pull`}
        </h2>
        {clean.length > 1 ? (
          <button
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-semibold text-[12px] text-base transition-soft hover:bg-accent-strong disabled:opacity-40"
            disabled={busy || busyProject !== null}
            onClick={onPullAll}
            type="button"
          >
            <ArrowDownToLine size={13} strokeWidth={2} />
            Pull all
          </button>
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
              <p className="truncate font-medium text-[12px] hover:text-accent-strong">
                {projects.join(", ")}
                <span className="ml-2 font-mono text-[11px] text-accent-strong">
                  {commits(status.behind)}
                </span>
              </p>
              <p className="truncate font-mono text-[11px] text-ink-4">
                <GitBranch className="mr-1 inline" size={10} />
                {status.current} ← {status.upstream}
                {status.subject ? ` · ${status.subject}` : ""}
              </p>
            </button>

            {status.dirty ? (
              <span
                className="flex items-center gap-1 font-mono text-[10px] text-warn"
                title="Uncommitted changes live in this folder"
              >
                <AlertTriangle size={11} />
                uncommitted
              </span>
            ) : null}

            <button
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1 text-[11px] transition-soft hover:border-accent hover:text-accent-strong disabled:opacity-40"
              disabled={busyProject === status.project || busy}
              onClick={() => onPull(status.project)}
              type="button"
            >
              <ArrowDownToLine size={12} strokeWidth={2} />
              Pull
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 font-mono text-[10px] text-ink-4">
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
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warn">
        <AlertTriangle className="mt-px shrink-0" size={12} />
        <span className="min-w-0 font-mono">{status.problem}</span>
      </p>
    );
  }

  if (!status.upstream) {
    return (
      <p className="mt-2 font-mono text-[11px] text-ink-4">
        no remote branch tracked
      </p>
    );
  }

  return (
    <div className="mt-2.5 rounded-lg border border-line bg-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-mono text-[11px] ${status.behind > 0 ? "text-accent-strong" : "text-ink-4"}`}
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
          <button
            aria-label="Query the remote repository"
            className="rounded-md border border-line p-1 text-ink-4 transition-soft hover:border-accent hover:text-accent-strong disabled:opacity-40"
            disabled={busy}
            onClick={onCheck}
            type="button"
          >
            <RefreshCw className={busy ? "animate-spin" : ""} size={12} />
          </button>
          {status.behind > 0 ? (
            <button
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-semibold text-[11px] text-base transition-soft hover:bg-accent-strong disabled:opacity-40"
              disabled={busyProject || busy}
              onClick={onPull}
              type="button"
            >
              <ArrowDownToLine size={12} strokeWidth={2} />
              Pull
            </button>
          ) : null}
        </div>
      </div>

      {status.behind > 0 && status.subject ? (
        <p className="mt-1 truncate font-mono text-[10px] text-ink-4">
          latest: {status.subject}
        </p>
      ) : null}
    </div>
  );
}
