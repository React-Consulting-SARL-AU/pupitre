import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import type { RemoteEditor } from "@shared/editors";

/**
 * What the menu of an entry offers, decided once and drawn twice — from the
 * button on the row and from a right click on it.
 *
 * A terminal opens in a folder and nowhere else; an editor of this computer
 * opens a folder or a file, and only an editor the server installed is
 * offered. A file or a folder comes to this computer on its own transfer.
 * Deleting comes last, behind a separator, as every destructive gesture does.
 */

export type FileActionId =
  | "open"
  | "editor"
  | "terminal"
  | "download"
  | "rename"
  | "copy"
  | "remove";

export interface FileAction {
  id: FileActionId;
  editor?: RemoteEditor;
  /** For a download: whether a folder is asked for, which changes the dialog. */
  folder?: boolean;
}

export function entryActions(
  entry: Pick<FileEntry, "kind">,
  editors: readonly RemoteEditor[]
): FileAction[] {
  return [
    { id: "open" },
    ...editors.map((editor): FileAction => ({ editor, id: "editor" })),
    ...(entry.kind === "dir" ? [{ id: "terminal" } as FileAction] : []),
    { folder: entry.kind === "dir", id: "download" },
    { id: "rename" },
    { id: "copy" },
    { id: "remove" },
  ];
}
