import type { FileEntry } from "@pupitre/shared/agent-protocol/files";

// Paths are relative to the agent's root, and the empty string names the root itself.

export type FileSort = "name" | "date";

export const FILE_SORTS: readonly FileSort[] = ["name", "date"];

export function isFileSort(value: unknown): value is FileSort {
  return typeof value === "string" && FILE_SORTS.includes(value as FileSort);
}

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

export function within(root: string, path: string): string | null {
  if (root.length === 0) {
    return path;
  }

  if (path === root) {
    return "";
  }

  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

export function absoluteOf(root: string, path: string): string {
  return path.length === 0 ? root : `${root}/${path}`;
}

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

export type RenderedForm = "markdown" | "svg";

const RENDERED_FORMS: Record<string, RenderedForm> = {
  markdown: "markdown",
  md: "markdown",
  svg: "svg",
};

export function renderedFormOf(path: string): RenderedForm | null {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");

  if (dot <= 0) {
    return null;
  }

  return RENDERED_FORMS[name.slice(dot + 1).toLowerCase()] ?? null;
}

const NAME_OK = /^[^/\0]+$/;

export function isEntryName(value: string): boolean {
  return NAME_OK.test(value) && value !== "." && value !== "..";
}
