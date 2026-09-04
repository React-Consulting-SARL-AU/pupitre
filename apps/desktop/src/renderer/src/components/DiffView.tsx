import type { FileChange, FileDiff, WorkingTree } from "@shared/contract";
import {
  AlertTriangle,
  Check,
  FileDiff as FileDiffIcon,
  FilePlus,
  FileX,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TERMINAL_FONT } from "../lib/completion";

/**
 * The working tree of a project, and the diff of the file you select.
 *
 * Read-only, deliberately and entirely: there is no staging, no discarding, no
 * editing. What this view is for is seeing what changed before restarting a
 * project or switching a branch — and the moment it could also write, every
 * misclick would cost someone their work, on a machine they are not looking at.
 * Editing happens in the Terminal tab, where you see what you are doing.
 */

const STAGE = {
  staged: { label: "staged", className: "text-ok" },
  unstaged: { label: "changed", className: "text-warn" },
  untracked: { label: "new", className: "text-accent-strong" },
} as const;

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

function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf("/");
  return cut === -1
    ? { dir: "", name: path }
    : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}

type Row = {
  kind: "meta" | "hunk" | "add" | "remove" | "context";
  text: string;
  /** Line numbers on each side, when the row has one. */
  before: number | null;
  after: number | null;
};

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * The patch, turned into rows with their line numbers.
 *
 * The numbers come from the hunk headers — the only place git states them — and
 * are then incremented per row. Anything before the first hunk is the file
 * header: kept, dimmed, because "new file mode" and "rename from" are exactly
 * what you want to read on those files.
 */
function parsePatch(patch: string): Row[] {
  const rows: Row[] = [];
  let before = 0;
  let after = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      before = Number.parseInt(hunk[1], 10);
      after = Number.parseInt(hunk[2], 10);
      inHunk = true;
      rows.push({ kind: "hunk", text: line, before: null, after: null });
      continue;
    }
    if (!inHunk) {
      // The last line of the split is empty when the patch ends with a newline.
      if (line.length > 0) {
        rows.push({ kind: "meta", text: line, before: null, after: null });
      }
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({
        kind: "add",
        text: line.slice(1),
        before: null,
        after: after++,
      });
    } else if (line.startsWith("-")) {
      rows.push({
        kind: "remove",
        text: line.slice(1),
        before: before++,
        after: null,
      });
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — git's own note, not a line of content.
      rows.push({ kind: "meta", text: line, before: null, after: null });
    } else if (line.length > 0 || rows.length > 0) {
      rows.push({
        kind: "context",
        text: line.startsWith(" ") ? line.slice(1) : line,
        before: before++,
        after: after++,
      });
    }
  }

  // A trailing empty context row is the split artefact, not a line of the file.
  const last = rows.at(-1);
  if (last && last.kind === "context" && last.text === "") {
    rows.pop();
  }
  return rows;
}

function Count({ added, removed }: { added: number; removed: number }) {
  if (added === 0 && removed === 0) {
    return null;
  }
  return (
    <span className="shrink-0 font-mono text-[10px] tabular-nums">
      {added > 0 ? <span className="text-ok">+{added}</span> : null}
      {added > 0 && removed > 0 ? " " : null}
      {removed > 0 ? <span className="text-danger">−{removed}</span> : null}
    </span>
  );
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
  const { dir, name } = splitPath(change.path);
  const Icon = iconFor(change);
  const stage = STAGE[change.stage];

  return (
    <button
      className={`flex w-full items-center gap-2 border-line border-b px-3 py-1.5 text-left last:border-b-0 ${
        active ? "bg-accent-veil" : "hover:bg-sunken"
      }`}
      onClick={onSelect}
      title={`${change.path} · ${change.code.trim() || change.code} · ${stage.label}`}
      type="button"
    >
      <Icon className={`shrink-0 ${stage.className}`} size={12} />
      {/*
        The file name first, the folder after it and dimmed. Written the other
        way round — as the path reads — a deep folder eats the width and every
        row truncates on the one word that tells them apart.
      */}
      <span className="min-w-0 flex-1 font-mono text-[11px]">
        <span
          className={`block truncate ${active ? "text-accent-strong" : "text-ink-2"}`}
        >
          {name}
          {change.from ? (
            <span className="text-ink-4"> ← {splitPath(change.from).name}</span>
          ) : null}
        </span>
        {dir ? (
          <span className="block truncate text-[10px] text-ink-4">
            {dir.replace(/\/$/, "")}
          </span>
        ) : null}
      </span>
      {change.binary ? (
        <span className="shrink-0 font-mono text-[10px] text-ink-4">bin</span>
      ) : (
        <Count added={change.added} removed={change.removed} />
      )}
    </button>
  );
}

