import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import type { RemoteEditor } from "@shared/editors";

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
  folder?: boolean;
}

export function entryActions(
  entry: Pick<FileEntry, "kind">,
  editors: readonly RemoteEditor[]
): FileAction[] {
  // A read on a pipe, socket or device would wait forever.
  if (entry.kind === "special") {
    return [{ id: "rename" }, { id: "remove" }];
  }

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
