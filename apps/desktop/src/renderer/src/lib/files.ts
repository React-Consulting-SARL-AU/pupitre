import type { FileEntry } from "@pupitre/shared/agent-protocol/files";

/**
 * Paths as the file commands take them: relative to the one root the agent
 * holds, the empty string naming that root. Nothing here reads the disk.
 */

export type FileSort = "name" | "date";

export const FILE_SORTS: readonly FileSort[] = ["name", "date"];

export function isFileSort(value: unknown): value is FileSort {
  return typeof value === "string" && FILE_SORTS.includes(value as FileSort);
}

/** Two path pieces joined, either of which may be the root and name nothing. */
export function under(path: string, name: string): string {
  return [path, name].filter(Boolean).join("/");
}

export function crumbsOf(path: string): string[] {
  return path.length === 0 ? [] : path.split("/");
}

export function parentOf(path: string): string {
  return crumbsOf(path).slice(0, -1).join("/");
}

export function nameOf(path: string): string {
  return crumbsOf(path).at(-1) ?? "";
}

/**
 * A path under a root, as the root sees it: `projects/atlas/src` under
 * `projects/atlas` is `src`, and the root itself is the empty string. It reads
 * an absolute path under an absolute root the same way. A path that is not
 * under the root answers nothing rather than a guess.
 */
export function within(root: string, path: string): string | null {
  if (root.length === 0) {
    return path;
  }

  if (path === root) {
    return "";
  }

  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

/** The absolute place of a relative path, from the root the agent named. */
export function absoluteOf(root: string, path: string): string {
  return path.length === 0 ? root : `${root}/${path}`;
}

/** What lies above the folder the agent names, or nothing for a bare name. */
export function dirnameOf(absolute: string): string {
  const at = absolute.lastIndexOf("/");

  return at <= 0 ? "/" : absolute.slice(0, at);
}

export function isHidden(entry: Pick<FileEntry, "name">): boolean {
  return entry.name.startsWith(".");
}

export function isFolder(entry: Pick<FileEntry, "kind">): boolean {
  return entry.kind === "dir";
}

function byName(left: FileEntry, right: FileEntry): number {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function byDate(left: FileEntry, right: FileEntry): number {
  return (
    right.modified_at.localeCompare(left.modified_at) || byName(left, right)
  );
}

/** Folders first, then files, each in the order asked; hidden ones only on request. */
export function sortedEntries(
  entries: readonly FileEntry[],
  sort: FileSort,
  hidden: boolean
): FileEntry[] {
  const compare = sort === "date" ? byDate : byName;

  return entries
    .filter((entry) => hidden || !isHidden(entry))
    .sort((left, right) => {
      const rank = Number(isFolder(right)) - Number(isFolder(left));

      return rank || compare(left, right);
    });
}

const LAST_COUNT = /(\d+)(?!.*\d)/;

/** The last count an agent's refusal names, when it names one: how many entries a folder holds. */
export function heldCount(message: string): number | null {
  const found = message.match(LAST_COUNT);

  return found ? Number(found[1]) : null;
}

const NAME_OK = /^[^/\0]+$/;

/** One entry name: never empty, never a path, never the folder itself or the one above. */
export function isEntryName(value: string): boolean {
  return NAME_OK.test(value) && value !== "." && value !== "..";
}