function Patch({ diff }: { diff: FileDiff }) {
  const rows = useMemo(() => parsePatch(diff.patch), [diff.patch]);

  if (diff.binary) {
    return (
      <p className="p-6 text-center text-[12px] text-ink-4">
        Binary file — nothing to show line by line.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-[12px] text-ink-4">
        {diff.problem || "No textual change in this file."}
      </p>
    );
  }

  return (
    <div className="min-w-max">
      {diff.problem ? (
        <p className="flex items-center gap-1.5 border-warn/30 border-b bg-warn/10 px-3 py-1.5 font-mono text-[10px] text-warn">
          <AlertTriangle size={11} />
          {diff.problem}
        </p>
      ) : null}
      <table
        className="w-full border-collapse"
        style={{ fontFamily: TERMINAL_FONT, fontSize: 11.5 }}
      >
        <tbody>
          {rows.map((row, i) => {
            const background =
              row.kind === "add"
                ? "bg-ok/10"
                : row.kind === "remove"
                  ? "bg-danger/10"
                  : row.kind === "hunk"
                    ? "bg-sunken"
                    : "";
            const text =
              row.kind === "add"
                ? "text-ok"
                : row.kind === "remove"
                  ? "text-danger"
                  : row.kind === "hunk" || row.kind === "meta"
                    ? "text-ink-4"
                    : "text-ink-2";
            const sign =
              row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " ";

            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a patch is a sequence, its position IS its identity
              <tr className={background} key={i}>
                <td className="w-10 select-none border-line border-r px-1.5 text-right align-top text-[10px] text-ink-4 tabular-nums">
                  {row.before ?? ""}
                </td>
                <td className="w-10 select-none border-line border-r px-1.5 text-right align-top text-[10px] text-ink-4 tabular-nums">
                  {row.after ?? ""}
                </td>
                <td
                  className={`select-none pr-1 pl-2 text-center ${text} align-top`}
                >
                  {sign}
                </td>
                <td className={`whitespace-pre pr-4 ${text} align-top`}>
                  {row.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DiffView({
  project,
  onRead,
}: {
  project: string;
  /**
   * Called after every reading of the tree, so the header count next to the
   * project name does not stay behind while this view is up to date.
   */
  onRead?: () => void;
}) {
  const [tree, setTree] = useState<WorkingTree | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const patchPane = useRef<HTMLDivElement | null>(null);

  // Held in a ref, not in `load`'s dependencies: the caller passes an inline
  // arrow, so a new function on every render — depending on it would make the
  // effect below re-read the tree forever.
  const notify = useRef(onRead);
  notify.current = onRead;

  const load = useCallback(async () => {
    setLoadingTree(true);
    const read = await window.pupitre.gitWorkingTree(project);
    setTree(read);
    setLoadingTree(false);
    notify.current?.();
    // Keep the selected file across a refresh when it still has changes:
    // refreshing while reading a file should not throw you back to the list.
    setSelected((current) =>
      current && read?.files.some((f) => f.path === current)
        ? current
        : (read?.files[0]?.path ?? null)
    );
  }, [project]);

  useEffect(() => {
    setTree(null);
    setSelected(null);
    setDiff(null);
    load();
  }, [load]);

  const change = tree?.files.find((f) => f.path === selected) ?? null;

  useEffect(() => {
    if (!change) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setLoadingDiff(true);
    window.pupitre
      .gitFileDiff(project, change.path, change.stage === "untracked")
      .then((read) => {
        if (!cancelled) {
          setDiff(read);
          setLoadingDiff(false);
          patchPane.current?.scrollTo({ top: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project, change]);

  if (loadingTree && !tree) {
    return (
      <div className="grid h-full place-items-center text-ink-4">
        <span className="flex items-center gap-2 text-[12px]">
          <Loader2 className="animate-spin" size={13} />
          reading the working tree…
        </span>
      </div>
    );
  }

  if (!tree?.repo) {
    return (
      <div className="grid h-full place-items-center px-8 text-center text-ink-4">
        <div>
          <FileDiffIcon className="mx-auto mb-2" size={18} />
          <p className="text-[12px]">This project is not a git repository.</p>
          <p className="mt-1 font-mono text-[11px]">
            there is nothing to compare
          </p>
        </div>
      </div>
    );
  }

  const total = tree.files.reduce(
    (sum, f) => ({
      added: sum.added + f.added,
      removed: sum.removed + f.removed,
    }),
    { added: 0, removed: 0 }
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-line border-b px-4 py-2">
        <span className="font-mono text-[11px] text-ink-3">
          {tree.branch || "detached"}
          {tree.upstream ? (
            <span className="text-ink-4"> → {tree.upstream}</span>
          ) : null}
        </span>
        <span className="font-mono text-[11px] text-ink-4">
          {tree.files.length === 0
            ? "clean"
            : `${tree.files.length} file${tree.files.length > 1 ? "s" : ""}`}
        </span>
        <Count added={total.added} removed={total.removed} />
        <span
          className="ml-auto flex items-center gap-1 font-mono text-[10px] text-ink-4"
          title="This view never writes to the repository"
        >
          read-only
        </span>
        <button
          aria-label="Re-read the working tree"
          className="shrink-0 rounded-md border border-line p-1 text-ink-4 transition-soft hover:border-accent hover:text-accent-strong disabled:opacity-40"
          disabled={loadingTree}
          onClick={load}
          type="button"
        >
          <RefreshCw className={loadingTree ? "animate-spin" : ""} size={12} />
        </button>
      </div>

      {tree.files.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-ink-4">
          <div>
            <Check className="mx-auto mb-2 text-ok" size={18} />
            <p className="text-[12px]">
              Nothing changed since the last commit.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,17rem)_1fr]">
          <div className="min-h-0 overflow-y-auto border-line border-r">
            {(["staged", "unstaged", "untracked"] as const).map((stage) => {
              const group = tree.files.filter((f) => f.stage === stage);
              if (group.length === 0) {
                return null;
              }
              return (
                <div key={stage}>
                  <p
                    className={`sticky top-0 z-10 border-line border-b bg-base px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${STAGE[stage].className}`}
                  >
                    {STAGE[stage].label} · {group.length}
                  </p>
                  {group.map((file) => (
                    <FileRow
                      active={file.path === selected}
                      change={file}
                      key={file.path}
                      onSelect={() => setSelected(file.path)}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            {change ? (
              <p className="flex shrink-0 items-center gap-2 border-line border-b px-4 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
                  {change.path}
                </span>
                {change.binary ? null : (
                  <Count added={change.added} removed={change.removed} />
                )}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto" ref={patchPane}>
              {loadingDiff ? (
                <p className="flex items-center justify-center gap-2 p-6 text-[12px] text-ink-4">
                  <Loader2 className="animate-spin" size={13} />
                  reading the diff…
                </p>
              ) : diff ? (
                <Patch diff={diff} />
              ) : (
                <p className="p-6 text-center text-[12px] text-ink-4">
                  Select a file.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
