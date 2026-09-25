import { useTranslations } from "@renderer/i18n/use-translations";
import type { EditState } from "@renderer/stores/servers";
import type { Server, ServerChanges } from "@shared/servers";
import { Callout } from "../ui/callout";
import { ServerRowEdit } from "./server-row-edit";

export function ServerRowEditing({
  server,
  edit,
  addressEditable,
  onSubmit,
  onRename,
  onClose,
}: {
  server: Server;
  /** Shared by every row: only the row it names reads it. */
  edit: EditState;
  addressEditable: boolean;
  onSubmit: (changes: ServerChanges) => void;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  const mine = edit.status !== "idle" && edit.serverId === server.id;

  if (mine && edit.status === "done") {
    return (
      <div className="mt-5 pl-7">
        <Callout
          fix={
            edit.hostKeyDropped
              ? t("servers.edit.hostKeyDroppedFix")
              : undefined
          }
          onDismiss={onClose}
          tone={edit.hostKeyDropped ? "warn" : "ok"}
        >
          {edit.hostKeyDropped
            ? t("servers.edit.hostKeyDropped")
            : t("servers.edit.done")}
        </Callout>
      </div>
    );
  }

  return (
    <ServerRowEdit
      addressEditable={addressEditable}
      busy={mine && edit.status === "working"}
      error={mine && edit.status === "refused" ? edit.error : null}
      onCancel={onClose}
      onRename={onRename}
      onSubmit={onSubmit}
      server={server}
    />
  );
}
