import { useTranslations } from "@renderer/i18n/use-translations";
import type { FileAction } from "@renderer/lib/file-actions";
import { absoluteOf, parentOf, within } from "@renderer/lib/files";
import { useFiles } from "@renderer/stores/files";
import { useTransfers } from "@renderer/stores/transfers";
import type { RemoteEditor } from "@shared/editors";
import type { Transfer } from "@shared/transfers";
import { useEffect } from "react";
import { FileList } from "./file-list";
import { FilePreview } from "./file-preview";

function landed(now: Transfer[], before: Transfer[]): Transfer[] {
  const earlier = new Map(before.map((one) => [one.id, one.status]));

  return now.filter(
    (one) =>
      one.direction === "upload" &&
      one.status === "done" &&
      earlier.get(one.id) !== "done"
  );
}

export function FileBrowser({
  serverId,
  root,
  rootLabel,
  editors,
  onTerminal,
}: {
  serverId: string;
  root: string | null;
  rootLabel: string;
  editors: readonly RemoteEditor[];
  onTerminal: (dir: string) => void;
}) {
  const t = useTranslations();

  const store = useFiles();
  const open = store.open;
  const refresh = store.refresh;
  const pickAndUpload = useTransfers((state) => state.pickAndUpload);
  const dropAndUpload = useTransfers((state) => state.dropAndUpload);
  const pickAndDownload = useTransfers((state) => state.pickAndDownload);

  useEffect(() => {
    open(serverId, root);
  }, [serverId, root, open]);

  useEffect(
    () =>
      useTransfers.subscribe((state, previous) => {
        const shown = useFiles.getState().listing;

        if (
          shown.status === "read" &&
          landed(state.transfers, previous.transfers).some(
            (one) =>
              one.serverId === serverId &&
              parentOf(one.remotePath) === shown.path
          )
        ) {
          refresh();
        }
      }),
    [serverId, refresh]
  );

  const preview = store.preview;
  const selected = preview.status === "idle" ? null : preview.path;

  // Store paths are relative to the agent's root: editors get them absolute, terminals within the browser's root.
  function act(path: string, action: FileAction): void {
    if (action.id === "copy" && store.workRoot !== null) {
      navigator.clipboard.writeText(absoluteOf(store.workRoot, path));
    } else if (action.id === "editor" && action.editor && store.workRoot) {
      window.pupitre.openInEditor(
        serverId,
        action.editor.id,
        absoluteOf(store.workRoot, path)
      );
    } else if (action.id === "terminal" && store.root !== null) {
      const dir = within(store.root, path);

      if (dir) {
        onTerminal(dir);
      }
    } else if (action.id === "download") {
      pickAndDownload(serverId, path, action.folder ? "dir" : "file");
    }
  }

  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(280px,2fr)_3fr] gap-6 px-8 py-5"
      data-files-root={store.root ?? ""}
    >
      <FileList
        editors={editors}
        hidden={store.hidden}
        listing={store.listing}
        onAct={act}
        onBrowse={(path) => store.browse(serverId, path)}
        onDismiss={store.dismiss}
        onDrop={async (dir, files) => {
          await dropAndUpload(serverId, dir, files);
        }}
        onHidden={store.setHidden}
        onMakeFile={(name) => store.makeFile(serverId, name)}
        onMakeFolder={(name) => store.makeFolder(serverId, name)}
        onRefresh={store.refresh}
        onRemove={(path, recursive) => store.remove(serverId, path, recursive)}
        onRename={(path, to) => store.rename(serverId, path, to)}
        onShow={(path) => store.show(serverId, path)}
        onSort={store.setSort}
        onUpload={async (dir) => {
          await pickAndUpload(serverId, dir);
        }}
        problem={store.problem}
        removal={store.removal}
        rootLabel={rootLabel}
        selected={selected}
        sort={store.sort}
      />

      <section aria-label={t("files.preview.pane")} className="min-h-0">
        <FilePreview
          draft={store.draft}
          leaving={store.leaving !== null}
          onClose={store.close}
          onConfirmLeave={store.confirmLeave}
          onDownload={async () => {
            if (preview.status !== "idle") {
              await pickAndDownload(serverId, preview.path, "file");
            }
          }}
          onEdit={store.edit}
          onReread={() => store.reread(serverId)}
          onSave={() => store.save(serverId)}
          onShow={(path) => store.show(serverId, path)}
          onStay={store.stay}
          onView={store.setView}
          preview={preview}
          view={store.view}
          write={store.write}
        />
      </section>
    </div>
  );
}
